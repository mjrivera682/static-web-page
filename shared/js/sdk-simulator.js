// In-memory stand-in for the indigitall SDK 4.18.1, reproducing the behavior of the real
// bundle that the demo depends on (see indigitall-client.js header):
//   - init with push: onInitialized(permissions, {deviceId}) once registered;
//     permission "denied" → onError("Push permission denied") and no device;
//     disabledPushService → onError("Push Service disabled") and push disabled.
//   - link(externalId, channel): "none" → DISABLED_CHANNEL; push disabled → DISABLED_CHANNEL;
//     permission not granted → PUSH_PERMISSION_NOT_ACCEPTED.
//   - sendCustomerCustomEvent(eventCode, customData, eventId, eventAt, ok, err).
// Used for dry-run mode (no network calls at all) and for automated tests.

const ERR = {
  DISABLED_CHANNEL: { errorCode: { code: 'DISABLED_CHANNEL', errorId: 4404 }, errorMessage: 'disabled channel' },
  PUSH_PERMISSION_NOT_ACCEPTED: { errorCode: { code: 'PUSH_PERMISSION_NOT_ACCEPTED' }, errorMessage: 'push permission not accepted' },
  CUSTOMER_ERROR_PARAMS: { errorCode: { code: 'CUSTOMER_ERROR_PARAMS' }, errorMessage: 'customer error params' },
  NOT_LINKED: { errorCode: { code: 'BAD_REQUEST_SERVER_ERROR', errorId: 410 }, errorMessage: 'bad request' },
};

/**
 * @param {object} [opts]
 * @param {number} [opts.latencyMs]
 * @param {'granted'|'denied'|'default'} [opts.permission]  browser notification permission
 * @param {Record<string, any>} [opts.fail]   method name → error object passed to its error callback
 * @param {string[]} [opts.silent]           methods that never call back (to test timeouts)
 * @param {(call: {method: string, args: any[]}) => void} [opts.onCall]
 */
export function createSdkSimulator({ latencyMs = 150, permission = 'granted', fail = {}, silent = [], onCall } = {}) {
  const calls = [];
  const db = { deviceId: null, pushDisabled: false, externalId: null, linkedChannel: null, fields: {}, events: [] };
  const later = (fn) => setTimeout(fn, latencyMs);

  function record(method, args) {
    const call = { method, args };
    calls.push(call);
    onCall?.(call);
  }

  function respond(method, success, error, value) {
    if (silent.includes(method)) return;
    later(() => {
      if (method in fail) error?.(fail[method]);
      else success?.(value);
    });
  }

  return {
    version: 'simulator',
    simulated: true,
    calls,
    db,
    Channel: Object.freeze({ PUSH: 'push', INAPP: 'inapp', CHAT: 'chat', NONE: 'none' }),
    LogLevel: Object.freeze({ DEBUG: 1, INFO: 2, WARNING: 3, ERROR: 4 }),
    setPermission(p) { permission = p; },

    async init(config) {
      record('init', [config]);
      if ('init' in fail) throw fail.init;
      if (config.disabledPushService) {
        db.pushDisabled = true;
        config.onError?.('Push Service disabled');
        return false;
      }
      if (permission === 'denied') { config.onError?.('Push permission denied'); return false; }
      if (silent.includes('init')) return true;
      later(() => {
        if (permission !== 'granted') return; // waits for the prompt in the real SDK
        if ('register' in fail) { config.onError?.(fail.register); return; }
        db.deviceId = db.deviceId ?? `sim-${Math.random().toString(16).slice(2, 10)}-device`;
        config.onInitialized?.({ push: 'granted' }, { deviceId: db.deviceId });
      });
      return true;
    },
    link(externalId, channel, success, error) {
      record('link', [externalId, channel]);
      if (channel === 'none' || db.pushDisabled) { later(() => error?.(ERR.DISABLED_CHANNEL)); return; }
      if (permission !== 'granted') { later(() => error?.(ERR.PUSH_PERMISSION_NOT_ACCEPTED)); return; }
      if (!('link' in fail)) { db.externalId = externalId; db.linkedChannel = channel; }
      respond('link', success, error);
    },
    unlink(channel, success, error) {
      record('unlink', [channel]);
      if (channel === 'none' || db.pushDisabled) { later(() => error?.(ERR.DISABLED_CHANNEL)); return; }
      if (!('unlink' in fail)) { db.externalId = null; db.linkedChannel = null; }
      respond('unlink', success, error);
    },
    assignOrUpdateValueToCustomerFields(fields, success, error) {
      record('assignOrUpdateValueToCustomerFields', [fields]);
      if (typeof fields !== 'object' || fields === null) { later(() => error?.(ERR.CUSTOMER_ERROR_PARAMS)); return; }
      if (!db.externalId) { later(() => error?.(ERR.NOT_LINKED)); return; }
      if (!('assignOrUpdateValueToCustomerFields' in fail)) Object.assign(db.fields, fields);
      respond('assignOrUpdateValueToCustomerFields', success, error);
    },
    getCustomerInformation(success, error) {
      record('getCustomerInformation', []);
      if (!db.externalId) { later(() => error?.(ERR.NOT_LINKED)); return; }
      respond('getCustomerInformation', success, error, { fields: { ...db.fields } });
    },
    getCustomer(success, error) {
      record('getCustomer', []);
      respond('getCustomer', success, error, { customerId: db.externalId ? 'simulated-customer' : null });
    },
    sendCustomerCustomEvent(eventCode, customData, eventId = null, eventAt = null, success, error) {
      record('sendCustomerCustomEvent', [eventCode, customData, eventId, eventAt]);
      if (typeof eventCode !== 'string' || typeof customData !== 'object' || customData === null) {
        later(() => error?.(ERR.CUSTOMER_ERROR_PARAMS));
        return;
      }
      if (!db.externalId) { later(() => error?.(ERR.NOT_LINKED)); return; }
      if (!('sendCustomerCustomEvent' in fail)) db.events.push({ eventCode, customData, eventId, eventAt });
      respond('sendCustomerCustomEvent', success, error);
    },
  };
}
