# Demos indigitall en GitHub Pages

Demostraciones comerciales que usan el Web SDK de indigitall sin backend ni build:
HTML, CSS y JavaScript nativo. Lo que está en `main` es lo que publica GitHub Pages.

- Portal: `https://mjrivera682.github.io/static-web-page/`
- CDP Lead Capture: `…/static-web-page/demos/cdp-lead-capture/` (añade `?debug=1` para el diagnóstico)

## Estructura

```
demos/<slug>/index.html          página de la demo (copiada de demos/_template)
demos/<slug>/demo.config.json    App Key, campos, atributos CDP, evento
shared/js/                       capa común (SDK, flujo, validación, diagnóstico)
indigitall/                      SDK Web 4.18.1: sdk.min.js + worker.min.js (única copia del sitio)
tests/unit/                      pruebas: node --test "tests/unit/*.test.mjs"
```

`src/` y `dist/` son páginas de la implementación anterior (Smart TV, 2025), congeladas para no
romper URLs publicadas: no cargan el SDK. Ya no hay webpack, npm ni `node_modules`.

## Flujo de Lead Capture (SDK 4.18.1)

1. Opt-in: botón «Activar notificaciones» → `Notification.requestPermission()` en el clic
   (gesto del usuario). Si el permiso ya estaba concedido no se vuelve a pedir.
2. `indigitall.init({ appKey, workerPath, onInitialized, onError })` con Web Push activo.
   El dispositivo está registrado cuando `onInitialized` entrega un `deviceId`.
   Service Worker: `workerPath: /static-web-page/indigitall/worker.min.js` (scope `/static-web-page/indigitall/`).
   Registros de la copia anterior en `/static-web-page/vendor/indigitall/` se desregistran al cargar la página.
3. `indigitall.link(email, indigitall.Channel.PUSH)`: el SDK 4.18.1 rechaza `Channel.NONE`
   (`DISABLED_CHANNEL`) y exige permiso de notificaciones concedido.
4. `indigitall.assignOrUpdateValueToCustomerFields({ name, email, phone, lead_source })`
5. `indigitall.getCustomerInformation()`: verificación antes del evento (`flow.verifyProfile`).
6. `indigitall.sendCustomerCustomEvent(eventCode, data, eventId, eventAt, ok, err)`:
   orden real del SDK 4.18.1 (la documentación muestra otro).

Cada paso espera su callback de éxito. Si uno falla, el evento no se envía y no se muestra éxito.
Si las notificaciones están bloqueadas, la página lo indica y no permite enviar: sin dispositivo
registrado el SDK no puede identificar al cliente.

## Crear una demo

1. Copia `demos/_template/` a `demos/<slug>/`.
2. Edita `demo.config.json`: `slug`, `fields` (`cdpField` = nombre del atributo en la CDP),
   `identity.strategy` (`email` | `phone`), `event.name`, `event.data`.
3. Déjala en `"mode": "dry-run"` (simulación local, sin llamadas) hasta tener el App Key del
   proyecto de demo; después cambia a `"live"`.
4. Ejecuta las pruebas: validan todas las configuraciones de `demos/`.

En modo dry-run, `?simulate-fail=<método>` simula un error del SDK (p. ej.
`?simulate-fail=sendCustomerCustomEvent`).

## Seguridad

- El App Key del Web SDK es público por diseño: usa un **proyecto exclusivo para demos**.
- Las protecciones del formulario (doble envío, cooldown, honeypot) solo reducen ruido; no
  son seguridad. Para impedir abusos con coste (llamadas, WhatsApp), filtra en el Customer
  Journey (lista de contactos permitidos, límites de frecuencia).
- Ninguna demo pide contraseñas ni permiso de ubicación. El permiso de notificaciones solo se pide al pulsar el botón de opt-in. La validación de
  configuración rechaza campos de contraseña o de pago.
