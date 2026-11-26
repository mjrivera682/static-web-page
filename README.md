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
vendor/indigitall/<versión>/     SDK oficial (zip de "SDK Setup" en documentation.indigitall.com)
tests/unit/                      pruebas: node --test "tests/unit/*.test.mjs"
```

`src/`, `dist/`, `indigitall/`, `service-worker.js` y la configuración de webpack son la
implementación anterior. Se conservan para no romper URLs publicadas.

## Flujo de Lead Capture (métodos documentados)

1. `indigitall.init({ appKey, disabledPushService: true })`: sin Web Push, sin permisos.
2. `indigitall.link(externalId, indigitall.Channel.NONE)`
3. `indigitall.assignOrUpdateValueToCustomerFields({ ... })`
4. `indigitall.getCustomerInformation()`: verificación antes del evento (`flow.verifyProfile`).
5. `indigitall.sendCustomerCustomEvent(eventCode, eventId, eventAt, data)`

Cada paso espera su callback de éxito. Si uno falla, el evento no se envía y no se muestra éxito.

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
- Ninguna demo pide contraseñas ni permisos de notificaciones o ubicación. La validación de
  configuración rechaza campos de contraseña o de pago.
