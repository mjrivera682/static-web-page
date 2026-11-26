// The only module that knows indigitall SDK method names. Every call is turned into a
// Promise with a timeout, so a callback that never fires is reported as an error.
//
// Signatures are taken from the SDK 4.18.1 code (indigitall/sdk.min.js),
// which differs from the docs in two places that matter here:
//   - link(externalId, channel, ok, err): Customer.link rejects Channel.NONE with
//     DISABLED_CHANNEL, and the internal logIn requires push permission "granted" and
//     the push service enabled. Identification therefore needs Web Push.
//   - sendCustomerCustomEvent(eventCode, customData, eventId, eventAt, ok, err)
//     (the docs show eventId/eventAt before the data).
//
// Push init sequence in 4.18.1: init → postDevice (Device ID) → register the Service
// Worker at workerPath → pushManager.subscribe() → putDevice → onInitialized(permissions,
// device). If the permission is already "denied", init stops early with
// onError("Push permission denied") and no device is created.

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
 * @param {() => any} opts.getSdk          returns window.indigitall (or a simulator)
 * @param {object} opts.settings           demo config "indigitall" block (+ workerPath)
 * @param {number} [opts.timeoutMs]        per-operation timeout
 * @param {number} [opts.registrationTimeoutMs]  wait for onInitialized after init
 * @param {(msg: any) => void} [opts.onSdkError]  every SDK onError message
 */
export function createIndigitallClient({
  getSdk, settings, timeoutMs = 10000, registrationTimeoutMs = 30000, onSdkError,
}) {
  const pushEnabled = settings.pushMode === 'enabled';
  let initialized = false;
  let initPromise = null; // one indigitall.init() per page: later calls reuse it
  let device = null; // { deviceId, permissions } once onInitialized fires with a device id

  function sdk() {
    const s = getSdk();
    if (!s || typeof s.init !== 'function') throw new SdkError('SDK_NOT_LOADED', 'indigitall SDK is not available');
    return s;
  }

  function channel() {
    const c = sdk().Channel ?? {};
    return pushEnabled ? (c.PUSH ?? 'push') : (c.NONE ?? 'none');
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

  function requireDevice() {
    if (!initialized) throw new SdkError('NOT_INITIALIZED', 'Call init() first');
    if (pushEnabled && !device?.deviceId) throw new SdkError('DEVICE_NOT_REGISTERED', 'The device is not registered yet');
  }

  return {
    get initialized() { return initialized; },
    get pushEnabled() { return pushEnabled; },
    get deviceId() { return device?.deviceId ?? null; },
    get channelName() { return pushEnabled ? 'Channel.PUSH' : 'Channel.NONE'; },

    version() {
      try { return sdk().version ?? null; } catch { return null; }
    },

    isSafari() {
      try { return Boolean(sdk().isSafariBrowserDevice?.()); } catch { return false; }
    },

    /**
     * Initialize the SDK. With Web Push enabled this resolves only when onInitialized
     * delivers a device with a Device ID (device registered); it rejects on a fatal
     * onError or after registrationTimeoutMs. Call it after the browser permission is
     * "granted", so subscribe() does not need to prompt outside a user gesture.
     * @returns {Promise<{deviceId: string|null, permissions: any}>}
     */
    init() {
      if (initPromise) return initPromise;
      initPromise = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
        const timer = pushEnabled
          ? setTimeout(() => finish(reject, new SdkError('REGISTRATION_TIMEOUT',
            `Device not registered after ${registrationTimeoutMs} ms`)), registrationTimeoutMs)
          : null;

        const config = {
          appKey: settings.appKey,
          disabledPushService: !pushEnabled,
          onInitialized: (permissions, dev) => {
            const deviceId = dev?.deviceId ?? null;
            if (!deviceId) return; // not registered yet: keep waiting for a later callback
            device = { deviceId, permissions };
            initialized = true;
            finish(resolve, { deviceId, permissions });
          },
          onError: (msg) => {
            onSdkError?.(msg);
            if (!pushEnabled) return; // "Push Service disabled" is expected then
            if (msg === 'Push permission denied') {
              finish(reject, new SdkError('PUSH_PERMISSION_DENIED', 'Notifications are blocked in this browser', msg));
            } else if (typeof msg === 'object' && msg !== null) {
              finish(reject, new SdkError('REGISTRATION_FAILED', 'Device registration failed', msg));
            }
          },
        };
        if (pushEnabled) config.workerPath = settings.workerPath;
        if (settings.urlDeviceApi) config.urlDeviceApi = settings.urlDeviceApi;
        try {
          if (settings.logLevel && sdk().LogLevel?.[settings.logLevel] !== undefined) {
            config.logLevel = sdk().LogLevel[settings.logLevel];
          }
          Promise.resolve(sdk().init(config)).then(() => {
            if (!pushEnabled) { initialized = true; finish(resolve, { deviceId: null, permissions: null }); }
          }, (err) => finish(reject, new SdkError('INIT_FAILED', 'indigitall.init failed', err)));
        } catch (err) {
          finish(reject, err instanceof SdkError ? err : new SdkError('INIT_FAILED', 'indigitall.init threw', err));
        }
      });
      return initPromise;
    },

    /** Identify the customer and link this device: link(externalId, Channel.PUSH). */
    identify(externalId) {
      requireDevice();
      return call('link', [externalId, channel()]);
    },

    /** Create/update customer fields. Always pass an object (a string triggers a parse bug). */
    setFields(fields) {
      requireDevice();
      return call('assignOrUpdateValueToCustomerFields', [{ ...fields }]);
    },

    getCustomer() {
      requireDevice();
      return call('getCustomer', []);
    },

    /** Trigger a Customer Journey event. SDK 4.18.1 order: code, data, eventId, eventAt. */
    sendEvent(eventCode, eventId, eventAt, data) {
      requireDevice();
      return call('sendCustomerCustomEvent', [eventCode, { ...data }, eventId, eventAt]);
    },

    /** Unlink the customer from this device on the same channel used to link it. */
    reset() {
      requireDevice();
      return call('unlink', [channel()]);
    },
  };
}
