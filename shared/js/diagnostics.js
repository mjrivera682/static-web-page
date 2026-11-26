// Optional diagnostics: a structured log of every SDK step with masked personal data.
// The log is kept in memory only and never sent anywhere.

export function maskEmail(value) {
  const s = String(value ?? '');
  const at = s.indexOf('@');
  if (at < 1) return '***';
  const domain = s.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${s[0]}***@${host[0] ?? ''}***${tld}`;
}

export function maskPhone(value) {
  const s = String(value ?? '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${s.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}${'*'.repeat(digits.length - 6)}${digits.slice(-4)}`;
}

/** Technical identifiers (Device ID): keep the ends so two devices can be told apart. */
export function maskId(value) {
  const s = String(value ?? '');
  if (s.length <= 8) return s ? `${s[0]}***` : '';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function maskText(value) {
  const s = String(value ?? '');
  return s ? `${s[0]}***` : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const PHONE_RE = /^\+?\d[\d\s\-()]{6,}$/;
const SAFE_KEYS = new Set([
  'product', 'producto_de_interes', 'Country_code', 'Origen', 'contact_consent', 'submitted_at', 'eventCode', 'eventAt',
  'eventId', 'channel', 'pushMode', 'version', 'status', 'code', 'permission', 'workerPath', 'scope', 'push',
  'location', 'steps', 'declared', 'loaded',
  // SDK error fields: needed to diagnose failures.
  'errorMessage', 'errorCode', 'statusCode', 'message',
]);

/** Mask any value that looks personal. Keys in SAFE_KEYS (non-personal) are shown as-is. */
export function maskValue(key, value) {
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    // Numeric phone (CDP "Phone") must be masked too; short numbers (codes, counts) are not personal.
    if (SAFE_KEYS.has(key) || (!/phone/i.test(key) && String(Math.abs(value)).length < 7)) return value;
    return maskPhone(String(value));
  }
  if (typeof value === 'object') return maskObject(value);
  const s = String(value);
  if (SAFE_KEYS.has(key)) return s;
  if (/app.?key/i.test(key)) return '[redacted]';
  if (EMAIL_RE.test(s)) return maskEmail(s);
  if (PHONE_RE.test(s)) return maskPhone(s);
  return maskText(s);
}

export function maskObject(obj) {
  if (Array.isArray(obj)) return obj.map((v, i) => maskValue(String(i), v));
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[k] = maskValue(k, v);
  return out;
}

/**
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {() => number} [opts.now]
 * @param {(entry: object) => void} [opts.onEntry]  UI hook
 */
export function createDiagnostics({ enabled, now = () => performance.now(), onEntry } = {}) {
  const entries = [];
  const state = {
    mode: null, sdkDeclaredVersion: null, sdkVersion: null, sdk: 'not loaded',
    init: 'idle', permission: null, swUrl: null, sw: null,
    device: 'not registered', deviceId: null,
    linkChannel: null, identity: 'anonymous', externalId: null,
    cdp: null, event: null, lastConfirmation: null,
  };

  function push(entry) {
    const full = { at: new Date().toISOString(), ...entry };
    entries.push(full);
    if (enabled && onEntry) onEntry(full, state);
  }

  return {
    enabled: Boolean(enabled),
    state,
    entries,
    set(patch) { Object.assign(state, patch); if (enabled && onEntry) onEntry(null, state); },
    info(message, data) { push({ level: 'info', message, data: data && maskObject(data) }); },

    /**
     * Time one SDK operation. `payload` is masked before it is stored.
     * Re-throws the operation's error after logging it.
     */
    async step(name, payload, fn) {
      const start = now();
      push({ level: 'start', step: name, payload: payload && maskObject(payload) });
      try {
        const result = await fn();
        push({ level: 'ok', step: name, ms: Math.round(now() - start), response: summarize(result) });
        return result;
      } catch (err) {
        push({ level: 'error', step: name, ms: Math.round(now() - start), error: describeError(err) });
        throw err;
      }
    },
  };
}

function summarize(result) {
  if (result === undefined || result === null) return null;
  if (typeof result !== 'object') return maskValue('status', result);
  try { return maskObject(JSON.parse(JSON.stringify(result))); } catch { return '[unserializable]'; }
}

export function describeError(err) {
  if (!err) return { code: 'UNKNOWN' };
  return {
    code: err.code ?? 'UNKNOWN',
    message: err.message ?? String(err),
    sdk: err.sdkError ? summarize(err.sdkError) : undefined,
  };
}
