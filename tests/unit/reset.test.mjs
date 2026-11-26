import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSdkSimulator } from '../../shared/js/sdk-simulator.js';
import { createIndigitallClient } from '../../shared/js/indigitall-client.js';
import { createGuard } from '../../shared/js/guard.js';
import { createIdentityStore } from '../../shared/js/lead-flow.js';
import {
  resetCustomerSession, resetIntegration, succeeded, permissionResetInstructions,
} from '../../shared/js/reset.js';

const config = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));
const WORKER = '/static-web-page/indigitall/worker.min.js';
const SLUG = 'cdp-lead-capture';

function webStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

function fakeIdb({ blocked = false } = {}) {
  const deleted = [];
  return {
    deleted,
    deleteDatabase(name) {
      const req = {};
      setTimeout(() => {
        if (blocked) req.onblocked?.();
        else { deleted.push(name); req.onsuccess?.(); }
      }, 1);
      return req;
    },
  };
}

function fakeRegistration(scriptPath, { subscribed = true, unregisterResult = true } = {}) {
  const reg = {
    scope: `https://mjrivera682.github.io${scriptPath.slice(0, scriptPath.lastIndexOf('/') + 1)}`,
    active: { scriptURL: `https://mjrivera682.github.io${scriptPath}` },
    unregistered: false,
    unsubscribed: false,
    pushManager: {
      getSubscription: async () => (subscribed ? { unsubscribe: async () => { reg.unsubscribed = true; return true; } } : null),
    },
    unregister: async () => { reg.unregistered = unregisterResult; return unregisterResult; },
  };
  return reg;
}

async function makeClient({ register = true, simOpts = {} } = {}) {
  const sim = createSdkSimulator({ latencyMs: 1, ...simOpts });
  const client = createIndigitallClient({
    getSdk: () => sim, settings: { ...config.indigitall, workerPath: WORKER }, timeoutMs: 100, registrationTimeoutMs: 100,
  });
  if (register) await client.init();
  return { sim, client };
}

async function linkedState(local) {
  const identityStore = createIdentityStore({ scope: SLUG, storage: local });
  identityStore.remember(await identityStore.fingerprint('ana@example.com'));
  const guard = createGuard({ scope: SLUG, cooldownSeconds: 120, storage: local });
  guard.acquire('x'); guard.complete();
  return { identityStore, guard };
}

// --- 1. New customer session -----------------------------------------------------

test('session reset: unlink(PUSH), clears identity and cooldown, keeps the device', async () => {
  const local = webStorage();
  const { sim, client } = await makeClient();
  await new Promise((ok) => sim.link('ana@example.com', 'push', ok));
  const { identityStore, guard } = await linkedState(local);
  const results = await resetCustomerSession({ client, guard, identityStore });
  assert.ok(succeeded(results));
  assert.deepEqual(sim.calls.find((c) => c.method === 'unlink').args, ['push']);
  assert.equal(identityStore.previous(), null);
  assert.equal(guard.cooldownRemaining(), 0);
  assert.ok(sim.db.deviceId, 'device kept');
  assert.equal(results.find((r) => r.step === 'device').status, 'skipped');
});

test('session reset with nobody linked: unlink skipped, still succeeds', async () => {
  const { sim, client } = await makeClient();
  const results = await resetCustomerSession({
    client, guard: createGuard({ scope: SLUG }), identityStore: createIdentityStore({ scope: SLUG, storage: webStorage() }),
  });
  assert.ok(succeeded(results));
  assert.equal(results[0].status, 'skipped');
  assert.ok(!sim.calls.some((c) => c.method === 'unlink'));
});

test('session reset: unlink failure → reset FAILED and the identity hash is kept', async () => {
  const local = webStorage();
  const { client } = await makeClient({ simOpts: { fail: { unlink: { errorMessage: 'x' } } } });
  const { identityStore, guard } = await linkedState(local);
  const results = await resetCustomerSession({ client, guard, identityStore });
  assert.equal(succeeded(results), false);
  assert.ok(identityStore.previous(), 'kept for the next link to unlink first');
});

test('session reset: linked customer but no registered device → FAILED', async () => {
  const local = webStorage();
  const { client } = await makeClient({ register: false });
  const { identityStore, guard } = await linkedState(local);
  const results = await resetCustomerSession({ client, guard, identityStore });
  assert.equal(succeeded(results), false);
  assert.equal(results[0].status, 'failed');
});

// --- 2. Reset SDK integration ----------------------------------------------------

test('integration reset after REGISTRATION_FAILED: removes only SDK and demo data, our worker only', async () => {
  const local = webStorage({
    'indigitall.repository.APP_KEY': 'k',
    'indigitall.repository.DEVICE_ID': 'd',
    'indigitall.repository.externalId': 'h',
    'demo.other-demo.lastSentAt': '1',
    'someone-else.key': 'keep',
  });
  const session = webStorage({ 'indigitall.session.storage': 's', messages: 'not ours by name', 'x.y': 'keep' });
  const { client } = await makeClient({ register: false }); // init failed: no device
  const { identityStore, guard } = await linkedState(local);
  const ours = fakeRegistration(WORKER);
  const otherSite = fakeRegistration('/another-repo/sw.js');
  const idb = fakeIdb();
  const doc = { cookie: 'unrelated=1' };
  const results = await resetIntegration({
    client, guard, identityStore, workerPath: WORKER, slug: SLUG,
    env: { localStorage: local, sessionStorage: session, indexedDB: idb, serviceWorker: { getRegistrations: async () => [otherSite, ours] }, document: doc },
  });
  assert.ok(succeeded(results), JSON.stringify(results));
  assert.equal(results.find((r) => r.step === 'unlink').status, 'skipped');
  assert.ok(ours.unsubscribed && ours.unregistered);
  assert.ok(!otherSite.unsubscribed && !otherSite.unregistered, 'other Service Workers untouched');
  assert.deepEqual(idb.deleted, ['indigitall.indexedDB']);
  assert.deepEqual(local.keys(), ['demo.other-demo.lastSentAt', 'someone-else.key']);
  assert.deepEqual(session.keys(), ['messages', 'x.y']);
  assert.equal(doc.cookie, 'unrelated=1');
});

test('integration reset with a valid session unlinks first', async () => {
  const local = webStorage();
  const { sim, client } = await makeClient();
  await new Promise((ok) => sim.link('ana@example.com', 'push', ok));
  const { identityStore, guard } = await linkedState(local);
  const results = await resetIntegration({
    client, guard, identityStore, workerPath: WORKER, slug: SLUG,
    env: { localStorage: local, sessionStorage: webStorage(), indexedDB: fakeIdb(), serviceWorker: { getRegistrations: async () => [] }, document: { cookie: '' } },
  });
  assert.equal(results[0].step, 'unlink');
  assert.equal(results[0].status, 'ok');
  assert.ok(succeeded(results));
});

test('integration reset is not successful if a step fails (worker not unregistered, IndexedDB blocked)', async () => {
  const run = (reg, idb) => resetIntegration({
    client: { initialized: false, deviceId: null }, guard: createGuard({ scope: SLUG }),
    identityStore: createIdentityStore({ scope: SLUG, storage: webStorage() }), workerPath: WORKER, slug: SLUG,
    env: { localStorage: webStorage(), sessionStorage: webStorage(), indexedDB: idb, serviceWorker: { getRegistrations: async () => (reg ? [reg] : []) }, document: { cookie: '' } },
  });
  assert.equal(succeeded(await run(fakeRegistration(WORKER, { unregisterResult: false }), fakeIdb())), false);
  const blocked = await run(null, Object.assign(fakeIdb({ blocked: true }), {}));
  // deleteDatabase default timeout is 4 s; blocked must end as failed.
  assert.equal(blocked.find((r) => r.step === 'SDK IndexedDB').status, 'failed');
});

// --- 3. Permission help ----------------------------------------------------------

test('permission help: browser-specific manual steps, always ending with a reload', () => {
  for (const ua of ['Mozilla/5.0 Chrome/131', 'Mozilla/5.0 Firefox/133', 'Mozilla/5.0 Version/18 Safari/605']) {
    const steps = permissionResetInstructions(ua);
    assert.ok(steps.length >= 3);
    assert.match(steps.at(-1), /Recarga/);
  }
  assert.match(permissionResetInstructions('Firefox').join(' '), /Enviar notificaciones/);
});

// --- App Key change (SDK state from another key / another demo) -------------------

test('App Key unchanged or no SDK state → nothing is touched', async () => {
  const { resetIfAppKeyChanged } = await import('../../shared/js/reset.js');
  for (const stored of [null, 'KEY-A']) {
    const local = webStorage(stored ? { 'indigitall.repository.APP_KEY': stored, 'indigitall.repository.DEVICE_ID': 'd' } : {});
    const reg = fakeRegistration(WORKER);
    const r = await resetIfAppKeyChanged({
      appKey: 'KEY-A', workerPath: WORKER,
      env: { localStorage: local, sessionStorage: webStorage(), indexedDB: fakeIdb(), serviceWorker: { getRegistrations: async () => [reg] } },
    });
    assert.equal(r.changed, false);
    assert.equal(reg.unregistered, false);
    if (stored) assert.equal(local.getItem('indigitall.repository.DEVICE_ID'), 'd');
  }
});

test('App Key changed → SDK state and our worker cleared, demo cooldown and other keys kept', async () => {
  const { resetIfAppKeyChanged } = await import('../../shared/js/reset.js');
  const local = webStorage({
    'indigitall.repository.APP_KEY': 'OLD-KEY', 'indigitall.repository.DEVICE_ID': 'd',
    'demo.cdp-lead-capture.lastSentAt': '1', 'other.site': 'keep',
  });
  const identityStore = createIdentityStore({ scope: SLUG, storage: local });
  identityStore.remember(await identityStore.fingerprint('ana@example.com'));
  const ours = fakeRegistration(WORKER);
  const other = fakeRegistration('/another-repo/sw.js');
  const idb = fakeIdb();
  const r = await resetIfAppKeyChanged({
    appKey: 'NEW-KEY', workerPath: WORKER, identityStore,
    env: { localStorage: local, sessionStorage: webStorage(), indexedDB: idb, serviceWorker: { getRegistrations: async () => [other, ours] } },
  });
  assert.equal(r.changed, true);
  assert.equal(r.previous, 'OLD-KEY');
  assert.ok(succeeded(r.results));
  assert.ok(ours.unsubscribed && ours.unregistered && !other.unregistered);
  assert.deepEqual(idb.deleted, ['indigitall.indexedDB']);
  assert.deepEqual(local.keys(), ['demo.cdp-lead-capture.lastSentAt', 'other.site']);
  assert.equal(identityStore.previous(), null);
});

// --- Reload: state that must survive a new page instance ---------------------------

test('reload keeps the cooldown and the linked identity (new guard/store, same storage)', async () => {
  const local = webStorage();
  const { identityStore } = await linkedState(local);
  const guardAfterReload = createGuard({ scope: SLUG, cooldownSeconds: 120, storage: local });
  assert.equal(guardAfterReload.acquire('x'), null, 'cooldown survives reload');
  const storeAfterReload = createIdentityStore({ scope: SLUG, storage: local });
  assert.equal(storeAfterReload.previous(), identityStore.previous());
});
