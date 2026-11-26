# REPOSITORY_AUDIT — `mjrivera682/static-web-page`

> Fase 1 · Análisis no destructivo · Fecha de auditoría: 2026-11-26
> Commit auditado en `main`: `6a8a8f1` (2026-08-05) · `gh-pages`: `50db194` (2025-03-11)
> Ningún valor sensible se reproduce en este documento. El App Key se referencia solo por su longitud (36 caracteres).

## 0. Leyenda de evidencia

| Marca | Significado |
|---|---|
| **[VERIFICADO]** | Comprobado leyendo código, historial git, respuesta HTTP real del sitio publicado o API pública de GitHub. |
| **[CÓDIGO]** | Existe en el código; su comportamiento en ejecución no se ha probado contra la plataforma real. |
| **[SUPUESTO]** | Inferencia razonable pendiente de validación (requiere acceso a consola indigitall, Settings del repo o prueba con un proyecto de test). |

Las referencias `sdk.min.js@N` indican el **offset en bytes** dentro de `indigitall/sdk.min.js` (archivo minificado de una sola línea, 858 237 bytes).

---

## 1. Resumen ejecutivo

1. **El sitio publicado no es el que construye el pipeline.** GitHub Pages está sirviendo la **raíz de la rama `main` procesada por Jekyll**, no la rama `gh-pages`. Todo el pipeline de Actions + `gh-pages` está huérfano. **[VERIFICADO por comportamiento]** (ver §3.1).
2. **Ninguna página con SDK funciona hoy en la URL pública.** `src/index.html` y `dist/index.html` se sirven, pero sus rutas relativas a `./indigitall/sdk.min.js` devuelven 404 y no reciben App Key. **[VERIFICADO]**
3. La única demo operativa publicada es `Dominos_Peru_Demo_WhatsApp_V8_3_Tickets_Demo(2).html`, que **no usa el SDK** (mock conversacional autónomo). Debe preservarse su URL. **[VERIFICADO]**
4. El SDK local es **indigitall-web-core 4.9.1**; la documentación vigente corresponde a **4.18.1**. La dependencia npm `indigitall-webpush` **no se usa** en ningún lugar del código. **[VERIFICADO]**
5. El flujo de registro envía **contraseñas en `customData`** de un Custom Event, avanza sin esperar callbacks y **no establece External ID**; el login usa el **Device ID** como identificador. **[VERIFICADO]**
6. El App Key se trató como secreto, pero por diseño es **un identificador público de cliente**: se publicó en claro en `gh-pages` (`index.html` y `config.json`). La inyección vía secretos no aporta confidencialidad. **[VERIFICADO]**

---

## 2. Estructura del repositorio y estado de ramas

### 2.1 Ramas

| Rama | Último commit | Fecha | Contenido |
|---|---|---|---|
| `main` | `6a8a8f1` "Add files via upload" | 2026-08-05 | Fuentes + `node_modules` + `dist` + SDK + demo Domino's |
| `gh-pages` | `50db194` "deploy: d0935c2…" | 2025-03-11 | Salida del workflow (`index.html`, `bundle.js`, `config.json`, SDK, assets) |

- `main`: 275 commits en total entre ramas; 113 en `gh-pages`. Todos los mensajes de `main` excepto el último son `Mjriveraatindigitall` (sin semántica) — el historial no documenta intención. **[VERIFICADO]**
- Actividad: enero–marzo 2025 (iteración intensa), un único commit en agosto 2026 (subida manual de la demo Domino's vía UI de GitHub). **[VERIFICADO]**

### 2.2 Archivos versionados (excluyendo `node_modules`)

```
.github/workflows/deploy.yml
.gitignore
Dominos_Peru_Demo_WhatsApp_V8_3_Tickets_Demo(2).html   (1 361 líneas, sin SDK)
README.md                                              (genérico, desactualizado)
dist/bundle.js · dist/index.html · dist/styles/main.css (build obsoleto, versionado)
indigitall/sdk.min.js (858 KB) · indigitall/worker.min.js (148 KB)
package.json · package-lock.json
service-worker.js
src/assets/TV.jpg · src/index.html · src/index2.html
src/scripts/app.js · src/scripts/webpacklocal.js · src/styles/main.css
webpack.config.js
```

Además: **6 404 archivos de `node_modules/` versionados** (161 paquetes de primer nivel). **[VERIFICADO]**

### 2.3 Inconsistencias de control de versiones

| Hallazgo | Evidencia | Estado |
|---|---|---|
| `node_modules/` versionado aunque `.gitignore` lo excluye | `.gitignore:2` vs `git ls-files` (6 404 entradas) | **[VERIFICADO]** — se añadió antes del `.gitignore`. |
| `dist/` versionado aunque `.gitignore` lo excluye | `.gitignore:5`; `dist/index.html` difiere de `src/index.html` (contenido de texto distinto, líneas 53 y 56) | **[VERIFICADO]** — build obsoleto. |
| `*.lock` no cubre `package-lock.json` | `.gitignore:10` | **[VERIFICADO]** (inofensivo). |
| Comentario inline en `.gitignore` (`build/  # Optional…`) invalida el patrón | `.gitignore:6` | **[VERIFICADO]** — git no admite comentarios al final de línea. |
| `node_modules` versionado **no contiene** `indigitall-webpush` | `package-lock.json:1528` declara 4.1.4 (resolviendo core/inapp/customer 4.9.1), pero el paquete no está en `node_modules/` | **[VERIFICADO]** |
| Clonado en Windows falla sin `core.longpaths` | rutas profundas de `node_modules` | **[VERIFICADO]** al clonar para esta auditoría. |

---

## 3. Publicación y despliegue

### 3.1 Qué se publica realmente

Pruebas HTTP contra `https://mjrivera682.github.io/static-web-page/` (2026-11-26):

| Ruta | HTTP | Existe en `main` | Existe en `gh-pages` |
|---|---|---|---|
| `/` | 200 — **README renderizado por Jekyll 3.10** (`<meta name="generator" content="Jekyll v3.10.0">`) | README.md | `index.html` |
| `/service-worker.js` (bajo el subdirectorio) | 200 | Sí | **No** |
| `/config.json` | **404** | No | **Sí** |
| `/bundle.js` | **404** | No (está en `dist/`) | **Sí** |
| `/src/index.html` | 200 | Sí | No |
| `/dist/index.html` | 200 | Sí | No |
| `/Dominos_…(2).html` | 200 | Sí | No |
| `/node_modules/webpack/package.json` | 404 (Jekyll excluye `node_modules`) | Sí | No |

API pública de GitHub: el workflow automático **"pages build and deployment" se ejecutó sobre el SHA de `main` `6a8a8f1`**.

**Conclusión [VERIFICADO por comportamiento]:** la fuente de Pages es *Deploy from branch → `main` / root* con Jekyll. La rama `gh-pages` no se sirve. *Confirmar en Settings → Pages (requiere acceso autenticado, no disponible en esta auditoría).*

### 3.2 Estado de las páginas con SDK en la URL pública

| URL | Recurso referenciado | Resultado |
|---|---|---|
| `/src/index.html` | `./indigitall/sdk.min.js` → `/static-web-page/src/indigitall/sdk.min.js` | **404** |
| `/dist/index.html` | `./indigitall/sdk.min.js` → `/static-web-page/dist/indigitall/sdk.min.js` | **404** |
| ambas | `window.INDIGITALL_API_KEY` | **no definido** (la inyección solo ocurre en el workflow) |
| `/src/index.html` | `app.js` / `bundle.js` | **no se carga** (el template no tiene `<script>` de bundle; lo añade webpack) |

→ **Ninguna demo basada en SDK funciona hoy en producción.** **[VERIFICADO]**
`src/index2.html` no es procesado por webpack (`webpack.config.js:13-16` solo usa `index.html`), por tanto nunca existió en `gh-pages`. **[VERIFICADO]**

### 3.3 Pipeline `.github/workflows/deploy.yml`

| Línea(s) | Hallazgo | Estado |
|---|---|---|
| 3-6 | Se dispara en cada push a `main`. | [VERIFICADO] |
| 14, 17, 64 | `actions/checkout@v2`, `actions/setup-node@v2`, `peaceiris/actions-gh-pages@v3`. La ejecución del 2026-08-05 emitió el aviso: *"Node.js 20 is deprecated… being forced to run on Node.js 24"*. | [VERIFICADO] |
| 19 | `node-version: '14'` (EOL desde 2023-04). **La ejecución del 2026-08-05 terminó en `success`** — no está roto hoy, pero es deuda técnica. | [VERIFICADO] |
| 22 | `npm install` (no `npm ci`) → builds no reproducibles. | [VERIFICADO] |
| 27-28 | "Clean GitHub Pages branch" borra un directorio local que aún no existe: no hace nada. | [VERIFICADO] |
| 30-32 | Escribe el App Key en `dist/config.json` → **se publica** en `gh-pages`. Ningún código lee `config.json`. | [VERIFICADO] |
| 34-36 | `sed` inserta `<script>window.INDIGITALL_API_KEY = "…"</script>` en `dist/index.html`. | [VERIFICADO] |
| 38-39 | `grep` imprime la línea con la clave en el log; GitHub enmascara secretos (`***`), riesgo bajo pero innecesario. | [CÓDIGO] |
| 63-68 | `keep_files: false` con el comentario contradictorio *"Ensures existing files are NOT deleted"*: el valor **reemplaza** todo el contenido de `gh-pages`. Si `gh-pages` llegara a ser la fuente, borraría cualquier otra demo no generada por este build. | [VERIFICADO] |
| 70-74 | Clona `gh-pages` tras el deploy solo para listar archivos (diagnóstico). | [VERIFICADO] |

Historial de `gh-pages`: aparecieron y desaparecieron `test.html`, `testfile.html`, `testfile.txt`, `config.js`, `config.jsonZZ` — evidencia de que `keep_files: false` ya eliminó archivos en el pasado. **[VERIFICADO]**

La ejecución del 2026-08-05 fue `success` pero **no generó commit nuevo en `gh-pages`** (el último sigue siendo 2025-03-11): la salida era idéntica. **[VERIFICADO]**

### 3.4 Webpack

| Archivo:línea | Hallazgo |
|---|---|
| `webpack.config.js:6` | `mode: 'development'` → bundle con `eval`, sin minificar. |
| `webpack.config.js:7` | Entrada única `src/scripts/app.js`, que **no importa nada** (ni CSS ni SDK). Webpack solo envuelve un archivo y añade un `<script defer>`. |
| `webpack.config.js:17-22` | Copia `src/styles`; los assets se copian en el workflow (`deploy.yml:47-48`). |
| `src/scripts/webpacklocal.js` | Config alternativa no referenciada; usa `file-loader` (no instalado) y `devServer.contentBase` (API de webpack-dev-server 3). Código muerto. |
| `README.md:39-42` | Documenta `npm start`, que no existe en `package.json`. |

→ **Webpack no aporta valor funcional**: no hay módulos, ni transpilación, ni imports. **[VERIFICADO]**

---

## 4. SDK y dependencias

| Elemento | Evidencia | Estado |
|---|---|---|
| SDK efectivo | `src/index.html:12` carga `./indigitall/sdk.min.js` (copia local). | [VERIFICADO] |
| Versión local | `sdk.min.js` embebe `"name":"indigitall-web-core","version":"4.9.1"` (25 apariciones); `worker.min.js` también 4.9.1. | [VERIFICADO] |
| npm `indigitall-webpush ^4.1.4` | Declarado en `package.json:17-19`; **ningún `import`/`require`** en el código; ni siquiera instalado en `node_modules` versionado. | [VERIFICADO] — **dependencia muerta, eliminable.** |
| Versión vigente en docs | 4.18.1 (changelog 10/2026; zip `indigitall-web-sdk_v4.18.1.zip`). | [VERIFICADO en documentación] |
| Diferencia de API relevante | `sendCustomerCustomEvent` tiene 4 parámetros en 4.9.1 y 6 en la documentación actual; `link(…, Channel.NONE)` falla en 4.9.1 (ver matriz). | [VERIFICADO en código + docs] |

---

## 5. Service Worker y rutas

| Archivo:línea | Hallazgo | Estado |
|---|---|---|
| `service-worker.js:1` | `importScripts('/indigitall/worker.min.js')` — ruta **absoluta al dominio**. En Pages de proyecto resuelve a `https://mjrivera682.github.io/indigitall/worker.min.js` (fuera de `/static-web-page/`) → 404. | [VERIFICADO] (URL 404) |
| `service-worker.js` | No se referencia desde ningún HTML ni desde `init()`; `workerPath` apunta directamente a `./indigitall/worker.min.js`. Además no se copiaba a `dist/`. | [VERIFICADO] — **archivo muerto**. |
| `src/index.html:17` | `workerPath: './indigitall/worker.min.js'` (relativa). En `gh-pages` resolvía a `/static-web-page/indigitall/worker.min.js` → scope `/static-web-page/indigitall/`. Funcional en esa estructura. | [CÓDIGO] |
| `sdk.min.js@843363` | `registerServiceWorker` usa `"/service-worker.js"` por defecto si no hay `workerPath` → en Pages de proyecto sería 404. `workerPath` **es obligatorio** en subdirectorios. | [VERIFICADO en código] |
| `sdk.min.js@815929` | `findIndigitallSW` identifica el SW buscando `"worker.min.js"` en `scriptURL` → un stub de SW debe llamarse `worker.min.js`. | [VERIFICADO en código] |
| Origen compartido | Todas las Pages de `mjrivera682.github.io/*` comparten origen → comparten `localStorage`/IndexedDB donde el SDK guarda Device ID, External ID y App Key. | [VERIFICADO en código] — riesgo para multi‑demo (§8). |

---

## 6. Funcionalidad de `src/scripts/app.js` (235 líneas)

### 6.1 Inventario: existente vs. verificado

| Funcionalidad | Líneas | ¿Existe? | ¿Funciona en producción hoy? |
|---|---|---|---|
| `fetchData` / `updateDOM` contra `api.example.com` | 1-26 | Sí (plantilla) | No — nunca se llama. Código muerto. |
| Login "Más información" | 28-64 | Sí | No (SDK 404). |
| Registro en 3 pasos (nombre+fecha → 2 emails → 2 contraseñas) | 66-227 | Sí | No (SDK 404). |
| Suscripción a topics `incomplete_step1..3` | 79-86 | Sí | No. |
| Logout | 125-134 | Sí | No. |
| `onIndigitallInitialized` | 137-139 | Sí | **Nunca se ejecuta**: no se pasa como `onInitialized` en `init()` y, dentro del bundle de webpack, no es global. |

### 6.2 Problemas verificados

| # | Problema | Evidencia | Severidad |
|---|---|---|---|
| A1 | **Contraseñas enviadas como Custom Event** (`password1`, `password2` en `customData`, evento `newUser`). Viajan a la plataforma en claro dentro del payload de eventos. | `app.js:202-215` | **Crítica** |
| A2 | El login captura la contraseña en un objeto `data` que no se usa (no se envía, pero se recoge sin propósito). | `app.js:44-50` | Media |
| A3 | **Login usa el Device ID como External ID**: lee `localStorage['indigitall.repository.DEVICE_ID']` y lo pasa a `InApp.logIn`. No identifica a la persona; el email introducido se ignora. Además lee una clave interna del SDK. | `app.js:52-55` | Alta |
| A4 | **El registro nunca establece External ID** (`logIn`/`link` no se llaman). Los eventos `step1/step2/newUser` se asocian solo al dispositivo. | `app.js:102,170,212` | Alta |
| A5 | **La UI avanza sin esperar callbacks**: `loadEmails()`, `emailforms()`, `replaceButtonsWithLogout()` se ejecutan inmediatamente tras lanzar la llamada. | `app.js:62,114,182,224-225` | Alta |
| A6 | `async: false` en los eventos → en 4.9.1 usa `navigator.sendBeacon` y **dispara el callback de éxito sin respuesta del servidor**. El "success" no confirma nada. | `app.js:105,173,215`; `sdk.min.js@826020-826300`, `@827138` | Alta |
| A7 | Logout ejecuta `location.reload()` sin esperar el callback → la petición puede abortarse. | `app.js:127-133` | Media |
| A8 | Topics: suscripción en cada clic y sin esperar a `init` (log engañoso "Indigitall SDK initialized."); `topicsUnsubscribe` sin callbacks. | `app.js:77-86,100,167,210` | Media |
| A9 | `requestLocation: true` → solicita **permiso de geolocalización** sin necesidad funcional. | `src/index.html:18`, `src/index2.html:18` | Media (fricción y privacidad) |
| A10 | `logLevel: DEBUG` en producción → los logs del SDK exponen HMAC, configuración, etc. en consola. | `src/index.html:16`; `sdk.min.js@23795` (`M.d("hmac: ",r)`) | Baja |
| A11 | `registeredEmails()` se sobrescribe inmediatamente con `replaceButtonsWithLogout()`. | `app.js:224-225` | Baja |
| A12 | Inicialización inline en atributo `onload` sin `onInitialized`/`onError` → no hay forma de saber si el SDK está listo. | `src/index.html:12-18` | Alta |
| A13 | Sin validación ni normalización de datos; sin protección de doble envío. | `app.js` completo | Media |

### 6.3 Verificación de los hallazgos preliminares

| Hallazgo preliminar | Resultado |
|---|---|
| El registro envía eventos pero no establece External ID | **Confirmado** (A4). |
| Formularios avanzan sin esperar confirmación | **Confirmado** (A5) y agravado por A6. |
| Login In-App usa Device ID | **Confirmado** (A3). |
| Permisos de ubicación innecesarios | **Confirmado** (A9). |
| Contraseñas en Custom Events | **Confirmado** para el registro (A1); en el login se recogen pero no se envían (A2). |
| Rutas absolutas del SW vs. subdirectorio | **Confirmado** para `service-worker.js` (404), pero ese archivo **no se usa**; la ruta efectiva (`workerPath`) es relativa y era válida en `gh-pages`. |
| Node.js 14 en pipeline | **Confirmado**, pero **no rompe** el build actual (última ejecución `success`). Deuda técnica. |
| `node_modules` versionado | **Confirmado** (6 404 archivos). |
| App Key en `config.json` e inyectado en HTML | **Confirmado** en `gh-pages`. Matiz: el App Key es público por diseño (ver §7). |
| `keep_files: false` puede eliminar demos | **Confirmado** como comportamiento; impacto actual nulo porque `gh-pages` no es la fuente servida. |
| Dependencia npm + SDK local | **Se usa solo el SDK local**; la dependencia npm es muerta. |
| *(nuevo)* Pages sirve `main` vía Jekyll, no `gh-pages` | **Hallazgo nuevo crítico** (§3.1). |
| *(nuevo)* Ninguna demo con SDK funciona en la URL pública | **Hallazgo nuevo crítico** (§3.2). |

---

## 7. Credenciales y datos sensibles

| Elemento | Hallazgo | Evaluación |
|---|---|---|
| App Key (36 caracteres) | Publicado en `gh-pages:index.html:10` y `gh-pages:config.json` (84 de 113 commits de `gh-pages` contienen `config.json`). | El App Key del Web SDK **se envía obligatoriamente al navegador** (`init({appKey})`) y viaja en cada petición; no es un secreto. Tratarlo como secreto da una falsa sensación de seguridad. Lo relevante es que **cualquiera puede usarlo para generar dispositivos, perfiles y eventos en ese proyecto** → el proyecto usado en demos debe ser exclusivo para demos. |
| Secret `INDIGITALL_API_KEY` | Usado solo para inyectar el App Key. | Escaneo del historial completo (`git log -p`, excluyendo `node_modules`, SDK y lockfile) buscando valores con formato UUID, `secret`, `token`, `bearer`: **0 coincidencias en `main`**, 10 líneas en `gh-pages` (todas el App Key inyectado). No hay credenciales privadas de servidor. Versiones antiguas de `main` incluían `console.log("Loaded API Key:", …)` (eliminado). **[VERIFICADO]** |
| Contraseñas | Enviadas en Custom Events (A1). | Deben eliminarse; además, si alguna vez se probaron con datos reales, esos eventos ya residen en el proyecto indigitall → revisar/depurar en consola. **[SUPUESTO: no se ha verificado si se ejecutó con datos reales]** |
| HMAC del External ID | Se registra en consola con `logLevel: DEBUG` (`sdk.min.js@23795`). | Bajo; desactivar DEBUG fuera de diagnóstico. |
| Demo Domino's | Enlaza dominios `*.demo.dominos.pe` ficticios; sin credenciales. | Sin riesgo de credenciales. Contiene marca de un cliente real → mantener fuera de indexación pública si se requiere confidencialidad comercial. [SUPUESTO] |

---

## 8. Riesgos técnicos y de seguridad

| ID | Riesgo | Prob. | Impacto | Mitigación propuesta |
|---|---|---|---|---|
| R1 | Abuso del formulario público para disparar Journeys reales (Voice AI / WhatsApp con coste) usando el App Key público. | Alta | Alto | Controles en el Journey (allowlist/segmento de demo, límites de frecuencia) y proyecto exclusivo de demo. Los controles frontend solo reducen ruido. Ver TARGET_ARCHITECTURE §8. |
| R2 | Origen compartido (`mjrivera682.github.io`) mezcla Device ID / External ID entre demos y proyectos distintos. | Alta | Medio | Reset de identidad por demo, validación de App Key almacenado; preferir un proyecto por origen. |
| R3 | El SDK del repositorio (4.9.1) es anterior a la documentación vigente: las firmas documentadas (p. ej. `sendCustomerCustomEvent` con `eventId`/`eventAt`) no coinciden. | Confirmado | Medio | Usar la última versión publicada en las demos nuevas. |
| R4 | Cambiar la fuente de Pages a `gh-pages`/Actions rompería la URL de la demo Domino's. | Media | Alto | Mantener `main`/root o migrar con redirecciones. |
| R5 | El External ID elegido no coincide con el identificador que usa el Journey → Voice AI / WhatsApp no encuentran al cliente. | Media | Alto | Acordar con indigitall la estrategia de External ID antes de implementar. |
| R6 | Callbacks "success" no confirman persistencia (`sendBeacon`). | Confirmado | Alto | Usar siempre modo asíncrono y respuestas HTTP 2xx. |
| R7 | Un push a `main` dispara un workflow que reescribe `gh-pages` con el App Key. | Alta | Bajo | Deshabilitar el workflow en la primera PR. |
| R8 | Datos personales (nombre, email, teléfono) de visitantes en un proyecto de demo. | Media | Medio | Consentimiento explícito, política de retención y borrado periódico del proyecto de demo. |
| R9 | `localStorage` del SDK persiste External ID entre sesiones de distintos visitantes en el mismo navegador (equipos de stand/demo compartidos). | Alta en eventos | Medio | `logout` + limpieza al terminar cada demo; botón "Nueva sesión". |
| R10 | Paquetes de `node_modules` versionados con posibles vulnerabilidades conocidas (servidos no, pero clonados). | Media | Bajo | Eliminar del índice. |
