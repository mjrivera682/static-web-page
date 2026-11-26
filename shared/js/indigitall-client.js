// The only module that knows indigitall SDK method names. Every call is turned into a
// Promise with a timeout, so a callback that never fires is reported as an error.
// Methods and signatures follow the official docs:
//   init ............................ /reference/initialization-19
//   link / unlink ................... /reference/integration-25
//   assignOrUpdateValueToCustomerFields /reference/customization-16
//   getCustomer / getCustomerInformation /reference/initialization-19
//   sendCustomerCustomEvent ......... /reference/custom-events-1

export class SdkError extends Error {
  constructor(code, message, sdkError) {
    super(message);
    this.name = 'SdkError';
    this.code = code;
    this.sdkError = sdkError;
  }
}

/** Load a classic <script> (the SDK is not an ES module). */
export function loadScript(src, doc = globalThis.document) {
  return new Promise((resolve, reject) => {
    const el = doc.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new SdkError('SDK_NOT_LOADED', `Could not load ${src}`));
    doc.head.appendChild(el);
  });
}

/**
 * @param {object} opts
 * @param {() => any} opts.getSdk       returns window.indigitall (or a simulator)
 * @param {object} opts.settings        demo config "indigitall" block
 * @param {number} [opts.timeoutMs]
 * @param {(msg: any) => void} [opts.onSdkError]  SDK global onError messages
 */
export function createIndigitallClient({ getSdk, settings, timeoutMs = 10000, onSdkError }) {
  let initialized = false;

  function sdk() {
    const s = getSdk();
    if (!s || typeof s.init !== 'function') throw new SdkError('SDK_NOT_LOADED', 'indigitall SDK is not available');
    return s;
  }

  function channelNone() {
    return sdk().Channel?.NONE ?? 'none';
  }

  /** Call `method(...args, success, error)` and resolve/reject on its callbacks. */
  function call(method, args) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
      const timer = setTimeout(
        () => finish(reject, new SdkError('TIMEOUT', `${method}: no callback after ${timeoutMs} ms`)),
        timeoutMs,
      );
      try {
        const s = sdk();
        if (typeof s[method] !== 'function') throw new SdkError('METHOD_MISSING', `SDK has no method ${method}`);
        s[method](
          ...args,
          (response) => finish(resolve, response),
          (error) => finish(reject, new SdkError('API_ERROR', `${method} failed`, error)),
        );
      } catch (err) {
        finish(reject, err instanceof SdkError ? err : new SdkError('SDK_EXCEPTION', `${method} threw`, err));
      }
    });
  }

  function requireInit() {
    if (!initialized) throw new SdkError('NOT_INITIALIZED', 'Call init() first');
  }

  return {
    get initialized() { return initialized; },

    version() {
      try { return sdk().version ?? null; } catch { return null; }
    },

    /**
     * Initialize without Web Push (documented for sites that don't use push).
     * With disabledPushService the docs don't promise an onInitialized callback,
     * so "ready" means init() returned without throwing.
     */
    async init() {
      const config = {
        appKey: settings.appKey,
        disabledPushService: settings.pushMode !== 'enabled',
        onError: (msg) => onSdkError?.(msg),
      };
      if (settings.urlDeviceApi) config.urlDeviceApi = settings.urlDeviceApi;
      if (settings.logLevel && sdk().LogLevel?.[settings.logLevel] !== undefined) {
        config.logLevel = sdk().LogLevel[settings.logLevel];
      }
      try {
        await sdk().init(config);
      } catch (err) {
        throw err instanceof SdkError ? err : new SdkError('INIT_FAILED', 'indigitall.init threw', err);
      }
      initialized = true;
      return { disabledPushService: config.disabledPushService };
    },

    /** Identify the customer: link(externalId, Channel.NONE). */
    identify(externalId) {
      requireInit();
      return call('link', [externalId, channelNone()]);
    },

    /** Create/update customer fields. Always pass an object (docs: JSON object). */
    setFields(fields) {
      requireInit();
      return call('assignOrUpdateValueToCustomerFields', [{ ...fields }]);
    },

    getFields() {
      requireInit();
      return call('getCustomerInformation', []);
    },

    getCustomer() {
      requireInit();
      return call('getCustomer', []);
    },

    /** Trigger a Customer Journey event. */
    sendEvent(eventCode, eventId, eventAt, data) {
      requireInit();
      return call('sendCustomerCustomEvent', [eventCode, eventId, eventAt, { ...data }]);
    },

    /** Unlink the customer (used by "new session" in diagnostics). */
    reset() {
      requireInit();
      return call('unlink', [channelNone()]);
    },
  };
}

/**
 * getCustomerInformation's response shape is not documented. Accept the shapes we can
 * recognize and return a plain {field: value} object, or null when unrecognized.
 */
export function extractCustomerFields(response) {
  if (!response) return null;
  let r = response;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
  if (r.data && typeof r.data === 'object') r = r.data;
  if (r.fields && typeof r.fields === 'object' && !Array.isArray(r.fields)) return { ...r.fields };
  const list = Array.isArray(r) ? r : Array.isArray(r.fields) ? r.fields : null;
  if (list) {
    const out = {};
    for (const item of list) {
      const name = item?.name ?? item?.fieldName ?? item?.key;
      if (name !== undefined) out[name] = item.value;
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof r === 'object' && !Array.isArray(r)) return { ...r };
  return null;
}
