// Pure validation, normalization and CDP mapping helpers. No DOM, no network.

import { COUNTRIES, countryFromInternational } from './countries.js';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return { ok: false, error: 'required' };
  if (value.length > 254 || !EMAIL_RE.test(value)) return { ok: false, error: 'invalid_email' };
  return { ok: true, value };
}

export function normalizeName(raw, { maxLength = 100 } = {}) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'required' };
  if (value.length > maxLength) return { ok: false, error: 'too_long' };
  return { ok: true, value };
}

/**
 * Validate a phone number for the selected country and normalize it.
 * Accepts the national number ("300 123 4567"), the national number with the country
 * code typed again ("57 300 123 4567") or a full international number ("+57 300…",
 * "0057 300…"); the country code is never duplicated. An international number must
 * belong to the selected country.
 * @returns {{ok: true, value: {country, countryCode, national, digits, e164}} | {ok: false, error: string}}
 */
export function normalizePhone(raw, { country, countries } = {}) {
  const allowed = countries?.length ? countries : Object.keys(COUNTRIES);
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'required' };
  if (/[^\d\s()+.\-]/.test(input) || (input.indexOf('+') > 0)) return { ok: false, error: 'invalid_phone' };
  const meta = COUNTRIES[country];
  if (!meta || !allowed.includes(country)) return { ok: false, error: 'unknown_country' };

  let digits = input.replace(/\D/g, '');
  let national;
  if (input.startsWith('+') || digits.startsWith('00')) {
    const intl = input.startsWith('+') ? digits : digits.slice(2);
    const iso = countryFromInternational(intl, allowed);
    if (!iso) return { ok: false, error: 'unsupported_country' };
    if (iso !== country) return { ok: false, error: 'country_mismatch', detected: iso };
    national = intl.slice(meta.dial.length);
  } else {
    national = digits;
    // Country code typed again without "+": strip it only if what remains is valid.
    if (!meta.national.test(national) && national.startsWith(meta.dial)
      && meta.national.test(national.slice(meta.dial.length))) {
      national = national.slice(meta.dial.length);
    }
  }
  // National trunk prefix "0" (e.g. Ecuador 09…, Perú 01…).
  if (!meta.national.test(national) && national.startsWith('0') && meta.national.test(national.slice(1))) {
    national = national.slice(1);
  }
  if (!meta.national.test(national)) return { ok: false, error: 'invalid_phone_country' };
  const full = meta.dial + national;
  return { ok: true, value: { country, countryCode: meta.dial, national, digits: full, e164: `+${full}` } };
}

export function normalizeChoice(raw, options) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'required' };
  if (Array.isArray(options) && options.length && !options.includes(value)) {
    return { ok: false, error: 'invalid_option' };
  }
  return { ok: true, value };
}

export function normalizeCheckbox(raw) {
  return { ok: true, value: raw === true || raw === 'on' || raw === 'true' };
}

function normalizeField(field, raw, rawValues) {
  switch (field.type) {
    case 'email': return normalizeEmail(raw);
    case 'tel': return normalizePhone(raw, {
      country: rawValues[`${field.id}_country`] || field.defaultCountry,
      countries: field.countries,
    });
    case 'select': return normalizeChoice(raw, field.options);
    case 'checkbox': return normalizeCheckbox(raw);
    default: return normalizeName(raw, { maxLength: field.maxLength ?? 100 });
  }
}

/**
 * Validate raw form values against the demo's field definitions.
 * A tel field reads its country from rawValues[`${id}_country`].
 * Required checkboxes (e.g. consent) must be ticked.
 * @returns {{ok: boolean, values: Record<string, any>, errors: Record<string, string>}}
 */
export function validateLead(fields, rawValues) {
  const values = {};
  const errors = {};
  for (const field of fields) {
    const raw = rawValues[field.id];
    const empty = raw === undefined || raw === null || String(raw).trim() === '' || raw === false;
    if (!field.required && empty) continue;
    const result = normalizeField(field, raw, rawValues);
    if (!result.ok) { errors[field.id] = result.error; continue; }
    if (field.type === 'checkbox' && field.required && result.value !== true) {
      errors[field.id] = 'required';
      continue;
    }
    values[field.id] = result.value;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Build the External ID from already-normalized values.
 * Never uses the device ID or random values: the same person always maps to the same ID.
 */
export function buildExternalId(identity, values) {
  const prefix = identity?.prefix ?? '';
  switch (identity?.strategy) {
    case 'email':
      if (!values.email) throw new Error('externalId strategy "email" needs an email field');
      return prefix + values.email;
    case 'phone':
      if (!values.phone?.e164) throw new Error('externalId strategy "phone" needs a phone field');
      return prefix + values.phone.e164;
    default:
      throw new Error(`Unknown externalId strategy: ${identity?.strategy}`);
  }
}

/** Read "field" or "field.part" (e.g. "phone.digits") from normalized values. */
export function resolveValue(values, path) {
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), values);
}

function coerce(value, type, name) {
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value));
    if (!Number.isSafeInteger(n)) throw new Error(`${name}: "${value}" is not an integer number`);
    return n;
  }
  if (type === 'boolean') return Boolean(value);
  if (typeof value === 'object') throw new Error(`${name}: object value, map a part (e.g. phone.e164)`);
  return String(value);
}

/**
 * CDP attributes from the demo's cdpMapping (existing CDP fields only), plus static
 * attributes. Each entry: { cdpField, from, type: "string" | "number" | "boolean" }.
 */
export function buildCustomerFields(mapping, values, staticAttributes = {}) {
  const out = {};
  for (const m of mapping) {
    const v = resolveValue(values, m.from);
    if (v === undefined) continue;
    out[m.cdpField] = coerce(v, m.type ?? 'string', m.cdpField);
  }
  return { ...out, ...staticAttributes };
}

/** Journey event payload. event.data entries: { key, from, type? }. */
export function buildEventData(eventConfig, values) {
  const data = {};
  for (const d of eventConfig.data ?? []) {
    const v = resolveValue(values, d.from);
    if (v !== undefined) data[d.key] = coerce(v, d.type ?? 'string', d.key);
  }
  return data;
}
