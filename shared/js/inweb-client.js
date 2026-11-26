// Loads and manages In-Web campaigns. Nothing else: no CDP, no identification, no events.
//
// Uses indigitall.InApp from the single SDK distribution (indigitall/sdk.min.js 4.18.1),
// which bundles the In-App/In-Web module. The standalone inapp.min.js (4.18.0) is the
// same module, older, and would replace window.indigitall.InApp if loaded on top.
//
// Effective contract (sdk.min.js 4.18.1):
//   InApp.showInAppWithCallback(config, callbacks)
//     config: { appKey, inAppCode, viewId, urlInAppApi?, profile? }
//     callbacks: success(inApp, div), error(error), didFormSubmit(inApp, data),
//       didFormError(inApp, errorList), didClicked(inApp, action), didExpired(inApp, err),
//       didShowManyTimes(inApp, err), didDismissForever(inApp, err), didClickOut(inApp, err),
//       onShowTimeFinished(inApp, div, ms)
//   Campaign: GET {urlInAppApi | https://device-api.indigitall.com/v2}/inapp/campaign/{inAppCode}
//   InApp.init (inside show) stores config.appKey (same key as the SDK) and only calls
//   registerLocation when requestLocation === true, so requestLocation/logLevel are never passed.
//   Without a stored Device ID the module creates a device of its own: show() is therefore
//   only called once the Web Push device is registered (see demo-runtime).

export const INWEB_STATES = Object.freeze({
  IDLE: 'idle',
  WAITING_DEVICE: 'waiting-device',
  REQUESTING: 'requesting',
  RENDERED: 'rendered',
  UNAVAILABLE: 'unavailable',   // not found / expired / frequency limits / dismissed
  ERROR: 'error',
  SUBMITTED: 'submitted',
});

function errorCode(err) {
  return err?.errorCode?.code ?? err?.errorCode ?? err?.code ?? (err?.statusCode ? `HTTP_${err.statusCode}` : 'UNKNOWN');
}

/** 404 / "not exist" / "not found" means the campaign is not available, not a technical error. */
export function isUnavailableError(err) {
  const code = String(errorCode(err));
  const message = String(err?.errorMessage ?? err?.message ?? '');
  return err?.statusCode === 404 || err?.errorId === 404 || /NOT_EXIST|NOT_FOUND|EXPIRED|MANY_TIMES|DISMISS/i.test(code)
    || /not (exist|found)/i.test(message)
    || [2101, 2102, 2103, 2104, 2105].includes(err?.errorCode?.errorId);
}

/**
 * @param {object} p
 * @param {() => any} p.getSdk
 * @param {string} p.appKey
 * @param {object} p.inweb        config.inweb (inAppCode, viewId, urlInAppApi, profile)
 * @param {(type: string, detail: object) => void} p.onEvent   every callback, normalized
 * @param {number} [p.timeoutMs]  no success/error within this time → error
 */
export function createInWebClient({ getSdk, appKey, inweb, onEvent, timeoutMs = 15000 }) {
  let state = INWEB_STATES.IDLE;
  let timer = null;
  const set = (s, detail = {}) => { state = s; onEvent?.('state', { state: s, ...detail }); };

  function inApp() {
    const s = getSdk();
    return s?.InApp && typeof s.InApp.showInAppWithCallback === 'function' ? s.InApp : null;
  }

  return {
    get state() { return state; },
    get inAppCode() { return inweb.inAppCode; },
    isAvailable: () => Boolean(inApp()),
    version: () => { try { return getSdk()?.InApp?.version ?? null; } catch { return null; } },

    /** Mark that the campaign waits for device registration (before opt-in). */
    waitForDevice() { if (state === INWEB_STATES.IDLE) set(INWEB_STATES.WAITING_DEVICE); },

    /**
     * Request and render the campaign once. Re-entering the tab does not request it again
     * while it is rendered; the SDK itself applies cache, expiry and frequency rules.
     */
    show() {
      if ([INWEB_STATES.REQUESTING, INWEB_STATES.RENDERED, INWEB_STATES.SUBMITTED].includes(state)) return false;
      const lib = inApp();
      if (!lib) { set(INWEB_STATES.ERROR, { code: 'INAPP_NOT_AVAILABLE' }); return false; }
      if (!inweb.inAppCode) { set(INWEB_STATES.UNAVAILABLE, { code: 'NO_INAPP_CODE' }); return false; }
      if (!document.getElementById(inweb.viewId)) { set(INWEB_STATES.ERROR, { code: 'CONTAINER_NOT_FOUND' }); return false; }

      const config = { appKey, inAppCode: inweb.inAppCode, viewId: inweb.viewId };
      if (inweb.urlInAppApi) config.urlInAppApi = inweb.urlInAppApi;
      if (inweb.profile) config.profile = inweb.profile;

      clearTimeout(timer);
      timer = setTimeout(() => {
        if (state === INWEB_STATES.REQUESTING) set(INWEB_STATES.ERROR, { code: 'TIMEOUT' });
      }, timeoutMs);
      const stopTimer = () => clearTimeout(timer);
      const unavailable = (type) => (inAppObj, err) => {
        stopTimer();
        set(INWEB_STATES.UNAVAILABLE, { code: type, error: err });
        onEvent?.(type, { inAppId: inAppObj?.inAppId, error: err });
      };

      set(INWEB_STATES.REQUESTING, { config: { ...config, appKey: '[redacted]' } });
      try {
        lib.showInAppWithCallback(config, {
          success: (inAppObj) => { stopTimer(); set(INWEB_STATES.RENDERED, { inAppId: inAppObj?.inAppId }); },
          error: (err) => {
            stopTimer();
            set(isUnavailableError(err) ? INWEB_STATES.UNAVAILABLE : INWEB_STATES.ERROR, { code: String(errorCode(err)), error: err });
          },
          didFormSubmit: (inAppObj, data) => onEvent?.('didFormSubmit', { inAppId: inAppObj?.inAppId, data }),
          didFormError: (inAppObj, errorList) => onEvent?.('didFormError', { inAppId: inAppObj?.inAppId, errorList }),
          didClicked: (inAppObj, action) => onEvent?.('didClicked', { inAppId: inAppObj?.inAppId, action }),
          didExpired: unavailable('didExpired'),
          didShowManyTimes: unavailable('didShowManyTimes'),
          didDismissForever: unavailable('didDismissForever'),
          didClickOut: unavailable('didClickOut'),
          onShowTimeFinished: (inAppObj, div, ms) => {
            set(INWEB_STATES.UNAVAILABLE, { code: 'onShowTimeFinished' });
            onEvent?.('onShowTimeFinished', { inAppId: inAppObj?.inAppId, ms });
          },
        });
      } catch (err) {
        stopTimer();
        set(INWEB_STATES.ERROR, { code: 'SHOW_THREW', error: String(err?.message ?? err) });
        return false;
      }
      return true;
    },

    /** The lead was accepted: keep the campaign from being requested again in this page. */
    markSubmitted() { set(INWEB_STATES.SUBMITTED); },
  };
}
