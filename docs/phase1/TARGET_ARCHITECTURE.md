# TARGET_ARCHITECTURE — Infraestructura de demos indigitall en GitHub Pages

> Fase 1 · Diseño · 2026-11-26 · Depende de: REPOSITORY_AUDIT.md, SDK_CAPABILITY_MATRIX.md

## 1. Principios

1. **Cero build**: HTML + CSS + JavaScript nativo (ES modules). Lo que está en el repositorio es lo que se sirve.
2. **Cero backend propio** mientras el SDK cubra las operaciones. Las limitaciones que exijan servidor se documentan, no se esconden (§8).
3. **Capa de integración compartida, demos declarativas**: cada demo es una carpeta con HTML + un JSON de configuración.
4. **Ninguna confirmación sin evidencia**: la UI solo muestra éxito si todas las operaciones obligatorias devolvieron callback de éxito.
5. **Compatibilidad hacia atrás**: ninguna URL publicada hoy deja de responder.

## 2. Vista general

```
Navegador (GitHub Pages, origen mjrivera682.github.io)
┌──────────────────────────────────────────────────────────────┐
│ demos/<slug>/index.html  ── demo.config.json                 │
│        │                                                     │
│        ▼                                                     │
│ shared/js/demo-runtime.js   (carga config, monta formulario) │
│        │                                                     │
│        ▼                                                     │
│ shared/js/indigitall-client.js  (Promesas sobre el SDK,      │
│        │                         timeouts, orden, errores)   │
│        ▼                                                     │
│ vendor/indigitall/<versión>/sdk.min.js                       │
└────────┼─────────────────────────────────────────────────────┘
         ▼  HTTPS (App Key público)
  indigitall device-api  →  CDP (perfil + atributos)
                         →  Evento  →  Customer Journey  →  Voice AI → WhatsApp
                                         (fuera del alcance del repositorio)
```

## 3. Estructura de directorios

```
/                                   ← raíz servida por Pages (rama main)
├── index.html                      ← portal: listado de demos (reemplaza README renderizado)
├── .nojekyll                       ← servir tal cual (ver §7.2)
├── Dominos_Peru_Demo_WhatsApp_V8_3_Tickets_Demo(2).html   ← SIN CAMBIOS (URL existente)
├── src/  dist/                     ← legado: se mantienen hasta la fase de limpieza (§7.4)
├── indigitall/                     ← legado: se mantiene (URL existente)
│
├── vendor/
│   └── indigitall/
│       ├── 4.9.1/  sdk.min.js  worker.min.js
│       └── 4.18.1/ sdk.min.js  worker.min.js     ← última versión publicada (demos nuevas)
│
├── shared/
│   ├── js/
│   │   ├── indigitall-client.js    ← adaptador del SDK (única pieza que conoce sus métodos)
│   │   ├── lead-flow.js            ← orquestación: validar → identificar → CDP → evento
│   │   ├── normalize.js            ← email, teléfono E.164, nombre, externalId
│   │   ├── form-renderer.js        ← genera el formulario desde la config
│   │   ├── guard.js                ← anti-duplicado, honeypot, cooldown (ruido, no seguridad)
│   │   ├── diagnostics.js          ← panel de diagnóstico y enmascarado
│   │   └── demo-runtime.js         ← punto de entrada común
│   └── css/demo-base.css
│
├── demos/
│   ├── _template/                  ← plantilla para nuevas demos
│   │   ├── index.html
│   │   └── demo.config.json
│   └── cdp-lead-capture/
│       ├── index.html
│       ├── demo.config.json
│       └── assets/
│
├── tests/
│   ├── unit/*.test.mjs             ← node --test (sin dependencias)
│   └── fixtures/fake-sdk.js        ← doble del SDK para pruebas
│
├── docs/                           ← estos entregables
└── .github/workflows/
    ├── ci.yml                      ← tests + validación de configs (sin despliegue)
    └── deploy.yml                  ← DESHABILITADO (renombrado o `on: workflow_dispatch`)
```

URL de cada demo: `https://mjrivera682.github.io/static-web-page/demos/<slug>/`.

## 4. Configuración por demo (`demo.config.json`)

```json
{
  "schemaVersion": 1,
  "slug": "cdp-lead-capture",
  "title": "Solicita información",
  "indigitall": {
    "sdkVersion": "4.18.1",
    "appKey": "<APP_KEY_PUBLICO_DEL_PROYECTO_DEMO>",
    "urlDeviceApi": null,
    "pushMode": "disabled",
    "logLevel": "ERROR"
  },
  "identity": {
    "strategy": "email",
    "prefix": "",
    "resetOnLoad": false
  },
  "fields": [
    { "id": "name",    "label": "Nombre",   "type": "text",  "required": true,  "cdpField": "name" },
    { "id": "email",   "label": "Email",    "type": "email", "required": true,  "cdpField": "email" },
    { "id": "phone",   "label": "Teléfono", "type": "tel",   "required": true,  "cdpField": "phone",
      "normalize": { "type": "e164", "defaultCountry": "CO" } },
    { "id": "product", "label": "Producto de interés", "type": "select", "required": true,
      "cdpField": "product_interest", "options": ["Plan A", "Plan B"] },
    { "id": "consent", "label": "Acepto ser contactado", "type": "checkbox", "required": true,
      "cdpField": "contact_consent" }
  ],
  "staticAttributes": { "lead_source": "web_demo_cdp_lead_capture" },
  "event": {
    "name": "lead_submitted",
    "data": ["product"],
    "includeTimestamp": true
  },
  "flow": {
    "verifyProfileBeforeEvent": true,
    "operationTimeoutMs": 10000
  },
  "guard": { "cooldownSeconds": 120, "honeypot": true },
  "diagnostics": { "enabledByQueryParam": "debug" }
}
```

**Decisiones:**
- **El App Key va en claro en la config.** Es público por diseño del Web SDK (se entrega al navegador en `init`). Inyectarlo desde un secreto no lo protege y complica el despliegue. La protección real es usar **un proyecto indigitall exclusivo de demos** (§8).
- `cdpField` desacopla el nombre del campo de formulario del nombre del atributo CDP (cada proyecto puede usar nombres distintos).
- `pushMode`: `"disabled"` (Lead Capture) o `"enabled"` (demos de push). Determina `disabledPushService` y si se registra Service Worker.
- `identity.strategy`: `"email"` | `"phone"` | `"composite"`. Ver §5.2.
- JSON (no JS) para que preventa pueda editarlo sin tocar código; el runtime valida el esquema y **no arranca** si es inválido.

## 5. Secuencia de integración CDP (Lead Capture)

### 5.1 Diagrama de secuencia

```
Usuario        lead-flow            indigitall-client        SDK / API
  │ submit         │                        │                    │
  ├───────────────►│ guard.check()          │                    │
  │                │ validate+normalize     │                    │
  │                │ (falla → error UI, FIN)│                    │
  │                │ bloquear botón         │                    │
  │                ├── ready() ────────────►│ init ya hecho?     │
  │                │                        │ (timeout)          │
  │                ├── identify(extId) ────►│ link(extId, NONE)─►│ POST /customer/link
  │                │◄──────── ok/error ─────┤◄───────────────────┤
  │                │ (error → FIN, sin evento)                   │
  │                ├── setFields({...}) ───►│ assignOrUpdate… ──►│ PUT /customer/field
  │                │◄──────── ok/error ─────┤◄───────────────────┤
  │                │ (error → FIN, sin evento)                   │
  │                ├── verify() [opcional] ►│ getCustomerInformation ► GET /customer/field
  │                │   compara campos       │                    │
  │                ├── sendEvent(...) ─────►│ sendCustomerCustomEvent ► POST /customer/event/custom
  │                │◄──────── ok/error ─────┤◄───────────────────┤
  │                │ marcar enviado (guard) │                    │
  │◄── éxito ──────┤ "Recibimos tu solicitud"                    │
```

Cada paso:
- Envuelto en una `Promise` con **timeout** (`operationTimeoutMs`); un callback que nunca llega es un error.
- Registra en diagnóstico: inicio, fin, duración, resultado, payload enmascarado.
- **Ningún paso posterior se ejecuta si el anterior falla.** El evento **nunca** se envía sin perfil y atributos confirmados (requisito §6 del encargo).

### 5.2 Estrategia de External ID

| Estrategia | Valor | Pros | Contras |
|---|---|---|---|
| `email` (por defecto) | email en minúsculas y sin espacios | Estable; único por persona; fácil de buscar en consola | Varias personas probando con el mismo email comparten perfil |
| `phone` | E.164 (`+573001234567`) | Coincide con la clave natural de WhatsApp/Voice | Normalización por país; números compartidos |
| `composite` | `prefix + email` | Aísla demos dentro del mismo proyecto | No coincide con perfiles existentes |

- ⏳ Confirmar con indigitall cuál de estas estrategias usa el Journey para encontrar al cliente en Voice AI y WhatsApp. Es la decisión funcional más importante de la demo.
- Nunca usar Device ID ni valores aleatorios como External ID (corrige A3).

### 5.3 Atributos

| Atributo CDP | Origen | Normalización |
|---|---|---|
| `name` | formulario | trim, colapsar espacios, máx. 100 |
| `email` | formulario | trim, minúsculas, validación sintáctica |
| `phone` | formulario | E.164 con `defaultCountry`; rechazar si no es válido ⏳ formato a confirmar |
| `product_interest` (custom) | formulario | debe pertenecer a `options` |
| `contact_consent` (custom) | checkbox | booleano; **obligatorio `true`** para continuar |
| `lead_source` (custom) | `staticAttributes` | literal |

`customData` del evento lleva **solo lo que el Journey necesita** (p. ej. `product`, `submitted_at`), nunca datos que deban vivir en el perfil. **No se asume que `customData` persiste atributos en CDP.**

### 5.4 Versión del SDK

Se usa la **última versión publicada** (4.18.1), descargada del enlace oficial de *SDK Setup* y guardada en `vendor/indigitall/<versión>/`. Las firmas usadas en esta arquitectura son las de la documentación vigente, por ejemplo `sendCustomerCustomEvent(eventCode, eventId, eventAt, data, success, error)`. La copia 4.9.1 del repositorio se queda en su ruta actual solo para no romper URLs antiguas.

## 6. Capa compartida: responsabilidades

| Módulo | Responsabilidad | No hace |
|---|---|---|
| `indigitall-client.js` | Cargar el SDK de la versión configurada; `init`; exponer `ready()`, `identify()`, `setFields()`, `getFields()`, `sendEvent()`, `reset()` como Promesas con timeout; traducir errores a códigos propios (`SDK_NOT_LOADED`, `NOT_IDENTIFIED`, `TIMEOUT`, `API_ERROR`, `DISABLED_CHANNEL`). | Lógica de negocio, DOM. |
| `lead-flow.js` | Orden estricto de la secuencia §5.1; política de abortar ante error. | Llamar al SDK directamente. |
| `normalize.js` | Funciones puras de validación/normalización. | Efectos. |
| `form-renderer.js` | Formulario accesible desde `fields`. | Llamadas de red. |
| `guard.js` | Bloqueo de doble envío, cooldown, honeypot, idempotencia local. | Seguridad real (§8). |
| `diagnostics.js` | Panel y log estructurado; enmascarado. | Enviar datos a terceros. |

Solo `indigitall-client.js` conoce nombres y firmas del SDK → un cambio de versión toca un único archivo.

## 7. Despliegue

### 7.1 Estado verificado
Pages sirve la **rama `main`, raíz, con Jekyll** (Audit §3.1). La rama `gh-pages` y el workflow `deploy.yml` no influyen en lo publicado.

### 7.2 Estrategia propuesta: mantener "Deploy from branch: `main` / root"
- Sin paso de build ⇒ no hace falta Actions para publicar; el merge a `main` publica.
- Añadir **`.nojekyll`**: evita que Jekyll ignore archivos/carpetas con `_` (p. ej. `demos/_template`) y transforme Markdown. **Precondición**: sacar `node_modules/` del índice antes (Jekyll hoy lo oculta; con `.nojekyll` se publicaría).
- Añadir `index.html` raíz (portal) que sustituye al README renderizado.
- **No** cambiar la fuente de Pages a `gh-pages`/Actions: rompería la URL de la demo Domino's y de los archivos legados (o exigiría copiarlos).
- Deshabilitar `deploy.yml` (cambiar trigger a `workflow_dispatch` o eliminar en una PR revisada). **No borrar la rama `gh-pages`** (histórico).
- `ci.yml` nuevo: `node --test` + validación de `demo.config.json`, sin permisos de escritura.

### 7.3 Ciclo de trabajo
`feature/*` → PR → CI verde → revisión → merge a `main` → Pages publica (≈1 min). `main` no se modifica directamente.

### 7.4 Preservación de demos existentes
| Recurso | Acción |
|---|---|
| `Dominos_…(2).html` | Intacto (opcional: copia con nombre limpio en `demos/dominos-peru/` + enlace desde el portal). |
| `src/`, `dist/`, `indigitall/`, `service-worker.js` | Intactos en la primera iteración; marcados *legacy* en el portal. Eliminación solo con autorización explícita en una fase posterior. |
| `README.md` | Reescrito (ya no es la página de inicio tras añadir `index.html`). |

## 8. Seguridad y límites del modelo sin backend

| Tema | Decisión |
|---|---|
| App Key | Público. Proyecto indigitall **dedicado a demos**, sin datos de clientes reales, con Journeys que solo actúan sobre contactos permitidos. |
| Contraseñas | Ningún campo de contraseña en ninguna demo. |
| Permisos | Lead Capture: sin push, sin ubicación. |
| Duplicados | Botón deshabilitado durante el envío + clave de idempotencia local + cooldown. |
| Abuso | Los controles frontend (honeypot, cooldown, CAPTCHA cliente) **no son seguridad**: el App Key permite llamar a la API directamente. Controles efectivos disponibles sin backend propio: **(a)** filtro en el Journey (p. ej. solo continuar si `phone` ∈ segmento/allowlist de demo o `email` de dominio permitido), **(b)** límites de frecuencia/capping del Journey, **(c)** límites de la plantilla/número de WhatsApp. ⏳ Confirmar qué filtros ofrece el editor de Journeys. |
| Si se requiere control real | Proxy server-side (p. ej. función serverless con Turnstile y rate limit) que reciba el formulario y llame a la API de servidor de indigitall. **Fuera de alcance** (introduce backend y credenciales privadas); se documenta como evolución. |
| Datos personales | Consentimiento explícito obligatorio; texto de privacidad; purga periódica del proyecto de demo. |
| Origen compartido | El SDK guarda identidad en `localStorage` del origen `mjrivera682.github.io`. Al cargar, `indigitall-client` compara el App Key almacenado con el de la demo y, si difiere, limpia las claves del SDK (⏳ validar claves exactas) y ofrece "Nueva sesión" (`logout` + limpieza). |
| Logs | `logLevel: ERROR` por defecto; `DEBUG` solo con diagnóstico activo. |

## 9. Observabilidad

Activación: `?debug=1` (y opcionalmente `localStorage` para persistir). Desactivado por defecto.

| Dato | Fuente | Nota |
|---|---|---|
| Versión del SDK | `indigitall.version` + versión declarada en config | Alerta si difieren. |
| Estado de inicialización | `idle → loading → initialized → error`; `onError("Push Service disabled")` mostrado como *esperado* en modo sin push | |
| Estado de identificación | `anonymous → identifying → identified(estrategia) → error` | |
| Device ID / External ID | Device ID si existe; External ID **enmascarado** (`j***@d***.com`) y hash almacenado truncado | |
| Operaciones CDP | método, campos enviados (enmascarados), HTTP/resultado, duración ms | |
| Payload del evento | nombre + `customData` enmascarado | |
| Respuestas/errores | código propio + mensaje del SDK | |
| Tiempos | por paso y total | |

**Niveles de confirmación (mostrados explícitamente):**
1. `ACCEPTED_BY_SDK` — el SDK aceptó la llamada (sin respuesta de red aún).
2. `ACCEPTED_BY_API` — callback de éxito con HTTP 2xx (máximo nivel observable desde el navegador).
3. `JOURNEY_CONFIRMED` — **no observable desde el frontend**. Se verifica en la consola de indigitall (estadísticas del Journey / perfil del cliente) o con herramientas de solo lectura (p. ej. estadísticas de Journey vía la API/MCP de indigitall). El panel lo muestra como "pendiente de verificación externa", nunca como confirmado.

Enmascarado: email `a***@d***.tld`, teléfono `+57******4567`, nombre inicial + `***`. Nunca se registran valores completos ni el App Key.

## 10. Decisiones técnicas justificadas

| Decisión | Alternativa descartada | Justificación |
|---|---|---|
| Eliminar Webpack | Mantenerlo | `app.js` no importa módulos; webpack solo añade un `<script>` (Audit §3.4). ES modules nativos funcionan en todos los navegadores objetivo. Elimina `node_modules`, Node 14 y el paso de build. |
| Pages desde `main` root | Actions → `gh-pages` | Es la configuración vigente; preserva URLs; sin build no hace falta pipeline de despliegue. |
| SDK vendorizado por versión | npm `indigitall-webpush` | El paquete npm no se usa y requiere bundler; la doc oficial distribuye zip con dos archivos. Carpetas por versión permiten migrar demo a demo. |
| Config JSON por demo | Código por demo | Preventa crea demos editando datos; un único runtime probado. |
| `sendCustomerCustomEvent` | `sendCustomEvent` / `sendJourneyEvent` | Es el método documentado para ejecutar un Customer Journey (*custom-events-1*); `sendCustomEvent` está documentado para retargeting de push (*features*); `sendJourneyEvent` no está documentado. |
| Sin push en Lead Capture (`disabledPushService: true` + `Channel.NONE`) | Push habilitado | Es la configuración documentada para quien no usa Web Push (*initialization-19*, *integration-25*). Evita el prompt de permisos y el Service Worker. |
| Tests con `node --test` | Jest/Vitest | Sin dependencias; suficiente para funciones puras y orquestación con SDK simulado. |
| App Key en claro | Inyección por secreto | Es público; el secreto daba falsa seguridad y acoplaba el despliegue a Actions. |
