# Demos indigitall en GitHub Pages — v1.0.0

Demostraciones comerciales que integran el **SDK Web de indigitall 4.18.1** directamente desde el
navegador: HTML, CSS y JavaScript nativo, sin backend, sin build y sin dependencias de ejecución.
Lo que está en `main` es lo que publica GitHub Pages.

- Portal: https://mjrivera682.github.io/static-web-page/
- CDP Lead Capture: https://mjrivera682.github.io/static-web-page/demos/cdp-lead-capture/

## Arquitectura

```
Navegador (GitHub Pages)
  demos/<slug>/index.html + demo.config.json     ← solo configuración de la demo
        │
  shared/js/demo-runtime.js                      ← punto de entrada común
  ├─ push-optin.js        opt-in Web Push (gesto del usuario)
  ├─ indigitall-client.js único módulo que llama al SDK (Promesas + timeouts)
  ├─ lead-flow.js         secuencia: identificar → atributos CDP → evento
  ├─ normalize.js         validación, teléfono E.164, mapeo CDP tipado
  ├─ countries.js         países, indicativos, validación nacional, banderas SVG
  ├─ guard.js             anti doble envío, cooldown, honeypot
  ├─ diagnostics.js       panel ?debug=1 con datos enmascarados
  └─ reset.js             acciones de reinicio y limpieza acotada
        │
  indigitall/sdk.min.js + indigitall/worker.min.js (4.18.1, única copia)
        │  HTTPS, App Key público
  device-api.indigitall.com (EU1) → CDP → Customer Journey → Voice AI → WhatsApp
```

La llamada y el WhatsApp los ejecuta el Customer Journey en indigitall; el repositorio no los gestiona.

## Estructura

```
index.html                      portal de demos
indigitall/                     SDK Web 4.18.1 (sdk.min.js, worker.min.js): única distribución
shared/js/, shared/css/         núcleo compartido (nada específico de una demo)
demos/cdp-lead-capture/         demo: index.html + demo.config.json
demos/_template/                plantilla para nuevas demos (no se publica: Jekyll ignora "_")
tests/unit/                     pruebas (node --test), también en CI
.github/workflows/ci.yml        CI: pruebas en cada push y PR
Dominos_…(2).html               demo autónoma sin SDK
src/, dist/                     páginas antiguas (2025) congeladas por compatibilidad de URL; no cargan el SDK
docs/phase1/                    auditoría y diseño iniciales (histórico, no describe v1.0)
```

## Flujo y contratos reales del SDK 4.18.1

Las firmas se tomaron del código de `indigitall/sdk.min.js`; en dos casos difieren de la documentación.

| Paso | Llamada | Notas |
|---|---|---|
| 1. Opt-in | `Notification.requestPermission()` en el clic de «Activar notificaciones» | Firefox/Safari solo muestran el aviso con gesto del usuario. Si ya está concedido no se vuelve a pedir. |
| 2. Inicialización y registro | `indigitall.init({ appKey, workerPath: "/static-web-page/indigitall/worker.min.js", onInitialized, onError })` | Listo solo cuando `onInitialized(permissions, device)` trae `deviceId`. Una sola inicialización por página. |
| 3. Identificación | `indigitall.link(email, indigitall.Channel.PUSH, ok, err)` | `Channel.NONE` devuelve `DISABLED_CHANNEL` en 4.18.1; exige permiso concedido. |
| 4. Atributos CDP | `indigitall.assignOrUpdateValueToCustomerFields({...}, ok, err)` | Siempre un objeto (un string provoca un error de parseo en el SDK). |
| 5. Evento | `indigitall.sendCustomerCustomEvent("lead_submitted", data, eventId, eventAt, ok, err)` | Orden real del SDK (la documentación muestra eventId/eventAt antes de data). Solo tras el éxito del paso 4. |

Cada paso espera su callback; si uno falla (o no responde en `operationTimeoutMs`) no se ejecuta el
siguiente y no se muestra éxito. **No hay lectura de verificación** (`verifyProfile: "off"`), ni Server Key,
ni API privada: los atributos se comprueban en la consola de indigitall.

Cambio de usuario en el mismo navegador: antes de `link` con otro email se hace `unlink(Channel.PUSH)`
(la demo guarda solo un hash SHA-256 del email anterior).

### Esquema CDP (atributos existentes, no se crean nuevos)

| Atributo | Tipo | Valor (ejemplo Colombia) |
|---|---|---|
| `name` | String | `Carlos García` |
| `email` | String | `carlos@example.com` (también External ID, sin prefijo) |
| `Phone` | Number | `573001234567` (internacional completo, sin `+`) |
| `Country_code` | Number | `57` |
| `producto_de_interes` | String | `Plan Hogar` |
| `Origen` | String | `demo_cdp_lead_capture` (flag de los contactos de esta demo) |

### Evento `lead_submitted`

```json
{ "name": "Carlos García", "phone": "+573001234567", "product": "Plan Hogar", "Origen": "demo_cdp_lead_capture" }
```

`phone` es String E.164 con `+`. `eventId` es un UUID por envío (se reutiliza si se reintenta el mismo
envío) y `eventAt` la fecha ISO 8601.

### Teléfono

Selector de país (Colombia por defecto; México, Perú, Chile, Estados Unidos, Ecuador, Honduras, España)
con bandera SVG integrada e indicativo, y número nacional aparte. Validación por país, normalización
E.164, sin duplicar el indicativo (`+57…`, `0057…`, `57…`), prefijo nacional `0` eliminado y rechazo de
números internacionales de otro país.

## Crear una nueva demo

1. Copia `demos/_template/` a `demos/<slug>/` (sin guion bajo inicial, para que se publique).
2. En `demo.config.json` cambia `slug`, `title`, textos, `fields`, `cdpMapping` (atributos existentes y su
   tipo: `string` | `number` | `boolean`; el teléfono expone `phone.e164`, `phone.digits`,
   `phone.countryCode`), `staticAttributes` (flag de origen) y `event` (`name` y `data` como `{ key, from }`).
3. Deja `"mode": "dry-run"` hasta tener el App Key; para publicar usa `"mode": "live"` con
   `indigitall.pushMode: "enabled"` (obligatorio para identificar con el SDK 4.18.1).
4. Ejecuta `node --test "tests/unit/*.test.mjs"`: valida todas las configuraciones de `demos/`.
5. No copies el SDK: todas las demos usan `/indigitall/`. El núcleo (`shared/`) no se modifica por demo.

## Diagnóstico y recuperación

- `?debug=1`: panel con etapas (SDK cargado → inicializado → dispositivo → identificación → escritura CDP →
  evento), permiso, Service Worker, Device ID y External ID enmascarados, y errores originales del SDK.
- `?mode=dry-run`: simulador local, no se envía nada a indigitall
  (`&simulate-permission=granted|denied|dismissed|blocked|already-granted`, `&simulate-fail=<método SDK>`).
- Acciones del panel:
  1. **Nueva sesión de cliente**: `unlink(Channel.PUSH)` + identidad y cooldown de la demo; conserva el dispositivo.
  2. **Reiniciar integración SDK**: además suscripción push, Service Worker de `/static-web-page/indigitall/`,
     `indigitall.repository.*`, `indigitall.session.storage*`, IndexedDB `indigitall.indexedDB` y `demo.<slug>.*`.
  3. **Restablecer permisos**: instrucciones por navegador (JavaScript no puede revocar el permiso).
- Automático: si el SDK guardó estado de **otro App Key** (clave antigua u otra demo del mismo dominio), ese
  estado se limpia antes de `init`; si no, el SDK 4.18.1 seguiría usando la clave anterior.
- Errores habituales: `REGISTRATION_FAILED` con 403 → App Key, instancia, dominios permitidos o filtro de IP
  en la consola; `PUSH_PERMISSION_DENIED` → acción 3; `DISABLED_CHANNEL` → push desactivado en la config.

## Pruebas

- **Unitarias y simuladas** (`node --test`, también en CI): validación y normalización por país, mapeo CDP
  tipado, orden de llamadas y firmas reales del SDK, permisos (concedido, pendiente, denegado, descartado),
  errores de registro, escritura CDP y evento, timeouts, reintento con el mismo `eventId`, doble envío, mismo
  usuario, cambio de usuario, recarga, acciones de reinicio y cambio de App Key. El simulador reproduce el
  comportamiento del SDK 4.18.1 y nunca hace llamadas de red.
- **Navegador (URL pública, `?mode=dry-run`)**: formulario, selector de país, estados del opt-in y acciones
  de reinicio, sin llamadas a indigitall.
- **Reales**: en Chrome con permiso concedido contra el proyecto EU1 (registro, identificación, CDP, evento y
  WhatsApp recibido). No se automatizan para no disparar comunicaciones.

## Seguridad

- El App Key del SDK Web es público por diseño. No hay Server Key ni credenciales privadas en el repositorio.
- Las protecciones del formulario (cooldown 120 s, honeypot, bloqueo de doble envío) reducen ruido pero no
  son seguridad: el freno real contra abusos está en el Customer Journey (filtro `Origen`, límites de frecuencia).
- No se piden contraseñas ni ubicación; el permiso de notificaciones solo tras el clic de opt-in.
- El panel de diagnóstico solo aparece con `?debug=1` y enmascara email, teléfono, nombre y Device ID.

## Limitaciones conocidas y deuda técnica

- **Sin permiso de notificaciones no hay identificación**: el SDK 4.18.1 no permite `link` sin push.
- **iPhone/Safari no probados**: en iOS, Web Push solo funciona con la página añadida a la pantalla de inicio.
- **Caché de GitHub Pages (10 min)**: tras un despliegue, un navegador puede combinar módulos JS nuevos y
  antiguos durante hasta 10 minutos. `demo.config.json` siempre se pide sin caché. Mitigación: recargar sin
  caché tras publicar; solución futura: versionar las rutas de los módulos.
- **Estado del SDK por dominio**: `mjrivera682.github.io` es compartido; dos demos con App Keys distintos en
  el mismo navegador se reinician mutuamente (limpieza automática). Una demo por dominio lo evitaría.
- **`localhost`** es otro origen y no está en los dominios permitidos: en local usar `?mode=dry-run`.
- **Pestañas simultáneas**: el bloqueo de doble envío es por pestaña; el cooldown sí se comparte.
- **Páginas antiguas `src/` y `dist/`**: implementación de 2025 (no carga el SDK); candidatas a eliminarse
  con autorización.
- **`docs/phase1/`** describe el diseño inicial, no v1.0.
