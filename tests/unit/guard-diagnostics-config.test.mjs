import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createGuard } from '../../shared/js/guard.js';
import { maskEmail, maskPhone, maskObject, createDiagnostics } from '../../shared/js/diagnostics.js';
import { validateConfig } from '../../shared/js/config.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('guard: blocks concurrent submissions', () => {
  const g = createGuard({ scope: 't' });
  assert.ok(g.acquire('a'));
  assert.equal(g.acquire('a'), null);
});

test('guard: retry of the same data keeps the submission id', () => {
  const g = createGuard({ scope: 't' });
  const id1 = g.acquire('a');
  g.release();
  assert.equal(g.acquire('a'), id1);
  g.release();
  assert.notEqual(g.acquire('b'), id1);
});

test('guard: cooldown after a completed submission', () => {
  let now = 1_000_000;
  const g = createGuard({ scope: 't', cooldownSeconds: 60, storage: memoryStorage(), now: () => now });
  g.acquire('a');
  g.complete();
  assert.equal(g.acquire('a'), null);
  assert.equal(g.cooldownRemaining(), 60);
  now += 61_000;
  assert.ok(g.acquire('a'));
});

test('guard: honeypot', () => {
  const g = createGuard({ scope: 't' });
  assert.equal(g.isBot(''), false);
  assert.equal(g.isBot('http://spam'), true);
});

test('masking never leaks full values', () => {
  assert.equal(maskEmail('ana.perez@example.com'), 'a***@e***.com');
  assert.equal(maskPhone('+573001234567'), '+57******4567');
  const out = JSON.stringify(maskObject({
    name: 'Ana Pérez', email: 'ana.perez@example.com', phone: '+573001234567',
    appKey: '00000000-0000-0000-0000-000000000000', product: 'Plan A', contact_consent: true,
  }));
  for (const secret of ['Ana Pérez', 'ana.perez@example.com', '3001234567', '00000000-0000']) {
    assert.ok(!out.includes(secret), `leaked ${secret}`);
  }
  assert.ok(out.includes('Plan A'));
});

test('diagnostics: records timing and masks payloads', async () => {
  let t = 0;
  const d = createDiagnostics({ enabled: true, now: () => (t += 5) });
  await d.step('setFields', { email: 'ana@x.com' }, async () => 'ok');
  await assert.rejects(d.step('sendEvent', null, async () => { throw Object.assign(new Error('boom'), { code: 'API_ERROR' }); }));
  assert.equal(d.entries[0].payload.email, 'a***@x***.com');
  assert.equal(d.entries[1].level, 'ok');
  assert.equal(typeof d.entries[1].ms, 'number');
  assert.equal(d.entries[3].error.code, 'API_ERROR');
});

const base = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));

test('config: every demo config in demos/ is valid', () => {
  const dir = new URL('../../demos/', import.meta.url);
  for (const name of readdirSync(dir)) {
    const file = new URL(`${name}/demo.config.json`, dir);
    if (!existsSync(file)) continue;
    assert.deepEqual(validateConfig(JSON.parse(readFileSync(file, 'utf8'))), [], name);
  }
});

test('config: password fields are rejected', () => {
  const c = structuredClone(base);
  c.fields.push({ id: 'password', type: 'text', required: true, cdpField: 'password' });
  assert.ok(validateConfig(c).some((p) => p.includes('passwords')));
});

test('config: live mode needs a real appKey', () => {
  const c = structuredClone(base);
  c.mode = 'live';
  c.indigitall.appKey = 'REPLACE_WITH_DEMO_APP_KEY';
  assert.ok(validateConfig(c).some((p) => p.includes('real appKey')));
  c.indigitall.appKey = '11111111-2222-3333-4444-555555555555';
  assert.deepEqual(validateConfig(c), []);
});

test('config: live mode needs Web Push enabled (SDK 4.18.1 link requires it)', () => {
  const c = structuredClone(base);
  c.mode = 'live';
  c.indigitall.pushMode = 'disabled';
  assert.ok(validateConfig(c).some((p) => p.includes('pushMode "enabled"')));
});

test('config: profile read-back cannot be re-enabled', () => {
  const c = structuredClone(base);
  assert.equal(c.flow.verifyProfile, 'off');
  for (const v of ['lenient', 'strict']) {
    c.flow.verifyProfile = v;
    assert.ok(validateConfig(c).some((p) => p.includes('verifyProfile')));
  }
});

test('config: identity strategy must match a required field', () => {
  const c = structuredClone(base);
  c.identity.strategy = 'phone';
  c.fields = c.fields.filter((f) => f.id !== 'phone');
  c.event.data = c.event.data.filter((id) => id !== 'phone');
  assert.ok(validateConfig(c).some((p) => p.includes('identity.strategy')));
});

test('config: event data must reference existing fields', () => {
  const c = structuredClone(base);
  c.event.data = ['nope'];
  assert.ok(validateConfig(c).some((p) => p.includes('unknown field nope')));
});
