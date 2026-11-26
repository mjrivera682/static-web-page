import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeEmail, normalizePhone, normalizeName, validateLead, buildExternalId,
  buildCustomerFields, buildEventData, resolveValue,
} from '../../shared/js/normalize.js';
import { COUNTRIES, countryFromInternational, flagSvg } from '../../shared/js/countries.js';

const config = JSON.parse(readFileSync(new URL('../../demos/cdp-lead-capture/demo.config.json', import.meta.url), 'utf8'));
const ALL = ['CO', 'MX', 'PE', 'CL', 'US', 'EC', 'HN', 'ES'];

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

// --- Phone by country -------------------------------------------------------------

const VALID = {
  CO: ['300 123 4567', '573001234567', '+573001234567', '601 234 5678'],
  MX: ['55 1234 5678', '+52 55 1234 5678'],
  PE: ['912 345 678', '+51 912 345 678'],
  CL: ['9 1234 5678', '+56 9 1234 5678'],
  US: ['(201) 555-0123', '+1 201 555 0123'],
  EC: ['99 123 4567', '099 123 4567', '+593 99 123 4567'],
  HN: ['9123 4567', '+504 9123 4567'],
  ES: ['612 34 56 78', '0034 612 345 678'],
};
const EXPECTED = {
  CO: ['573001234567', '573001234567', '573001234567', '576012345678'],
  MX: ['525512345678', '525512345678'],
  PE: ['51912345678', '51912345678'],
  CL: ['56912345678', '56912345678'],
  US: ['12015550123', '12015550123'],
  EC: ['593991234567', '593991234567', '593991234567'],
  HN: ['50491234567', '50491234567'],
  ES: ['34612345678', '34612345678'],
};

for (const iso of ALL) {
  test(`phone ${iso}: national and international inputs → same E.164, never a duplicated code`, () => {
    VALID[iso].forEach((input, i) => {
      const r = normalizePhone(input, { country: iso, countries: ALL });
      assert.equal(r.ok, true, `${iso} "${input}" → ${r.error}`);
      assert.equal(r.value.digits, EXPECTED[iso][i], input);
      assert.equal(r.value.e164, `+${EXPECTED[iso][i]}`);
      assert.equal(r.value.countryCode, COUNTRIES[iso].dial);
      assert.ok(!r.value.national.startsWith(COUNTRIES[iso].dial + COUNTRIES[iso].dial));
    });
  });
}

test('phone: invalid length or prefix for the selected country', () => {
  assert.equal(normalizePhone('300 123 456', { country: 'CO' }).error, 'invalid_phone_country');
  assert.equal(normalizePhone('512 345 678', { country: 'ES' }).error, 'invalid_phone_country');
  assert.equal(normalizePhone('1234 5678', { country: 'HN' }).error, 'invalid_phone_country');
  assert.equal(normalizePhone('101 555 0123', { country: 'US' }).error, 'invalid_phone_country');
});

test('phone: an international number of another country is rejected, not re-labelled', () => {
  const r = normalizePhone('+52 55 1234 5678', { country: 'CO', countries: ALL });
  assert.equal(r.error, 'country_mismatch');
  assert.equal(r.detected, 'MX');
  assert.equal(normalizePhone('+44 7700 900123', { country: 'CO', countries: ALL }).error, 'unsupported_country');
});

test('phone: letters, misplaced +, empty, unknown country', () => {
  assert.equal(normalizePhone('300-ABC-4567', { country: 'CO' }).error, 'invalid_phone');
  assert.equal(normalizePhone('300+1234567', { country: 'CO' }).error, 'invalid_phone');
  assert.equal(normalizePhone('', { country: 'CO' }).error, 'required');
  assert.equal(normalizePhone('3001234567', { country: 'AR', countries: ALL }).error, 'unknown_country');
});

test('countryFromInternational prefers the longest dial code', () => {
  assert.equal(countryFromInternational('593991234567'), 'EC');
  assert.equal(countryFromInternational('50491234567'), 'HN');
  assert.equal(countryFromInternational('12015550123'), 'US');
});

test('flags are inline SVG for every country (no external images)', () => {
  for (const iso of ALL) assert.match(flagSvg(iso), /^<svg[^>]*viewBox="0 0 30 20"/);
});

// --- Lead validation and CDP mapping ------------------------------------------------

const RAW = { name: ' Carlos  García ', email: 'Carlos@Example.com', phone: '300 123 4567', phone_country: 'CO', product: 'Plan Hogar', consent: true };

test('validateLead uses the selected country for the phone', () => {
  const r = validateLead(config.fields, { ...RAW, phone: '55 1234 5678', phone_country: 'MX' });
  assert.equal(r.ok, true);
  assert.equal(r.values.phone.e164, '+525512345678');
  assert.equal(validateLead(config.fields, { ...RAW, phone: '55 1234 567', phone_country: 'MX' }).errors.phone, 'invalid_phone_country');
});

test('validateLead: consent is mandatory, product must be in the list', () => {
  assert.equal(validateLead(config.fields, { ...RAW, consent: false }).errors.consent, 'required');
  assert.equal(validateLead(config.fields, { ...RAW, product: 'Z' }).errors.product, 'invalid_option');
});

test('CDP attributes: existing fields only, Phone and Country_code are numbers', () => {
  const { values } = validateLead(config.fields, RAW);
  const fields = buildCustomerFields(config.cdpMapping, values, config.staticAttributes);
  assert.deepEqual(fields, {
    name: 'Carlos García',
    email: 'carlos@example.com',
    Phone: 573001234567,
    Country_code: 57,
    producto_de_interes: 'Plan Hogar',
    Origen: 'demo_cdp_lead_capture',
  });
  assert.equal(typeof fields.Phone, 'number');
  assert.equal(typeof fields.Country_code, 'number');
  assert.ok(!('phone' in fields) && !('lead_source' in fields));
});

for (const [iso, national, phoneNum, cc] of [
  ['MX', '55 1234 5678', 525512345678, 52], ['PE', '912 345 678', 51912345678, 51],
  ['CL', '9 1234 5678', 56912345678, 56], ['US', '201 555 0123', 12015550123, 1],
  ['EC', '99 123 4567', 593991234567, 593], ['HN', '9123 4567', 50491234567, 504],
  ['ES', '612 34 56 78', 34612345678, 34],
]) {
  test(`CDP Phone/Country_code numeric for ${iso}`, () => {
    const { values, ok } = validateLead(config.fields, { ...RAW, phone: national, phone_country: iso });
    assert.ok(ok);
    const f = buildCustomerFields(config.cdpMapping, values, config.staticAttributes);
    assert.equal(f.Phone, phoneNum);
    assert.equal(f.Country_code, cc);
    assert.ok(Number.isSafeInteger(f.Phone) && Number.isSafeInteger(f.Country_code));
  });
}

test('event payload: phone is an E.164 string with +, plus Origen', () => {
  const { values } = validateLead(config.fields, RAW);
  const data = buildEventData(config.event, values);
  assert.deepEqual(data, { name: 'Carlos García', phone: '+573001234567', product: 'Plan Hogar' });
  assert.equal(typeof data.phone, 'string');
});

test('externalId: email, never random; phone strategy uses E.164', () => {
  const { values } = validateLead(config.fields, RAW);
  assert.equal(buildExternalId({ strategy: 'email' }, values), 'carlos@example.com');
  assert.equal(buildExternalId({ strategy: 'phone' }, values), '+573001234567');
  assert.throws(() => buildExternalId({ strategy: 'device' }, values));
});

test('resolveValue reads phone parts and rejects mapping a whole phone object', () => {
  const { values } = validateLead(config.fields, RAW);
  assert.equal(resolveValue(values, 'phone.countryCode'), '57');
  assert.throws(() => buildCustomerFields([{ cdpField: 'X', from: 'phone', type: 'string' }], values));
});
