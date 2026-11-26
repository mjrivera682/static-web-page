// Reset actions for repeated demo testing (diagnostics panel only).
//
// GitHub Pages shares the origin (mjrivera682.github.io) with other sites, so nothing is
// cleared wholesale. Only what this implementation owns is removed. Storage used by the
// indigitall Web SDK 4.18.1, taken from indigitall/sdk.min.js and worker.min.js:
//   - localStorage keys prefixed "indigitall.repository."  (66 keys)
//   - sessionStorage keys prefixed "indigitall.session.storage"
//   - IndexedDB database "indigitall.indexedDB"
//   - no cookies (the SDK never touches document.cookie); no Cache API use
// Demo state: localStorage/sessionStorage keys prefixed "demo.<slug>.".
// Service Worker: only the registration whose script is this site's workerPath.
//
// Every step reports {step, status: 'ok'|'skipped'|'failed', detail}. A reset succeeds
// only if no step failed.

export const SDK_LOCAL_PREFIX = 'indigitall.repository.';
export const SDK_SESSION_PREFIX = 'indigitall.session.storage';
export const SDK_IDB_NAME = 'indigitall.indexedDB';

const ok = (step, detail) => ({ step, status: 'ok', detail });
const skipped = (step, detail) => ({ step, status: 'skipped', detail });
const failed = (step, detail) => ({ step, status: 'failed', detail });

export function succeeded(results) {
  return results.every((r) => r.status !== 'failed');
}

function keysWithPrefix(storage, prefix) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

export function removeKeys(step, storage, prefix) {
  try {
    if (!storage) return skipped(step, 'storage not available');
    const keys = keysWithPrefix(storage, prefix);
    if (!keys.length) return skipped(step, `no keys with prefix "${prefix}"`);
    for (const k of keys) storage.removeItem(k);
    const left = keysWithPrefix(storage, prefix).length;
    return left ? failed(step, `${left} key(s) could not be removed`) : ok(step, `${keys.length} key(s) removed`);
  } catch (err) {
    return failed(step, String(err.message ?? err));
  }
}

export function deleteDatabase(step, idb, name, { timeoutMs = 4000 } = {}) {
  if (!idb) return Promise.resolve(skipped(step, 'IndexedDB not available'));
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => finish(failed(step, `"${name}" still open elsewhere (blocked); close other tabs of this demo and retry`)), timeoutMs);
    try {
      const req = idb.deleteDatabase(name);
      req.onsuccess = () => finish(ok(step, `"${name}" deleted (or did not exist)`));
      req.onerror = () => finish(failed(step, String(req.error?.message ?? 'deleteDatabase error')));
      req.onblocked = () => { /* wait: resolves when other connections close, else timeout */ };
    } catch (err) {
      finish(failed(step, String(err.message ?? err)));
    }
  });
}

/** Find this demo's indigitall registration (script path equals workerPath). */
export async function findRegistration(serviceWorker, workerPath) {
  if (!serviceWorker?.getRegistrations) return null;
  const regs = await serviceWorker.getRegistrations();
  return regs.find((r) => [r.active, r.waiting, r.installing]
    .some((w) => w?.scriptURL && new URL(w.scriptURL).pathname === workerPath)) ?? null;
}

export async function unsubscribePush(step, registration) {
  try {
    if (!registration) return skipped(step, 'no Service Worker registration for this demo');
    const sub = await registration.pushManager?.getSubscription();
    if (!sub) return skipped(step, 'no push subscription');
    const done = await sub.unsubscribe();
    return done ? ok(step, 'push subscription removed') : failed(step, 'unsubscribe() returned false');
  } catch (err) {
    return failed(step, String(err.message ?? err));
  }
}

export async function unregisterWorker(step, registration) {
  try {
    if (!registration) return skipped(step, 'no Service Worker registration for this demo');
    const scope = new URL(registration.scope).pathname;
    const done = await registration.unregister();
    return done ? ok(step, `unregistered (scope ${scope})`) : failed(step, `unregister() returned false (scope ${scope})`);
  } catch (err) {
    return failed(step, String(err.message ?? err));
  }
}

function cookieCheck(step, doc) {
  try {
    const names = (doc?.cookie ?? '').split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
    const ours = names.filter((n) => /^indigitall|^demo\./i.test(n));
    if (!ours.length) return skipped(step, 'no indigitall or demo cookies (the SDK does not set cookies)');
    // Not expected with SDK 4.18.1; expire them for this path and the site path.
    for (const n of ours) doc.cookie = `${n}=; Max-Age=0; path=/static-web-page/`;
    const left = (doc.cookie ?? '').split(';').map((c) => c.split('=')[0].trim()).filter((n) => ours.includes(n));
    return left.length ? failed(step, `cookies left: ${left.join(', ')}`) : ok(step, `${ours.length} cookie(s) removed`);
  } catch (err) {
    return failed(step, String(err.message ?? err));
  }
}

/**
 * Action 1: new customer session. Keeps the device and its push subscription.
 * @param {object} p
 * @param {object} p.client           createIndigitallClient(...)
 * @param {object} p.guard            createGuard(...)
 * @param {object} p.identityStore    createIdentityStore(...)
 */
export async function resetCustomerSession({ client, guard, identityStore }) {
  const results = [];
  const linked = identityStore.previous();
  let unlinkOk = true;
  if (!linked) {
    results.push(skipped('unlink', 'no customer linked from this browser'));
  } else if (!client.initialized || !client.deviceId) {
    unlinkOk = false;
    results.push(failed('unlink', 'a customer is linked but the SDK has no registered device in this page'));
  } else {
    try {
      await client.reset();
      results.push(ok('unlink', `unlink(${client.channelName}) accepted`));
    } catch (err) {
      unlinkOk = false;
      results.push(failed('unlink', `${err.code ?? 'ERROR'}: ${err.message ?? err}`));
    }
  }
  // Keep the identity hash if unlink failed, so the next link() still unlinks first.
  if (unlinkOk) {
    identityStore.forget();
    results.push(ok('demo identity', 'cleared'));
  } else {
    results.push(skipped('demo identity', 'kept because unlink failed'));
  }
  guard.reset();
  results.push(ok('cooldown', 'reset'));
  results.push(skipped('device', 'kept (device and push subscription preserved)'));
  return results;
}

/**
 * Action 2: reset the SDK integration to a clean state (works after REGISTRATION_FAILED / 403).
 * @param {object} p
 * @param {object} p.client, p.guard, p.identityStore
 * @param {string} p.workerPath
 * @param {string} p.slug
 * @param {object} p.env  { localStorage, sessionStorage, indexedDB, serviceWorker, document }
 */
export async function resetIntegration({ client, guard, identityStore, workerPath, slug, env }) {
  const results = [];

  // 1. Unlink only if there is a valid session (registered device + linked customer).
  if (identityStore.previous() && client.initialized && client.deviceId) {
    try {
      await client.reset();
      results.push(ok('unlink', `unlink(${client.channelName}) accepted`));
    } catch (err) {
      results.push(failed('unlink', `${err.code ?? 'ERROR'}: ${err.message ?? err}`));
    }
  } else {
    results.push(skipped('unlink', identityStore.previous()
      ? 'no registered device in this page: nothing to unlink through the SDK'
      : 'no customer linked from this browser'));
  }

  // 2-4. Push subscription, Service Worker and SDK storage.
  results.push(...await resetSdkState({ workerPath, env }));
  results.push(cookieCheck('cookies', env.document));

  // 5. Demo state (stored cooldown and identity hash), then the in-memory copies.
  results.push(removeKeys('demo localStorage', env.localStorage, `demo.${slug}.`));
  guard.reset();
  identityStore.forget();
  return results;
}

/**
 * SDK-owned state only: push subscription + registration of workerPath, SDK localStorage /
 * sessionStorage prefixes and the SDK IndexedDB database. Demo keys are not touched.
 */
export async function resetSdkState({ workerPath, env }) {
  const results = [];
  let registration = null;
  try {
    registration = await findRegistration(env.serviceWorker, workerPath);
  } catch (err) {
    results.push(failed('find Service Worker', String(err.message ?? err)));
  }
  results.push(await unsubscribePush('push subscription', registration));
  results.push(await unregisterWorker('Service Worker', registration));
  results.push(removeKeys('SDK localStorage', env.localStorage, SDK_LOCAL_PREFIX));
  results.push(removeKeys('SDK sessionStorage', env.sessionStorage, SDK_SESSION_PREFIX));
  results.push(await deleteDatabase('SDK IndexedDB', env.indexedDB, SDK_IDB_NAME));
  return results;
}

// Where SDK 4.18.1 keeps the App Key it is using (setAppKey/getAppKey in sdk.min.js).
export const SDK_APP_KEY_KEY = `${SDK_LOCAL_PREFIX}APP_KEY`;

/**
 * SDK 4.18.1 init(): while its sync window is open it returns the stored device through
 * onInitialized *before* saving config.appKey, so state left by another App Key (an old
 * key, or another demo on this origin) keeps being used. If the stored App Key differs
 * from this demo's, clear the SDK state before init. Read-only check otherwise.
 * @returns {Promise<{changed: boolean, previous: string|null, results: object[]}>}
 */
export async function resetIfAppKeyChanged({ appKey, workerPath, env, identityStore }) {
  let previous = null;
  try { previous = env.localStorage?.getItem(SDK_APP_KEY_KEY) ?? null; } catch { /* storage blocked */ }
  if (!previous || previous === appKey) return { changed: false, previous, results: [] };
  const results = await resetSdkState({ workerPath, env });
  // The linked-identity hash belonged to the previous App Key's project.
  identityStore?.forget();
  return { changed: true, previous, results };
}

/** Browser-specific steps to reset the notification permission (JS cannot revoke it). */
export function permissionResetInstructions(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('firefox')) {
    return ['Haz clic en el icono a la izquierda de la dirección (candado o ajustes).',
      'En «Permisos», junto a «Enviar notificaciones», pulsa la X para borrar el permiso.',
      'Recarga la página: volverá a aparecer el botón «Activar notificaciones».'];
  }
  if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('edg')) {
    return ['Safari → Ajustes (Preferencias) → Sitios web → Notificaciones.',
      'Selecciona mjrivera682.github.io y pulsa «Eliminar».',
      'Recarga la página: volverá a aparecer el botón «Activar notificaciones».'];
  }
  return ['Haz clic en el icono a la izquierda de la dirección (ajustes del sitio / candado).',
    'En «Notificaciones», elige «Preguntar» o pulsa «Restablecer permisos».',
    'Alternativa: chrome://settings/content/notifications (o edge://settings/content/notifications), busca mjrivera682.github.io y elimínalo.',
    'Recarga la página: volverá a aparecer el botón «Activar notificaciones».'];
}
