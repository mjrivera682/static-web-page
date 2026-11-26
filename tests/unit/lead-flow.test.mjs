import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSdkSimulator } from '../../shared/js/sdk-simulator.js';
import { createIndigitallClient, extractCustomerFields } from '../../shared/js/indigitall-client.js';
import { createGuard } from '../../shared/js/guard.js';
import { createDiagnostics } from '../../shared/js/diagnostics.js';
import { runLeadFlow, FlowError } from '../../shared/js/lead-flow.js';

const config = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));
const RAW = { name: 'Ana', email: 'Ana@Example.com', phone: '300 123 4567', product: 'Plan Hogar', consent: true };
const FIXED_NOW = () => new Date('2026-11-26T10:00:00.000Z');

async function setup(simOpts = {}, cfg = config, timeoutMs = 200) {
  const sim = createSdkSimulator({ latencyMs: 1, ...simOpts });
  const client = createIndigitallClient({ getSdk: () => sim, settings: cfg.indigitall, timeoutMs });
  await client.init();
  const guard = createGuard({ scope: 'test' });
  const diag = createDiagnostics({ enabled: true });
  const run = (raw = RAW, honeypot = '') => runLeadFlow({ config: cfg, rawValues: raw, honeypot, client, guard, diag, now: FIXED_NOW });
  return { sim, client, guard, diag, run };
}

const methods = (sim) => sim.calls.map((c) => c.method);

test('happy path: documented order, profile before event', async () => {
  const { sim, run } = await setup();
  const r = await run();
  assert.equal(r.status, 'sent');
  assert.equal(r.verification, 'verified');
  assert.deepEqual(methods(sim), ['init', 'link', 'assignOrUpdateValueToCustomerFields', 'getCustomerInformation', 'sendCustomerCustomEvent']);
});

test('init without Web Push', async () => {
  const { sim } = await setup();
  assert.equal(sim.calls[0].args[0].disabledPushService, true);
  assert.equal(sim.calls[0].args[0].requestLocation, undefined);
});

test('link uses the normalized external id and Channel.NONE', async () => {
  const { sim, run } = await setup();
  await run();
  assert.deepEqual(sim.calls[1].args, ['ana@example.com', 'none']);
});

test('email is both the external id and the email field; profile stays minimal with the demo flag', async () => {
  const { sim, run } = await setup();
  await run();
  const [externalId] = sim.calls[1].args;
  const fields = sim.calls[2].args[0];
  assert.deepEqual(fields, {
    name: 'Ana', email: 'ana@example.com', phone: '+573001234567', lead_source: 'demo_cdp_lead_capture',
  });
  assert.equal(fields.email, externalId);
});

test('event follows the documented 6-argument signature', async () => {
  const { sim, run } = await setup();
  const r = await run();
  const [eventCode, eventId, eventAt, data] = sim.calls[4].args;
  assert.equal(eventCode, 'lead_submitted');
  assert.equal(eventId, r.submissionId);
  assert.equal(eventAt, '2026-11-26T10:00:00.000Z');
  assert.deepEqual(data, { name: 'Ana', phone: '+573001234567', product: 'Plan Hogar', lead_source: 'demo_cdp_lead_capture' });
  assert.ok(!JSON.stringify(data).toLowerCase().includes('password'));
});

for (const failing of ['link', 'assignOrUpdateValueToCustomerFields', 'getCustomerInformation']) {
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
  const ids = sim.calls.filter((c) => c.method === 'sendCustomerCustomEvent').map((c) => c.args[1]);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

test('callback that never arrives → TIMEOUT, no event', async () => {
  const { sim, run } = await setup({ silent: ['assignOrUpdateValueToCustomerFields'] }, config, 50);
  await assert.rejects(run(), (e) => e.step === 'setFields' && e.code === 'TIMEOUT');
  assert.ok(!methods(sim).includes('sendCustomerCustomEvent'));
});

test('profile mismatch → no event', async () => {
  const { sim, client, guard, diag } = await setup();
  sim.getCustomerInformation = (ok) => setTimeout(() => ok({ fields: { email: 'other@x.com' } }), 1);
  await assert.rejects(
    runLeadFlow({ config, rawValues: RAW, client, guard, diag, now: FIXED_NOW }),
    (e) => e.step === 'verify' && e.code === 'PROFILE_MISMATCH',
  );
  assert.ok(!methods(sim).includes('sendCustomerCustomEvent'));
});

test('unrecognized verification response: lenient continues, strict stops', async () => {
  const odd = (ok) => setTimeout(() => ok('not-json'), 1);
  const lenient = await setup();
  lenient.sim.getCustomerInformation = odd;
  assert.equal((await lenient.run()).verification, 'unrecognized-response');

  const strictCfg = structuredClone(config);
  strictCfg.flow.verifyProfile = 'strict';
  const strict = await setup({}, strictCfg);
  strict.sim.getCustomerInformation = odd;
  await assert.rejects(strict.run(), (e) => e.code === 'PROFILE_UNVERIFIABLE');
});

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

test('extractCustomerFields accepts the shapes we can recognize', () => {
  assert.deepEqual(extractCustomerFields({ fields: { a: 1 } }), { a: 1 });
  assert.deepEqual(extractCustomerFields([{ name: 'a', value: 1 }]), { a: 1 });
  assert.deepEqual(extractCustomerFields({ data: { fields: [{ fieldName: 'a', value: 1 }] } }), { a: 1 });
  assert.deepEqual(extractCustomerFields('{"a":1}'), { a: 1 });
  assert.equal(extractCustomerFields('not-json'), null);
});
