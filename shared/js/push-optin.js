// Web Push opt-in: permission adapter + a small UI block above the form.
//
// Why the page asks for permission itself: in SDK 4.18.1 the prompt comes from
// pushManager.subscribe(), which runs only after several network calls inside init().
// Firefox and Safari ignore permission prompts that are not triggered by a user
// gesture, so the button calls the standard Notification.requestPermission() directly
// in the click handler, and only then starts indigitall.init(). With the permission
// already granted, the SDK subscribes without prompting again.

export const PUSH_STATES = Object.freeze({
  UNSUPPORTED: 'unsupported',   // no Service Worker / Push API / Notification API
  DEFAULT: 'default',           // not asked yet
  REQUESTING: 'requesting',     // browser prompt open
  DISMISSED: 'dismissed',       // prompt closed without a choice
  DENIED: 'denied',             // blocked
  REGISTERING: 'registering',   // granted, SDK registering the device
  REGISTERED: 'registered',     // device has a Device ID
  ERROR: 'error',               // registration failed
});

/** Real browser permissions. */
export function browserPermissions(win = globalThis) {
  return {
    supported() {
      return Boolean(win.navigator && 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win);
    },
    state() { return win.Notification?.permission ?? 'default'; },
    request() {
      // Older Safari only supports the callback form.
      return new Promise((resolve) => {
        const maybe = win.Notification.requestPermission((p) => resolve(p));
        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, () => resolve(win.Notification.permission));
      });
    },
  };
}

/** Simulated permissions for dry-run (?simulate-permission=granted|denied|default). */
export function simulatedPermissions({ initial = 'default', answer = 'granted', sdk } = {}) {
  let current = initial;
  return {
    supported: () => true,
    state: () => current,
    request: async () => { current = answer; sdk?.setPermission?.(current); return current; },
  };
}

const COPY = {
  [PUSH_STATES.UNSUPPORTED]: {
    tone: 'error',
    text: 'Tu navegador no admite notificaciones web, que esta demo necesita para identificarte. Prueba con Chrome, Edge o Firefox en ordenador o Android. En iPhone, añade la página a la pantalla de inicio primero.',
  },
  [PUSH_STATES.DEFAULT]: {
    tone: 'info',
    text: 'Paso 1: activa las notificaciones de este navegador. Las usamos para identificar tu solicitud y avisarte de su estado.',
    button: 'Activar notificaciones',
  },
  [PUSH_STATES.REQUESTING]: { tone: 'info', text: 'Responde al aviso del navegador para continuar…' },
  [PUSH_STATES.DISMISSED]: {
    tone: 'info',
    text: 'Cerraste el aviso sin elegir. Para continuar, vuelve a intentarlo y pulsa «Permitir».',
    button: 'Volver a intentarlo',
  },
  [PUSH_STATES.DENIED]: {
    tone: 'error',
    text: 'Las notificaciones están bloqueadas para este sitio, así que no podemos registrar tu solicitud. Permítelas desde el icono de la barra de direcciones (configuración del sitio) y recarga la página.',
    button: 'Ya las permití, recargar',
    reload: true,
  },
  [PUSH_STATES.REGISTERING]: { tone: 'info', text: 'Registrando este dispositivo…' },
  [PUSH_STATES.REGISTERED]: { tone: 'success', text: 'Notificaciones activadas. Ya puedes completar el formulario.' },
  [PUSH_STATES.ERROR]: {
    tone: 'error',
    text: 'No pudimos registrar este dispositivo. Inténtalo de nuevo en unos segundos.',
    button: 'Reintentar',
    reload: true,
  },
};

/**
 * @returns {{set(state: string): void, onActivate(fn: () => void): void}}
 */
export function renderOptIn(doc, container) {
  const box = doc.createElement('div');
  box.className = 'optin';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const text = doc.createElement('p');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  box.append(text, button);
  container.appendChild(box);
  let handler = () => {};
  let reload = false;
  button.addEventListener('click', () => { if (reload) location.reload(); else handler(); });

  return {
    set(state) {
      const c = COPY[state] ?? COPY[PUSH_STATES.ERROR];
      box.className = `optin notice notice-${c.tone}`;
      text.textContent = c.text;
      button.hidden = !c.button;
      button.textContent = c.button ?? '';
      reload = Boolean(c.reload);
    },
    onActivate(fn) { handler = fn; },
  };
}
