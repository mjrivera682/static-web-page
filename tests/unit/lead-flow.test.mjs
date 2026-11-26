import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSdkSimulator } from '../../shared/js/sdk-simulator.js';
import { createIndigitallClient } from '../../shared/js/indigitall-client.js';
import { createGuard } from '../../shared/js/guard.js';
import { createDiagnostics } from '../../shared/js/diagnostics.js';
import { runLeadFlow, FlowError, createIdentityStore } from '../../shared/js/lead-flow.js';

const config = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));
const RAW = { name: 'Ana', email: 'Ana@Example.com', phone: '300 123 4567', product: 'Plan Hogar', consent: true };
const FIXED_NOW = () => new Date('2026-11-26T10:00:00.000Z');
const WORKER = '/static-web-page/indigitall/worker.min.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function makeClient(sim, cfg = config, { timeoutMs = 200, registrationTimeoutMs = 300 } = {}) {
  return createIndigitallClient({
    getSdk: () => sim, settings: { ...cfg.indigitall, workerPath: WORKER }, timeoutMs, registrationTimeoutMs,
  });
}

async function setup(simOpts = {}, cfg = config, clientOpts) {
  const sim = createSdkSimulator({ latencyMs: 1, ...simOpts });
  const client = makeClient(sim, cfg, clientOpts);
  await client.init();
  const guard = createGuard({ scope: 'test' });
  const diag = createDiagnostics({ enabled: true });
  const identityStore = createIdentityStore({ scope: 'test', storage: memoryStorage() });
  const run = (raw = RAW, honeypot = '') => runLeadFlow({
    config: cfg, rawValues: raw, honeypot, client, guard, diag, identityStore, now: FIXED_NOW,
  });
  return { sim, client, guard, diag, identityStore, run };
}

const methods = (sim) => sim.calls.map((c) => c.method);

// --- Initialization and device registration -------------------------------------

test('init enables Web Push with the vendor worker path and no location request', async () => {
  const { sim, client } = await setup();
  const cfg = sim.calls[0].args[0];
  assert.equal(cfg.disabledPushService, false);
  assert.equal(cfg.workerPath, WORKER);
  assert.equal(cfg.requestLocation, undefined);
  assert.equal(typeof cfg.onInitialized, 'function');
  assert.match(client.deviceId, /^sim-/);
});

test('only one indigitall.init per page: repeated init() calls reuse the first', async () => {
  const sim = createSdkSimulator({ latencyMs: 1 });
  const client = makeClient(sim);
  const [a, b] = await Promise.all([client.init(), client.init()]);
  await client.init();
  assert.equal(sim.calls.filter((c) => c.method === 'init').length, 1);
  assert.equal(a.deviceId, b.deviceId);
});

test('init resolves only once a Device ID exists (not when init() returns)', async () => {
  const sim = createSdkSimulator({ latencyMs: 30 });
  const client = makeClient(sim);
  let resolved = false;
  const p = client.init().then(() => { resolved = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(resolved, false);
  assert.equal(client.deviceId, null);
  await p;
  assert.ok(client.deviceId);
});

test('permission denied → init rejects PUSH_PERMISSION_DENIED and the flow never calls link', async () => {
  const sim = createSdkSimulator({ latencyMs: 1, permission: 'denied' });
  const client = makeClient(sim);
  await assert.rejects(client.init(), (e) => e.code === 'PUSH_PERMISSION_DENIED');
  const diag = createDiagnostics({ enabled: true });
  await assert.rejects(
    runLeadFlow({ config, rawValues: RAW, client, guard: createGuard({ scope: 't' }), diag, now: FIXED_NOW }),
    (e) => e instanceof FlowError && (e.code === 'NOT_INITIALIZED' || e.code === 'DEVICE_NOT_REGISTERED'),
  );
  assert.ok(!methods(sim).includes('link'));
});

test('registration error → REGISTRATION_FAILED', async () => {
  const sim = createSdkSimulator({ latencyMs: 1, fail: { register: { errorMessage: 'push subscription failed' } } });
  await assert.rejects(makeClient(sim).init(), (e) => e.code === 'REGISTRATION_FAILED');
});

test('no onInitialized → REGISTRATION_TIMEOUT', async () => {
  const sim = createSdkSimulator({ latencyMs: 1, silent: ['init'] });
  await assert.rejects(makeClient(sim, config, { registrationTimeoutMs: 40 }).init(), (e) => e.code === 'REGISTRATION_TIMEOUT');
});

test('regression: push disabled reproduces DISABLED_CHANNEL on link', async () => {
  const cfg = structuredClone(config);
  cfg.indigitall.pushMode = 'disabled';
  const { sim, run } = await setup({}, cfg);
  await assert.rejects(run(), (e) => e.step === 'identify' && e.cause.sdkError.errorCode.code === 'DISABLED_CHANNEL');
  assert.deepEqual(sim.calls[1].args, ['ana@example.com', 'none']);
  assert.ok(!methods(sim).includes('sendCustomerCustomEvent'));
});

// --- Lead flow -----------------------------------------------------------------

test('happy path: init → link → fields → event, with no profile read-back', async () => {
  const { sim, run, diag } = await setup();
  const r = await run();
  assert.equal(r.status, 'sent');
  assert.deepEqual(methods(sim), ['init', 'link', 'assignOrUpdateValueToCustomerFields', 'sendCustomerCustomEvent']);
  assert.ok(!methods(sim).includes('getCustomerInformation'));
  assert.equal(diag.state.cdp, 'write accepted by the SDK (no read-back)');
});

test('the event is sent only after the attribute write callback succeeded', async () => {
  const { sim, run } = await setup();
  let writeAcked = false;
  const write = sim.assignOrUpdateValueToCustomerFields;
  sim.assignOrUpdateValueToCustomerFields = (f, ok, err) => write(f, (r) => { writeAcked = true; ok(r); }, err);
  const send = sim.sendCustomerCustomEvent;
  sim.sendCustomerCustomEvent = (...a) => { assert.ok(writeAcked, 'event before write ack'); return send(...a); };
  assert.equal((await run()).status, 'sent');
});

test('link uses the email as External ID, without prefix, on Channel.PUSH', async () => {
  const { sim, run, diag } = await setup();
  await run();
  assert.deepEqual(sim.calls[1].args, ['ana@example.com', 'push']);
  assert.equal(sim.db.linkedChannel, 'push');
  assert.equal(diag.state.linkChannel, 'Channel.PUSH');
});

test('CDP contract: name, email, Phone, Country_code, producto_de_interes, Origen; email equals the External ID', async () => {
  const { sim, run } = await setup();
  await run();
  const fields = sim.calls[2].args[0];
  assert.deepEqual(fields, {
    name: 'Ana', email: 'ana@example.com', Phone: 573001234567, Country_code: 57,
    producto_de_interes: 'Plan Hogar', Origen: 'demo_cdp_lead_capture',
  });
  assert.equal(typeof fields.Phone, 'number');
  assert.equal(typeof fields.Country_code, 'number');
  assert.equal(fields.email, sim.calls[1].args[0]);
});

test('event uses the SDK 4.18.1 order: code, data, eventId, eventAt', async () => {
  const { sim, run } = await setup();
  const r = await run();
  const [eventCode, data, eventId, eventAt] = sim.calls[3].args;
  assert.equal(eventCode, 'lead_submitted');
  assert.deepEqual(data, { name: 'Ana', phone: '+573001234567', product: 'Plan Hogar', Origen: 'demo_cdp_lead_capture' });
  assert.equal(typeof data.phone, 'string');
  assert.equal(eventId, r.submissionId);
  assert.equal(eventAt, '2026-11-26T10:00:00.000Z');
  assert.deepEqual(sim.db.events[0].customData, data);
});

test('dry-run is reported as SIMULATED, never as accepted by the API', async () => {
  const { diag, client, guard } = await setup();
  await runLeadFlow({ config, rawValues: RAW, client, guard, diag, simulated: true, now: FIXED_NOW });
  assert.equal(diag.state.lastConfirmation, 'SIMULATED (dry-run)');
  const live = await setup();
  await live.run();
  assert.equal(live.diag.state.lastConfirmation, 'ACCEPTED_BY_API');
  assert.equal(live.diag.state.event, 'accepted');
});

for (const failing of ['link', 'assignOrUpdateValueToCustomerFields']) {
  test(`${failing} fails → no event, error surfaced`, async () => {
    const { sim, run } = await setup({ fail: { [failing]: { errorMessage: 'x' } } });
    await assert.rejects(run(), FlowError);
    assert.ok(!methods(sim).includes('sendCustomerCustomEvent'));
  });
}

test('event fails → rejects (no success), retry reuses the same eventId', async () => {
  const { sim, run } = await setup({ fail: { sendCustomerCustomEvent: { errorMessage: 'x' } } });
  await assert.rejects(run(), (e) => e.step === 'sendEvent' && e.code === 'API_ERROR');
  await assert.rejects(run());
  const ids = sim.calls.filter((c) => c.method === 'sendCustomerCustomEvent').map((c) => c.args[2]);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

test('callback that never arrives → TIMEOUT, no event', async () => {
  const { sim, run } = await setup({ silent: ['assignOrUpdateValueToCustomerFields'] }, config, { timeoutMs: 50 });
  await assert.rejects(run(), (e) => e.step === 'setFields' && e.code === 'TIMEOUT');
  assert.ok(!methods(sim).includes('sendCustomerCustomEvent'));
});

// --- Identity on the same device -----------------------------------------------

test('existing contact / reload: same email again → link again, no unlink', async () => {
  const { sim, run } = await setup();
  await run();
  await run({ ...RAW, phone: '3109998877' });
  assert.equal(methods(sim).filter((m) => m === 'unlink').length, 0);
  assert.equal(methods(sim).filter((m) => m === 'link').length, 2);
});

test('identity change on the same device: unlink(PUSH) before linking the new email', async () => {
  const { sim, run } = await setup();
  await run();
  await run({ ...RAW, email: 'otra@example.com' });
  const seq = methods(sim).slice(4);
  assert.deepEqual(seq.slice(0, 2), ['unlink', 'link']);
  assert.deepEqual(sim.calls[4].args, ['push']);
  assert.equal(sim.db.externalId, 'otra@example.com');
});

test('identity store keeps only a hash of the External ID', async () => {
  const storage = memoryStorage();
  const store = createIdentityStore({ scope: 's', storage });
  store.remember(await store.fingerprint('ana@example.com'));
  const saved = storage.getItem('demo.s.linkedIdentity');
  assert.match(saved, /^[0-9a-f]{64}$/);
  assert.ok(!saved.includes('ana'));
});

// --- Guards ----------------------------------------------------------------------

test('invalid data → no SDK calls after init', async () => {
  const { sim, run } = await setup();
  const r = await run({ ...RAW, email: 'bad' });
  assert.equal(r.status, 'invalid');
  assert.deepEqual(methods(sim), ['init']);
});

test('honeypot → ignored, no SDK calls', async () => {
  const { sim, run } = await setup();
  assert.equal((await run(RAW, 'spam')).status, 'ignored');
  assert.deepEqual(methods(sim), ['init']);
});

test('double submit → a single sequence', async () => {
  const { sim, run } = await setup();
  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual([a.status, b.status].sort(), ['blocked', 'sent']);
  assert.equal(methods(sim).filter((m) => m === 'sendCustomerCustomEvent').length, 1);
});
