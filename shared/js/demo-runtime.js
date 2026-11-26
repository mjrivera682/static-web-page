// Common entry point for every demo page.
// Usage in a demo's index.html:
//   <main id="demo" data-config="./demo.config.json"></main>
//   <script type="module" src="../../shared/js/demo-runtime.js"></script>
//
// Sequence (Web Push enabled): load SDK → permission (opt-in button, user gesture)
// → indigitall.init → device registered (Device ID) → form unlocked → lead flow.

import { validateConfig, APP_KEY_PLACEHOLDER } from './config.js';
import { createIndigitallClient, loadScript } from './indigitall-client.js';
import { createSdkSimulator } from './sdk-simulator.js';
import { createGuard } from './guard.js';
import { createDiagnostics, maskValue, maskId } from './diagnostics.js';
import { renderForm } from './form-renderer.js';
import { runLeadFlow, createIdentityStore } from './lead-flow.js';
import { PUSH_STATES, browserPermissions, simulatedPermissions, renderOptIn } from './push-optin.js';
import {
  resetCustomerSession, resetIntegration, succeeded, permissionResetInstructions,
  SDK_LOCAL_PREFIX, SDK_SESSION_PREFIX, SDK_IDB_NAME,
} from './reset.js';

const STEP_LABEL = {
  device: 'Primero activa las notificaciones (paso 1).',
  identify: 'No pudimos identificar tu perfil.',
  setFields: 'No pudimos guardar tus datos.',
  verify: 'No pudimos confirmar que tus datos se guardaron.',
  sendEvent: 'Tus datos se guardaron, pero no pudimos registrar la solicitud.',
  prepare: 'No pudimos preparar la solicitud.',
};

function h(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

function fatal(root, message, details = []) {
  root.replaceChildren(h('div', { class: 'notice notice-error', role: 'alert' }, message));
  if (details.length) {
    const ul = h('ul', { class: 'notice-details' });
    for (const d of details) ul.appendChild(h('li', {}, d));
    root.appendChild(ul);
  }
}

const SDK_DIR = '../../indigitall/';
// Earlier builds served a second SDK copy from <site>/vendor/indigitall/<version>/.
// Unregister only those registrations; other Service Workers on the origin (other
// GitHub Pages sites of the same account) are never touched.
const OLD_WORKER_PREFIX = new URL('../../vendor/indigitall/', import.meta.url).pathname;

async function migrateServiceWorkers(diag) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const script = [r.active, r.waiting, r.installing].find(Boolean)?.scriptURL;
      if (script && new URL(script).pathname.startsWith(OLD_WORKER_PREFIX)) {
        const ok = await r.unregister();
        diag.info('Old Service Worker unregistered', { scope: new URL(r.scope).pathname, status: ok ? 'ok' : 'failed' });
      }
    }
  } catch (err) {
    diag.info('Service Worker migration skipped', { message: String(err.message ?? err) });
  }
}

async function describeServiceWorker(workerPath) {
  if (!('serviceWorker' in navigator)) return { sw: 'unsupported' };
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const ours = regs.find((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL?.endsWith(workerPath)));
    const others = regs.filter((r) => r !== ours).map((r) => new URL(r.scope).pathname);
    const worker = ours?.active ?? ours?.waiting ?? ours?.installing;
    return {
      sw: ours ? `${worker?.state ?? 'registered'} · scope ${new URL(ours.scope).pathname}` : 'not registered',
      swOthers: others.length ? others.join(', ') : 'none',
    };
  } catch (err) {
    return { sw: `error: ${err.message ?? err}` };
  }
}

async function main() {
  const root = document.getElementById('demo');
  if (!root) return;
  const params = new URLSearchParams(location.search);

  let config;
  try {
    const res = await fetch(new URL(root.dataset.config ?? './demo.config.json', location.href), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    config = await res.json();
  } catch (err) {
    fatal(root, 'No se pudo cargar la configuración de la demo.', [String(err.message ?? err)]);
    return;
  }

  // The URL can only downgrade to dry-run, never upgrade to live.
  if (params.get('mode') === 'dry-run') config.mode = 'dry-run';
  const problems = validateConfig(config);
  if (problems.length) {
    fatal(root, 'La configuración de la demo no es válida.', problems);
    return;
  }

  const ind = config.indigitall;
  const dryRun = config.mode === 'dry-run' || ind.appKey === APP_KEY_PLACEHOLDER;
  const debugParam = config.diagnostics?.queryParam ?? 'debug';
  const debug = params.has(debugParam) && params.get(debugParam) !== '0';
  // Single SDK copy for the whole site: /indigitall/sdk.min.js + /indigitall/worker.min.js
  // (official local-files layout), resolved under the GitHub Pages subdirectory.
  const sdkUrl = new URL(SDK_DIR + 'sdk.min.js', import.meta.url).href;
  const workerPath = new URL(SDK_DIR + 'worker.min.js', import.meta.url).pathname;

  document.title = config.title ?? document.title;
  const panel = debug ? createPanel() : null;
  const diag = createDiagnostics({ enabled: debug, onEntry: (entry, state) => panel?.update(entry, state) });
  diag.set({ mode: dryRun ? 'dry-run' : 'live', sdkDeclaredVersion: ind.sdkVersion });

  if (dryRun) {
    root.appendChild(h('div', { class: 'notice notice-info' },
      'Modo de prueba: no se envía nada a indigitall. Los datos solo se simulan en este navegador.'));
  }

  const optInHost = h('div');
  const formHost = h('div');
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  root.append(optInHost, formHost, status);
  const ui = renderForm(document, formHost, config);
  ui.setLocked(true);

  // --- SDK --------------------------------------------------------------------
  let getSdk;
  let permissions;
  if (dryRun) {
    // ?simulate-permission=granted|denied|dismissed|blocked|already-granted
    const p = params.get('simulate-permission') ?? 'granted';
    const initial = p === 'blocked' ? 'denied' : p === 'already-granted' ? 'granted' : 'default';
    const answer = p === 'dismissed' ? 'default' : p === 'already-granted' ? 'granted' : p === 'blocked' ? 'denied' : p;
    const failMethod = params.get('simulate-fail');
    const sim = createSdkSimulator({
      permission: initial,
      fail: failMethod ? { [failMethod]: { errorMessage: 'simulated failure' } } : {},
    });
    getSdk = () => sim;
    permissions = simulatedPermissions({ initial, answer, sdk: sim });
    diag.set({ sdk: 'simulator' });
  } else {
    getSdk = () => window.indigitall;
    permissions = browserPermissions();
    diag.set({ sdk: 'loading' });
    try {
      await diag.step('loadSdk', { version: ind.sdkVersion },
        () => loadScript(sdkUrl));
      diag.set({ sdk: 'loaded' });
    } catch {
      diag.set({ sdk: 'error' });
      fatal(root, 'No se pudo cargar el SDK de indigitall. Inténtalo más tarde.');
      return;
    }
  }

  const client = createIndigitallClient({
    getSdk,
    settings: { ...ind, workerPath, logLevel: debug ? 'DEBUG' : (ind.logLevel ?? 'ERROR') },
    timeoutMs: config.flow?.operationTimeoutMs ?? 10000,
    registrationTimeoutMs: config.flow?.registrationTimeoutMs ?? 30000,
    onSdkError: (msg) => diag.info('SDK onError', typeof msg === 'string' ? { message: msg } : msg),
  });
  diag.set({ sdkVersion: client.version(), swUrl: client.pushEnabled ? workerPath : 'not used (push disabled)' });
  if (!dryRun && client.version() && client.version() !== ind.sdkVersion) {
    diag.info('SDK version mismatch', { declared: ind.sdkVersion, loaded: client.version() });
  }
  if (client.pushEnabled && !dryRun) await migrateServiceWorkers(diag);

  const guard = createGuard({ scope: config.slug, cooldownSeconds: config.guard?.cooldownSeconds ?? 0, storage: window.localStorage });
  const identityStore = createIdentityStore({ scope: config.slug, storage: window.localStorage });

  // --- Reset actions (diagnostics only). Wired before registration so they also
  // work when init fails (REGISTRATION_FAILED / HTTP 403) or never completes.
  if (panel) {
    const resultKey = `demo.${config.slug}.lastReset`;
    const persist = (title, results) => {
      try { sessionStorage.setItem(resultKey, JSON.stringify({ title, results, at: new Date().toISOString() })); } catch { /* ignore */ }
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(resultKey) ?? 'null');
      if (saved) { panel.showResults(saved.title, saved.results, { afterReload: true }); sessionStorage.removeItem(resultKey); }
    } catch { /* ignore */ }

    panel.setActions({
      async session() {
        const title = 'Nueva sesión de cliente';
        panel.showResults(title, [{ step: '…', status: 'running', detail: 'en curso' }]);
        const results = await resetCustomerSession({ client, guard, identityStore });
        diag.info('Reset: customer session', { status: succeeded(results) ? 'ok' : 'failed' });
        if (succeeded(results)) { persist(title, results); location.reload(); } else panel.showResults(title, results);
      },
      async integration() {
        const title = 'Reiniciar integración SDK';
        const proceed = window.confirm([
          'Reiniciar integración SDK en este navegador:',
          '· unlink del cliente (si hay sesión válida)',
          `· suscripción push y Service Worker de ${workerPath}`,
          `· localStorage "${SDK_LOCAL_PREFIX}*", sessionStorage "${SDK_SESSION_PREFIX}*", IndexedDB "${SDK_IDB_NAME}"`,
          `· estado de la demo "demo.${config.slug}.*"`,
          '',
          'Los datos del SDK de indigitall son por dominio: otra web de mjrivera682.github.io que use este SDK compartiría esas claves. No se toca nada más. ¿Continuar?',
        ].join('\n'));
        if (!proceed) return;
        panel.showResults(title, [{ step: '…', status: 'running', detail: 'en curso' }]);
        const results = await resetIntegration({
          client, guard, identityStore, workerPath, slug: config.slug,
          env: {
            localStorage: window.localStorage, sessionStorage: window.sessionStorage,
            indexedDB: window.indexedDB, serviceWorker: navigator.serviceWorker, document,
          },
        });
        diag.info('Reset: SDK integration', { status: succeeded(results) ? 'ok' : 'failed' });
        if (succeeded(results)) { persist(title, results); location.reload(); } else panel.showResults(title, results, { offerReload: true });
      },
      permission() {
        panel.showPermissionHelp(permissions.state(), permissionResetInstructions(navigator.userAgent));
      },
    });
  }

  // --- Web Push opt-in and device registration -------------------------------
  const optIn = client.pushEnabled ? renderOptIn(document, optInHost) : null;
  const setPush = (state) => {
    optIn?.set(state);
    diag.set({ permission: permissions.state() });
  };

  async function startRegistration() {
    setPush(PUSH_STATES.REGISTERING);
    diag.set({ init: 'initializing', device: client.pushEnabled ? 'registering' : 'not used' });
    try {
      const { deviceId, permissions: perms } = await diag.step('init', { pushMode: ind.pushMode, workerPath }, () => client.init());
      diag.set({
        init: 'initialized',
        device: client.pushEnabled ? 'registered' : 'not used',
        deviceId: deviceId ? maskId(deviceId) : null,
        permission: perms?.push ?? permissions.state(),
      });
      setPush(PUSH_STATES.REGISTERED);
      ui.setLocked(false);
    } catch (err) {
      const denied = err.code === 'PUSH_PERMISSION_DENIED';
      diag.set({ init: denied ? 'stopped (permission denied)' : 'error', device: denied ? 'not registered (permission denied)' : `error (${err.code})` });
      setPush(denied ? PUSH_STATES.DENIED : PUSH_STATES.ERROR);
    } finally {
      if (client.pushEnabled && !dryRun) diag.set(await describeServiceWorker(workerPath));
    }
  }

  optIn?.onActivate(async () => {
    setPush(PUSH_STATES.REQUESTING);
    const answer = await permissions.request();
    diag.info('Notification permission answer', { permission: answer });
    if (answer === 'granted') await startRegistration();
    else setPush(answer === 'denied' ? PUSH_STATES.DENIED : PUSH_STATES.DISMISSED);
  });

  if (!client.pushEnabled) {
    await startRegistration();
  } else if (!permissions.supported()) {
    setPush(PUSH_STATES.UNSUPPORTED);
    diag.set({ device: 'unsupported browser' });
  } else {
    const current = permissions.state();
    diag.set({ permission: current });
    if (current === 'granted') await startRegistration();  // returning visitor: no prompt
    else setPush(current === 'denied' ? PUSH_STATES.DENIED : PUSH_STATES.DEFAULT);
    if (!dryRun) diag.set(await describeServiceWorker(workerPath));
  }

  // --- Form -------------------------------------------------------------------
  ui.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    status.textContent = '';
    status.className = 'status';
    const { values, honeypot } = ui.read();
    ui.setBusy(true);
    try {
      const result = await runLeadFlow({
        config, rawValues: values, honeypot, client, guard, diag, identityStore, simulated: dryRun,
      });
      if (result.status === 'invalid') { ui.showErrors(result.errors); return; }
      ui.showErrors({});
      if (result.status === 'blocked') {
        status.textContent = result.cooldown
          ? `Ya recibimos una solicitud desde este navegador. Puedes enviar otra en ${result.cooldown} s.`
          : 'Ya estamos enviando tu solicitud.';
        return;
      }
      // 'sent' or 'ignored' (honeypot): both look like success to the visitor.
      const done = h('div', { class: 'notice notice-success', role: 'status' }, config.successMessage ?? '¡Gracias! Recibimos tu solicitud.');
      formHost.replaceChildren(done);
    } catch (err) {
      status.className = 'status status-error';
      status.textContent = err.step === 'device'
        ? STEP_LABEL.device
        : `${STEP_LABEL[err.step] ?? 'Algo salió mal.'} Inténtalo de nuevo en unos segundos.`;
      if (debug) status.textContent += ` [${err.step} · ${err.code}]`;
    } finally {
      ui.setBusy(false);
      if (client.pushEnabled && !client.deviceId) ui.setLocked(true);
    }
  });
}

/** Diagnostics panel (only with ?debug). Shows masked data only. */
function createPanel() {
  const box = h('aside', { class: 'diag', 'aria-label': 'Diagnóstico' });
  const title = h('h2', {}, 'Diagnóstico');
  const stateEl = h('dl', { class: 'diag-state' });
  const legend = h('p', { class: 'diag-legend' },
    'Etapas: SDK cargado → SDK inicializado → dispositivo registrado → usuario identificado → evento aceptado (ACCEPTED_BY_API). '
    + 'La ejecución del Customer Journey solo se confirma en la consola de indigitall.');
  const actions = h('div', { class: 'diag-actions' });
  const btnSession = h('button', { type: 'button', class: 'secondary' }, '1 · Nueva sesión de cliente');
  const btnIntegration = h('button', { type: 'button', class: 'secondary' }, '2 · Reiniciar integración SDK');
  const btnPermission = h('button', { type: 'button', class: 'secondary' }, '3 · Restablecer permisos del navegador');
  actions.append(btnSession, btnIntegration, btnPermission);
  const actionsHelp = h('p', { class: 'diag-legend' },
    '1: unlink + identidad y cooldown de la demo; conserva dispositivo y suscripción. '
    + '2: además elimina suscripción push, Service Worker y datos del SDK de esta demo, y recarga. '
    + '3: instrucciones para devolver el permiso de notificaciones a «preguntar».');
  const results = h('div', { class: 'diag-results', 'aria-live': 'polite' });
  const log = h('ol', { class: 'diag-log' });
  box.append(title, stateEl, legend, actions, actionsHelp, results, log);
  document.body.appendChild(box);

  const buttons = [btnSession, btnIntegration, btnPermission];
  const wrap = (fn) => async () => {
    buttons.forEach((b) => { b.disabled = true; });
    try { await fn(); } finally { buttons.forEach((b) => { b.disabled = false; }); }
  };

  return {
    setActions({ session, integration, permission }) {
      btnSession.addEventListener('click', wrap(session));
      btnIntegration.addEventListener('click', wrap(integration));
      btnPermission.addEventListener('click', wrap(permission));
    },
    showResults(titleText, list, { afterReload = false, offerReload = false } = {}) {
      const failedAny = list.some((r) => r.status === 'failed');
      const running = list.some((r) => r.status === 'running');
      const verdict = running ? 'en curso' : failedAny ? 'FALLÓ: algún paso necesario no se completó' : 'OK';
      results.replaceChildren(h('h3', {}, `${titleText}: ${verdict}${afterReload ? ' (resultado antes de recargar)' : ''}`));
      const ul = h('ul');
      for (const r of list) ul.appendChild(h('li', { class: `res-${r.status}` }, `${r.status.toUpperCase()} · ${r.step} — ${r.detail}`));
      results.appendChild(ul);
      if (offerReload) {
        const again = h('button', { type: 'button', class: 'secondary' }, 'Recargar de todos modos');
        again.addEventListener('click', () => location.reload());
        results.appendChild(again);
      }
    },
    showPermissionHelp(current, steps) {
      results.replaceChildren(h('h3', {}, `Restablecer permisos del navegador (estado actual: ${current})`));
      results.appendChild(h('p', {}, 'JavaScript no puede revocar el permiso de notificaciones: hay que hacerlo en el navegador. '
        + 'Recomendado: ejecuta antes «2 · Reiniciar integración SDK» para eliminar la suscripción anterior.'));
      const ol = h('ol');
      for (const st of steps) ol.appendChild(h('li', {}, st));
      results.appendChild(ol);
      const check = h('button', { type: 'button', class: 'secondary' }, 'Ya lo restablecí: recargar');
      check.addEventListener('click', () => location.reload());
      results.appendChild(check);
    },
    update(entry, state) {
      const rows = {
        'Modo': state.mode,
        'SDK (declarada / cargada)': `${state.sdkDeclaredVersion ?? '—'} / ${state.sdkVersion ?? '—'}`,
        '1 · SDK cargado': state.sdk,
        '2 · SDK inicializado': state.init,
        'Permiso de notificaciones': state.permission ?? '—',
        'Service Worker URL': state.swUrl ?? '—',
        'Service Worker estado': state.sw ?? '—',
        'Otros Service Workers del sitio': state.swOthers ?? '—',
        '3 · Dispositivo': state.device,
        'Device ID': state.deviceId ?? '—',
        'Canal de vinculación': state.linkChannel ?? '—',
        '4 · Identificación': state.identity,
        'External ID': state.externalId ? maskValue('externalId', state.externalId) : '—',
        'Persistencia CDP': state.cdp ?? '—',
        'Verificación del perfil': state.verification ?? '—',
        '5 · Evento': state.event ?? '—',
        'Última confirmación': state.lastConfirmation ?? '—',
      };
      stateEl.replaceChildren();
      for (const [k, v] of Object.entries(rows)) stateEl.append(h('dt', {}, k), h('dd', {}, String(v)));
      if (!entry) return;
      const li = h('li', { class: `lvl-${entry.level}` });
      const head = [entry.at.slice(11, 23), entry.level.toUpperCase(), entry.step ?? entry.message, entry.ms !== undefined ? `${entry.ms} ms` : '']
        .filter(Boolean).join(' · ');
      li.appendChild(h('strong', {}, head));
      const body = entry.payload ?? entry.response ?? entry.error ?? entry.data;
      if (body !== undefined && body !== null) li.appendChild(h('pre', {}, JSON.stringify(body, null, 2)));
      log.appendChild(li);
    },
  };
}

main();
