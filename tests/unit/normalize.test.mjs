import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail, normalizePhone, normalizeName, validateLead, buildExternalId,
  buildCustomerFields, buildEventData,
} from '../../shared/js/normalize.js';

test('email: trims and lowercases', () => {
  assert.deepEqual(normalizeEmail('  Ana.Perez@Example.COM '), { ok: true, value: 'ana.perez@example.com' });
});

test('email: rejects invalid values', () => {
  for (const bad of ['', 'ana', 'ana@', '@x.com', 'ana@x', 'a b@x.com']) {
    assert.equal(normalizeEmail(bad).ok, false, bad);
  }
});

test('name: collapses whitespace and enforces length', () => {
  assert.equal(normalizeName('  Ana   María  ').value, 'Ana María');
  assert.equal(normalizeName('x'.repeat(101)).error, 'too_long');
  assert.equal(normalizeName('   ').error, 'required');
});

test('phone: national number gets the default country code', () => {
  assert.equal(normalizePhone('300 123 4567', { defaultCountry: 'CO' }).value, '+573001234567');
  assert.equal(normalizePhone('612 34 56 78', { defaultCountry: 'ES' }).value, '+34612345678');
});

test('phone: international formats are kept', () => {
  assert.equal(normalizePhone('+57 (300) 123-4567', { defaultCountry: 'ES' }).value, '+573001234567');
  assert.equal(normalizePhone('0057 300 123 4567', { defaultCountry: 'ES' }).value, '+573001234567');
  assert.equal(normalizePhone('573001234567', { defaultCountry: 'CO' }).value, '+573001234567');
});

test('phone: rejects letters, too short, too long, unknown country', () => {
  assert.equal(normalizePhone('300-ABC-4567', { defaultCountry: 'CO' }).error, 'invalid_phone');
  assert.equal(normalizePhone('+12345', {}).error, 'invalid_phone');
  assert.equal(normalizePhone('+1234567890123456', {}).error, 'invalid_phone');
  assert.equal(normalizePhone('3001234567', {}).error, 'unknown_country');
});

const FIELDS = [
  { id: 'name', type: 'text', required: true, cdpField: 'name' },
  { id: 'email', type: 'email', required: true, cdpField: 'email' },
  { id: 'phone', type: 'tel', required: true, cdpField: 'phone', normalize: { defaultCountry: 'CO' } },
  { id: 'product', type: 'select', required: true, cdpField: 'product_interest', options: ['A', 'B'] },
  { id: 'consent', type: 'checkbox', required: true, cdpField: 'contact_consent' },
];

const RAW = { name: ' Ana ', email: 'ANA@x.com', phone: '3001234567', product: 'A', consent: true };

test('validateLead: normalizes a valid lead', () => {
  const r = validateLead(FIELDS, RAW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.values, { name: 'Ana', email: 'ana@x.com', phone: '+573001234567', product: 'A', consent: true });
});

test('validateLead: consent is mandatory', () => {
  const r = validateLead(FIELDS, { ...RAW, consent: false });
  assert.equal(r.ok, false);
  assert.equal(r.errors.consent, 'required');
});

test('validateLead: option must be in the list', () => {
  assert.equal(validateLead(FIELDS, { ...RAW, product: 'Z' }).errors.product, 'invalid_option');
});

test('externalId: deterministic by strategy, never random', () => {
  const values = validateLead(FIELDS, RAW).values;
  assert.equal(buildExternalId({ strategy: 'email' }, values), 'ana@x.com');
  assert.equal(buildExternalId({ strategy: 'email' }, values), buildExternalId({ strategy: 'email' }, values));
  assert.equal(buildExternalId({ strategy: 'phone', prefix: 'demo:' }, values), 'demo:+573001234567');
  assert.throws(() => buildExternalId({ strategy: 'device' }, values));
});

test('customer fields use cdpField names plus static attributes', () => {
  const values = validateLead(FIELDS, RAW).values;
  assert.deepEqual(buildCustomerFields(FIELDS, values, { lead_source: 'web' }), {
    name: 'Ana', email: 'ana@x.com', phone: '+573001234567', product_interest: 'A', contact_consent: true, lead_source: 'web',
  });
});

test('event data contains only the declared fields', () => {
  const values = validateLead(FIELDS, RAW).values;
  assert.deepEqual(buildEventData({ data: ['product'] }, values), { product: 'A' });
});
