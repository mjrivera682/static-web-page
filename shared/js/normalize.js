// Pure validation and normalization helpers. No DOM, no network.

/** Country calling codes for the markets we demo in. Extend as needed. */
export const COUNTRY_CODES = {
  AR: '54', BO: '591', BR: '55', CL: '56', CO: '57', CR: '506', DO: '1',
  EC: '593', ES: '34', GT: '502', HN: '504', MX: '52', NI: '505', PA: '507',
  PE: '51', PR: '1', PY: '595', SV: '503', US: '1', UY: '598', VE: '58',
};

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
 * Normalize a phone number to E.164 (`+<country><number>`).
 * Accepts "+57 300 123 4567", "0057...", "573001234567" or a national number
 * (then `defaultCountry` is prepended). E.164 allows at most 15 digits.
 */
export function normalizePhone(raw, { defaultCountry } = {}) {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'required' };
  if (/[^\d\s()+.\-]/.test(input)) return { ok: false, error: 'invalid_phone' };

  let digits = input.replace(/\D/g, '');
  const hasPlus = input.startsWith('+');
  if (!hasPlus && digits.startsWith('00')) digits = digits.slice(2);
  else if (!hasPlus) {
    const cc = defaultCountry && COUNTRY_CODES[defaultCountry];
    if (!cc) return { ok: false, error: 'unknown_country' };
    if (!digits.startsWith(cc) || digits.length <= cc.length + 7) {
      digits = cc + digits.replace(/^0+/, '');
    }
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    return { ok: false, error: 'invalid_phone' };
  }
  return { ok: true, value: `+${digits}` };
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

function normalizeField(field, raw) {
  switch (field.type) {
    case 'email': return normalizeEmail(raw);
    case 'tel': return normalizePhone(raw, field.normalize ?? {});
    case 'select': return normalizeChoice(raw, field.options);
    case 'checkbox': return normalizeCheckbox(raw);
    default: return normalizeName(raw, { maxLength: field.maxLength ?? 100 });
  }
}

/**
 * Validate raw form values against the demo's field definitions.
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
    const result = normalizeField(field, raw);
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
      if (!values.phone) throw new Error('externalId strategy "phone" needs a phone field');
      return prefix + values.phone;
    default:
      throw new Error(`Unknown externalId strategy: ${identity?.strategy}`);
  }
}

/** Map form values to CDP field names, then add the demo's static attributes. */
export function buildCustomerFields(fields, values, staticAttributes = {}) {
  const out = {};
  for (const field of fields) {
    if (field.cdpField && values[field.id] !== undefined) out[field.cdpField] = values[field.id];
  }
  return { ...out, ...staticAttributes };
}

/** Build the journey event payload: only the form fields the event config asks for. */
export function buildEventData(eventConfig, values) {
  const data = {};
  for (const id of eventConfig.data ?? []) {
    if (values[id] !== undefined) data[id] = values[id];
  }
  return data;
}
