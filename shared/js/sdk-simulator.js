// In-memory stand-in for the indigitall SDK, with the documented method signatures.
// Used for "dry-run" mode (no network calls at all) and for automated tests.

/**
 * @param {object} [opts]
 * @param {number} [opts.latencyMs]
 * @param {Record<string, any>} [opts.fail]   method name → error object passed to its error callback
 * @param {string[]} [opts.silent]           methods that never call back (to test timeouts)
 * @param {(call: {method: string, args: any[]}) => void} [opts.onCall]
 */
export function createSdkSimulator({ latencyMs = 150, fail = {}, silent = [], onCall } = {}) {
  const calls = [];
  const db = { externalId: null, fields: {}, events: [] };

  function record(method, args) {
    const call = { method, args };
    calls.push(call);
    onCall?.(call);
  }

  function respond(method, success, error, value) {
    if (silent.includes(method)) return;
    setTimeout(() => {
      if (method in fail) error?.(fail[method]);
      else success?.(value);
    }, latencyMs);
  }

  return {
    version: 'simulator',
    simulated: true,
    calls,
    db,
    Channel: Object.freeze({ PUSH: 'push', INAPP: 'inapp', CHAT: 'chat', NONE: 'none' }),
    LogLevel: Object.freeze({ DEBUG: 1, INFO: 2, WARNING: 3, ERROR: 4 }),

    async init(config) {
      record('init', [config]);
      if ('init' in fail) throw fail.init;
    },
    link(externalId, channel, success, error) {
      record('link', [externalId, channel]);
      if (!(('link') in fail)) db.externalId = externalId;
      respond('link', success, error);
    },
    unlink(channel, success, error) {
      record('unlink', [channel]);
      db.externalId = null;
      respond('unlink', success, error);
    },
    assignOrUpdateValueToCustomerFields(fields, success, error) {
      record('assignOrUpdateValueToCustomerFields', [fields]);
      if (!db.externalId) { setTimeout(() => error?.({ errorMessage: 'not linked' }), latencyMs); return; }
      if (!('assignOrUpdateValueToCustomerFields' in fail)) Object.assign(db.fields, fields);
      respond('assignOrUpdateValueToCustomerFields', success, error);
    },
    getCustomerInformation(success, error) {
      record('getCustomerInformation', []);
      respond('getCustomerInformation', success, error, { fields: { ...db.fields } });
    },
    getCustomer(success, error) {
      record('getCustomer', []);
      respond('getCustomer', success, error, { customerId: db.externalId ? 'simulated-customer' : null });
    },
    sendCustomerCustomEvent(eventCode, eventId, eventAt, data, success, error) {
      record('sendCustomerCustomEvent', [eventCode, eventId, eventAt, data]);
      if (!db.externalId) { setTimeout(() => error?.({ errorMessage: 'not linked' }), latencyMs); return; }
      if (!('sendCustomerCustomEvent' in fail)) db.events.push({ eventCode, eventId, eventAt, data });
      respond('sendCustomerCustomEvent', success, error);
    },
  };
}
