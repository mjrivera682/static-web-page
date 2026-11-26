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
  const workerPath = new URL(`../../vendor/indigitall/${ind.sdkVersion}/worker.min.js`, import.meta.url).pathname;

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
        () => loadScript(new URL(`../../vendor/indigitall/${ind.sdkVersion}/sdk.min.js`, import.meta.url).href));
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

  const guard = createGuard({ scope: config.slug, cooldownSeconds: config.guard?.cooldownSeconds ?? 0, storage: window.localStorage });
  const identityStore = createIdentityStore({ scope: config.slug, storage: window.localStorage });

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

  panel?.onReset(async () => {
    if (client.initialized) {
      try { await diag.step('unlink', { channel: client.channelName }, () => client.reset()); } catch { /* shown in log */ }
    }
    guard.reset();
    identityStore.forget();
    location.reload();
  });

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
  const reset = h('button', { type: 'button', class: 'secondary' }, 'Nueva sesión (unlink)');
  const log = h('ol', { class: 'diag-log' });
  box.append(title, stateEl, legend, reset, log);
  document.body.appendChild(box);

  return {
    onReset(fn) { reset.addEventListener('click', fn); },
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
