// Converts the data an In-Web form delivers to the Lead Flow's input contract
// (the same raw values the SDK form produces). No validation here: normalize.js does it.
//
// Real payload (SDK 4.18.1, inAppIndigitallSubmit in sdk.min.js): didFormSubmit(inApp, data)
// receives `data` = plain object keyed by each input's console *id*:
//   text / number / select / radio → string; checkbox → array of checked values;
//   empty inputs are omitted. Other shapes (JSON string, [{id, value}], entries) are
//   accepted defensively in case a future SDK changes the wrapper.

import { COUNTRIES, countryFromInternational } from './countries.js';

/** Flatten the payload into { inputId: value }. */
export function toPlainObject(data) {
  if (data == null) return {};
  if (typeof data === 'string') {
    try { return toPlainObject(JSON.parse(data)); } catch { return {}; }
  }
  if (typeof data.entries === 'function' && !Array.isArray(data)) { // FormData / Map
    const out = {};
    for (const [k, v] of data.entries()) out[k] = k in out ? [].concat(out[k], v) : v;
    return out;
  }
  if (Array.isArray(data)) {
    const out = {};
    for (const item of data) {
      const k = item?.id ?? item?.name ?? item?.key;
      if (k !== undefined) out[k] = item.value;
    }
    return out;
  }
  if (typeof data === 'object') return { ...data };
  return {};
}

function first(v) { return Array.isArray(v) ? v[0] : v; }

/** Checkbox arrives as an array of checked values: any checked value means consent. */
export function toConsent(v) {
  if (Array.isArray(v)) return v.some((x) => x !== '' && x != null && String(x).toLowerCase() !== 'false');
  if (typeof v === 'boolean') return v;
  return ['true', 'on', 'si', 'sí', 'yes', '1', 'acepto'].includes(String(v ?? '').trim().toLowerCase());
}

/** Country as ISO code ("CO"), dial code ("57", "+57") or name ("Colombia", "Perú"). */
export function toCountryIso(v, allowed = Object.keys(COUNTRIES)) {
  const s = String(first(v) ?? '').trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (allowed.includes(up)) return up;
  const digits = s.replace(/\D/g, '');
  if (digits && /^\+?\d+$/.test(s.replace(/\s/g, ''))) {
    const exact = allowed.find((iso) => COUNTRIES[iso].dial === digits);
    if (exact) return exact;
  }
  const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return allowed.find((iso) => norm(COUNTRIES[iso].name) === norm(s)) ?? null;
}

/**
 * @param {any} data              didFormSubmit payload
 * @param {object} inweb          config.inweb (fieldMapping, defaultCountry)
 * @param {object} phoneField     the config field of type "tel" (countries, defaultCountry)
 * @returns {{rawValues: object, missing: string[], unmapped: string[]}}
 *   rawValues matches the SDK form: { name, email, phone, phone_country, product, consent }
 */
export function adaptInWebSubmission(data, inweb, phoneField) {
  const map = inweb.fieldMapping ?? {};
  const flat = toPlainObject(data);
  const pick = (key) => (map[key] ? flat[map[key]] : undefined);
  const allowed = phoneField?.countries ?? Object.keys(COUNTRIES);

  const phoneRaw = String(first(pick('phone')) ?? '').trim();
  let country = toCountryIso(pick('country'), allowed);
  // No country input: an international number carries its own code; otherwise use the default.
  if (!country) {
    const intl = phoneRaw.startsWith('+') ? phoneRaw.replace(/\D/g, '')
      : phoneRaw.replace(/\D/g, '').startsWith('00') ? phoneRaw.replace(/\D/g, '').slice(2) : '';
    country = (intl && countryFromInternational(intl, allowed)) || inweb.defaultCountry || phoneField?.defaultCountry || null;
  }

  const rawValues = {
    name: first(pick('name')) ?? '',
    email: first(pick('email')) ?? '',
    phone: phoneRaw,
    phone_country: country ?? '',
    product: first(pick('product')) ?? '',
    consent: toConsent(pick('consent')),
  };
  const mappedIds = new Set(Object.values(map));
  return {
    rawValues,
    missing: ['name', 'email', 'phone', 'product', 'consent'].filter((k) => map[k] && !(map[k] in flat)),
    unmapped: Object.keys(flat).filter((k) => !mappedIds.has(k)),
  };
}

/** Structure of the payload for diagnostics: keys and types only, no values. */
export function describeStructure(data) {
  const kind = (v) => (Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v);
  const container = data == null ? 'null' : Array.isArray(data) ? 'array'
    : typeof data === 'string' ? 'string(JSON?)' : typeof data?.entries === 'function' ? 'FormData-like' : typeof data;
  const flat = toPlainObject(data);
  return { container, fields: Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, kind(v)])) };
}
