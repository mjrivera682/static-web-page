// In-Web tests. FIXTURES: shapes derived from sdk.min.js 4.18.1 (inAppIndigitallSubmit) or
// defensive variants. None is a payload observed from a live campaign yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adaptInWebSubmission, toConsent, toCountryIso, toPlainObject, describeStructure,
} from '../../shared/js/inweb-form-adapter.js';
import { createInWebClient, INWEB_STATES, isUnavailableError } from '../../shared/js/inweb-client.js';
import { createSdkSimulator, INWEB_FIXTURE } from '../../shared/js/sdk-simulator.js';
import { createIndigitallClient } from '../../shared/js/indigitall-client.js';
import { createGuard } from '../../shared/js/guard.js';
import { createDiagnostics } from '../../shared/js/diagnostics.js';
import { runLeadFlow, createIdentityStore } from '../../shared/js/lead-flow.js';
import { validateConfig } from '../../shared/js/config.js';

const config = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));
const INWEB = config.inweb;
const PHONE_FIELD = config.fields.find((f) => f.type === 'tel');

// --- Adapter -------------------------------------------------------------------------

test('adapter: SDK-shaped payload (object by input id, checkbox array) → Lead Flow input', () => {
  const { rawValues, missing, unmapped } = adaptInWebSubmission({ ...INWEB_FIXTURE }, INWEB, PHONE_FIELD);
  assert.deepEqual(rawValues, {
    name: 'Ana Prueba', email: 'ana@example.com', phone: '300 123 4567', phone_country: 'CO', product: 'Plan Hogar', consent: true,
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(unmapped, []);
});

test('adapter: console ids are mapped from config.fieldMapping', () => {
  const inweb = { ...INWEB, fieldMapping: { name: 'nombre', email: 'correo', country: 'pais', phone: 'telefono', product: 'producto', consent: 'acepto' } };
  const data = { nombre: 'Ana', correo: 'ana@example.com', pais: 'México', telefono: '55 1234 5678', producto: 'Plan Hogar', acepto: ['si'], extra: 'x' };
  const { rawValues, unmapped } = adaptInWebSubmission(data, inweb, PHONE_FIELD);
  assert.equal(rawValues.phone_country, 'MX');
  assert.equal(rawValues.consent, true);
  assert.deepEqual(unmapped, ['extra']);
});

test('adapter: country as ISO, dial code or name; missing country uses the international prefix or the default', () => {
  assert.equal(toCountryIso('co'), 'CO');
  assert.equal(toCountryIso('+593'), 'EC');
  assert.equal(toCountryIso('504'), 'HN');
  assert.equal(toCountryIso('Perú'), 'PE');
  assert.equal(toCountryIso('Peru'), 'PE');
  assert.equal(toCountryIso('Argentina'), null);
  const noCountry = { ...INWEB, fieldMapping: { ...INWEB.fieldMapping, country: undefined } };
  assert.equal(adaptInWebSubmission({ ...INWEB_FIXTURE, phone: '+52 55 1234 5678' }, noCountry, PHONE_FIELD).rawValues.phone_country, 'MX');
  assert.equal(adaptInWebSubmission({ ...INWEB_FIXTURE, phone: '3001234567' }, noCountry, PHONE_FIELD).rawValues.phone_country, 'CO');
});

test('adapter: consent from checkbox array, booleans and strings; unchecked is false', () => {
  assert.equal(toConsent(['acepto']), true);
  assert.equal(toConsent([]), false);
  assert.equal(toConsent(undefined), false);
  assert.equal(toConsent('true'), true);
  assert.equal(adaptInWebSubmission({ ...INWEB_FIXTURE, consent: undefined }, INWEB, PHONE_FIELD).rawValues.consent, false);
});

test('adapter: defensive shapes (JSON string, [{id,value}], entries) give the same input', () => {
  const asArray = Object.entries(INWEB_FIXTURE).map(([id, value]) => ({ id, value }));
  const asMap = new Map(Object.entries(INWEB_FIXTURE));
  for (const shape of [JSON.stringify(INWEB_FIXTURE), asArray, asMap]) {
    assert.deepEqual(toPlainObject(shape), { ...INWEB_FIXTURE });
  }
});

test('adapter: missing mapped inputs are reported', () => {
  const { missing } = adaptInWebSubmission({ name: 'Ana' }, INWEB, PHONE_FIELD);
  assert.deepEqual(missing, ['email', 'phone', 'product', 'consent']);
});

test('describeStructure exposes keys and types, never values', () => {
  const d = describeStructure({ ...INWEB_FIXTURE });
  assert.equal(d.container, 'object');
  assert.deepEqual(d.fields, { name: 'string', email: 'string', country: 'string', phone: 'string', product: 'string', consent: 'array(1)' });
  assert.ok(!JSON.stringify(d).includes('ana@example.com'));
});

// --- In-Web client -------------------------------------------------------------------

function stubDocument(viewId) {
  const el = () => ({
    innerHTML: '', className: '', textContent: '', type: '', children: [],
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); }, addEventListener() {},
  });
  const container = el();
  globalThis.document = { getElementById: (id) => (id === viewId ? container : null), createElement: el };
  return container;
}

function makeInWeb(simOpts = {}, inwebOverrides = {}) {
  stubDocument(INWEB.viewId);
  const sim = createSdkSimulator({ latencyMs: 1, ...simOpts });
  const events = [];
  const inweb = createInWebClient({
    getSdk: () => sim, appKey: config.indigitall.appKey, inweb: { ...INWEB, ...inwebOverrides },
    onEvent: (type, detail) => events.push({ type, detail }), timeoutMs: 200,
  });
  return { sim, inweb, events };
}
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const lastState = (events) => events.filter((e) => e.type === 'state').at(-1)?.detail;

test('show: documented config only (no requestLocation/logLevel), rendered once, not re-requested', async () => {
  const { sim, inweb, events } = makeInWeb();
  assert.equal(inweb.show(), true);
  await wait();
  assert.equal(inweb.state, INWEB_STATES.RENDERED);
  const cfg = sim.calls.find((c) => c.method === 'InApp.showInAppWithCallback').args[0];
  assert.deepEqual(Object.keys(cfg).sort(), ['appKey', 'inAppCode', 'viewId']);
  assert.equal(cfg.inAppCode, 'demo_inweb_lead_capture');
  assert.equal(inweb.show(), false, 'switching tabs does not request it again');
  assert.equal(sim.calls.filter((c) => c.method === 'InApp.showInAppWithCallback').length, 1);
  assert.ok(events.some((e) => e.type === 'state' && e.detail.state === 'requesting'));
});

test('show: urlInAppApi and profile only when configured', async () => {
  const { sim, inweb } = makeInWeb({}, { urlInAppApi: 'https://eu2.device-api.indigitall.com/v2', profile: 'demo' });
  inweb.show();
  const cfg = sim.calls.find((c) => c.method === 'InApp.showInAppWithCallback').args[0];
  assert.equal(cfg.urlInAppApi, 'https://eu2.device-api.indigitall.com/v2');
  assert.equal(cfg.profile, 'demo');
});

test('campaign not found (404 INAPP_SCHEMA_NOT_FOUND) → unavailable, not error', async () => {
  const { inweb, events } = makeInWeb({ inweb: { outcome: 'notfound' } });
  inweb.show();
  await wait();
  assert.equal(inweb.state, INWEB_STATES.UNAVAILABLE);
  assert.equal(lastState(events).code, 'INAPP_SCHEMA_NOT_FOUND');
});

test('technical error → error state, and a retry is allowed', async () => {
  const { inweb } = makeInWeb({ inweb: { outcome: 'error' } });
  inweb.show();
  await wait();
  assert.equal(inweb.state, INWEB_STATES.ERROR);
  assert.equal(inweb.show(), true);
});

test('no inAppCode or no container → explicit states, no SDK call', () => {
  const a = makeInWeb({}, { inAppCode: null });
  assert.equal(a.inweb.show(), false);
  assert.equal(lastState(a.events).code, 'NO_INAPP_CODE');
  const b = makeInWeb({}, { viewId: 'missing-container' });
  assert.equal(b.inweb.show(), false);
  assert.equal(lastState(b.events).code, 'CONTAINER_NOT_FOUND');
  assert.ok(!b.sim.calls.some((c) => c.method === 'InApp.showInAppWithCallback'));
});

test('isUnavailableError classifies frequency/expiry/not-found codes', () => {
  assert.ok(isUnavailableError({ statusCode: 404 }));
  assert.ok(isUnavailableError({ errorCode: { code: 'INAPP_WAS_EXPIRED', errorId: 2101 } }));
  assert.ok(isUnavailableError({ errorCode: { code: 'X', errorId: 2102 } }));
  assert.ok(!isUnavailableError({ errorCode: { code: 'INAPP_ERROR', errorId: 2000 } }));
});

// --- In-Web → shared Lead Flow ---------------------------------------------------------

async function leadSetup() {
  const sim = createSdkSimulator({ latencyMs: 1 });
  const client = createIndigitallClient({
    getSdk: () => sim, settings: { ...config.indigitall, workerPath: '/static-web-page/indigitall/worker.min.js' }, timeoutMs: 200,
  });
  await client.init();
  const guard = createGuard({ scope: 'inweb-test' });
  const diag = createDiagnostics({ enabled: true });
  const identityStore = createIdentityStore({ scope: 'inweb-test', storage: null });
  return { sim, client, guard, diag, identityStore };
}

test('In-Web lead: same six CDP attributes, Origen = demo_inweb_lead_capture, same event contract', async () => {
  const s = await leadSetup();
  const { rawValues } = adaptInWebSubmission({ ...INWEB_FIXTURE, product: 'Plan Empresas' }, INWEB, PHONE_FIELD);
  const r = await runLeadFlow({ config, rawValues, client: s.client, guard: s.guard, diag: s.diag, identityStore: s.identityStore, staticAttributes: INWEB.staticAttributes });
  assert.equal(r.status, 'sent');
  const fields = s.sim.calls.find((c) => c.method === 'assignOrUpdateValueToCustomerFields').args[0];
  assert.deepEqual(fields, {
    name: 'Ana Prueba', email: 'ana@example.com', Phone: 573001234567, Country_code: 57,
    producto_de_interes: 'Plan Empresas', Origen: 'demo_inweb_lead_capture',
  });
  const [code, data] = s.sim.calls.find((c) => c.method === 'sendCustomerCustomEvent').args;
  assert.equal(code, 'lead_submitted');
  assert.deepEqual(data, { name: 'Ana Prueba', phone: '+573001234567', product: 'Plan Empresas', Origen: 'demo_inweb_lead_capture' });
  assert.deepEqual(s.sim.calls.find((c) => c.method === 'link').args, ['ana@example.com', 'push']);
});

test('the native form keeps Origen = demo_cdp_lead_capture (override is per request)', async () => {
  const s = await leadSetup();
  const { rawValues } = adaptInWebSubmission({ ...INWEB_FIXTURE }, INWEB, PHONE_FIELD);
  await runLeadFlow({ config, rawValues, client: s.client, guard: s.guard, diag: s.diag, identityStore: s.identityStore });
  assert.equal(s.sim.calls.find((c) => c.method === 'assignOrUpdateValueToCustomerFields').args[0].Origen, 'demo_cdp_lead_capture');
  assert.equal(config.staticAttributes.Origen, 'demo_cdp_lead_capture');
});

test('a repeated didFormSubmit sends the event once; invalid In-Web data sends nothing', async () => {
  const s = await leadSetup();
  const { rawValues } = adaptInWebSubmission({ ...INWEB_FIXTURE }, INWEB, PHONE_FIELD);
  const run = () => runLeadFlow({ config, rawValues, client: s.client, guard: s.guard, diag: s.diag, identityStore: s.identityStore, staticAttributes: INWEB.staticAttributes });
  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual([a.status, b.status].sort(), ['blocked', 'sent']);
  assert.equal(s.sim.calls.filter((c) => c.method === 'sendCustomerCustomEvent').length, 1);

  const t = await leadSetup();
  const bad = adaptInWebSubmission({ ...INWEB_FIXTURE, consent: [], phone: '12' }, INWEB, PHONE_FIELD).rawValues;
  const r = await runLeadFlow({ config, rawValues: bad, client: t.client, guard: t.guard, diag: t.diag, staticAttributes: INWEB.staticAttributes });
  assert.equal(r.status, 'invalid');
  assert.ok(r.errors.consent && r.errors.phone);
  assert.ok(!t.sim.calls.some((c) => c.method === 'link'));
});

// --- Config ------------------------------------------------------------------------------

test('config: inweb block validation', () => {
  assert.deepEqual(validateConfig(config), []);
  const bad = structuredClone(config);
  bad.inweb.urlInAppApi = 'https://device-api.indigitall.com/v1';
  bad.inweb.width = 0;
  bad.inweb.staticAttributes = { NotACdpField: 'x' };
  delete bad.inweb.fieldMapping.email;
  const problems = validateConfig(bad).join(' | ');
  for (const s of ['urlInAppApi', 'inweb.width', 'NotACdpField', 'fieldMapping.email']) assert.ok(problems.includes(s), s);
});
