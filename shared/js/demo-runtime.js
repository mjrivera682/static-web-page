// Common entry point for every demo page.
// Usage in a demo's index.html:
//   <main id="demo" data-config="./demo.config.json"></main>
//   <script type="module" src="../../shared/js/demo-runtime.js"></script>

import { validateConfig, APP_KEY_PLACEHOLDER } from './config.js';
import { createIndigitallClient, loadScript } from './indigitall-client.js';
import { createSdkSimulator } from './sdk-simulator.js';
import { createGuard } from './guard.js';
import { createDiagnostics, maskValue } from './diagnostics.js';
import { renderForm } from './form-renderer.js';
import { runLeadFlow } from './lead-flow.js';

const STEP_LABEL = {
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

  document.title = config.title ?? document.title;
  const panel = debug ? createPanel() : null;
  const diag = createDiagnostics({ enabled: debug, onEntry: (entry, state) => panel?.update(entry, state) });
  diag.set({ mode: dryRun ? 'dry-run' : 'live', sdkDeclaredVersion: ind.sdkVersion });

  if (dryRun) {
    root.appendChild(h('div', { class: 'notice notice-info' },
      'Modo de prueba: no se envía nada a indigitall. Los datos solo se simulan en este navegador.'));
  }

  const formHost = h('div');
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  root.append(formHost, status);
  const ui = renderForm(document, formHost, config);
  ui.setBusy(true);

  let getSdk;
  if (dryRun) {
    const failMethod = params.get('simulate-fail');
    const sim = createSdkSimulator({ fail: failMethod ? { [failMethod]: { errorMessage: 'simulated failure' } } : {} });
    getSdk = () => sim;
  } else {
    getSdk = () => window.indigitall;
    try {
      await diag.step('loadSdk', { version: ind.sdkVersion },
        () => loadScript(new URL(`../../vendor/indigitall/${ind.sdkVersion}/sdk.min.js`, import.meta.url).href));
    } catch {
      fatal(root, 'No se pudo cargar el SDK de indigitall. Inténtalo más tarde.');
      return;
    }
  }

  const client = createIndigitallClient({
    getSdk,
    settings: { ...ind, logLevel: debug ? 'DEBUG' : (ind.logLevel ?? 'ERROR') },
    timeoutMs: config.flow?.operationTimeoutMs ?? 10000,
    onSdkError: (msg) => diag.info('SDK onError', { message: typeof msg === 'string' ? msg : JSON.stringify(msg) }),
  });
  const guard = createGuard({ scope: config.slug, cooldownSeconds: config.guard?.cooldownSeconds ?? 0, storage: window.localStorage });

  diag.set({ init: 'initializing' });
  try {
    await diag.step('init', { pushMode: ind.pushMode ?? 'disabled' }, () => client.init());
    diag.set({ init: 'initialized', sdkVersion: client.version() });
  } catch {
    diag.set({ init: 'error' });
    fatal(root, 'No se pudo inicializar el SDK de indigitall.');
    return;
  }
  ui.setBusy(false);

  panel?.onReset(async () => {
    try { await diag.step('unlink', null, () => client.reset()); } catch { /* shown in log */ }
    guard.reset();
    diag.set({ identity: 'anonymous', externalId: null, lastConfirmation: null });
    location.reload();
  });

  ui.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    status.textContent = '';
    status.className = 'status';
    const { values, honeypot } = ui.read();
    ui.setBusy(true);
    try {
      const result = await runLeadFlow({ config, rawValues: values, honeypot, client, guard, diag, simulated: dryRun });
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
      status.textContent = `${STEP_LABEL[err.step] ?? 'Algo salió mal.'} Inténtalo de nuevo en unos segundos.`;
      if (debug) status.textContent += ` [${err.step} · ${err.code}]`;
    } finally {
      ui.setBusy(false);
    }
  });
}

/** Diagnostics panel (only with ?debug). Shows masked data only. */
function createPanel() {
  const box = h('aside', { class: 'diag', 'aria-label': 'Diagnóstico' });
  const title = h('h2', {}, 'Diagnóstico');
  const stateEl = h('dl', { class: 'diag-state' });
  const legend = h('p', { class: 'diag-legend' },
    'ACCEPTED_BY_API = el SDK devolvió éxito. La ejecución del Customer Journey solo se confirma en la consola de indigitall.');
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
        'Inicialización': state.init,
        'Identificación': state.identity,
        'External ID': state.externalId ? maskValue('externalId', state.externalId) : '—',
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
