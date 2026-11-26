# IMPLEMENTATION_PLAN — SDK Recovery & CDP Integration

> Fase 1 · Plan (no ejecutado) · 2026-11-26 · Depende de: REPOSITORY_AUDIT.md, SDK_CAPABILITY_MATRIX.md, TARGET_ARCHITECTURE.md

## 0. Recomendación

**Simplificar: reescribir la capa de integración y conservar activos y URLs.** No recuperar la implementación actual tal cual ni refactorizarla.

| Opción | Veredicto | Evidencia |
|---|---|---|
| Recuperar | ❌ | La demo con SDK no funciona en la URL pública (Audit §3.2). El flujo envía contraseñas (A1), no identifica (A3, A4), no espera confirmaciones (A5, A6). Recuperarla sería volver a publicar defectos. |
| Refactorizar parcialmente | ❌ | De `app.js` no hay nada reutilizable para Lead Capture: el código útil son ~6 llamadas al SDK, y todas están mal secuenciadas. Webpack, `node_modules` y el pipeline no aportan valor (Audit §3.3-3.4). |
| **Simplificar** | ✅ | Se conservan: SDK vendorizado, demo Domino's, URLs legadas, configuración de Pages (`main`/root). Se reemplazan: integración (≈6 módulos pequeños), build (ninguno), despliegue (el que ya existe). |

La demo usa los métodos documentados (Matriz §3) con la última versión publicada del SDK, que se incorpora como un paso más (paso 4).

---

## 1. Bloqueantes y decisiones pendientes

| ID | Bloqueante | Responsable | Bloquea |
|---|---|---|---|
| B2 | Proyecto indigitall **dedicado a demos** + App Key + `urlDeviceApi` si no es la nube por defecto | indigitall / preventa | Paso 6 en adelante |
| B3 | Qué identificador usa el Journey como External ID (email o teléfono) | indigitall / Journeys | Estrategia de External ID |
| B4 | Nombres exactos de los atributos CDP (formato de `phone`, `contact_consent`, `product_interest`, `lead_source`), `eventCode` y variables que espera el Journey en `data` | indigitall / CSM | Config de la demo |
| B5 | Journey de prueba con filtro de allowlist (teléfonos/emails internos) antes de conectar Voice AI/WhatsApp | Equipo de Journeys | Pruebas de integración y publicación |
| B6 | Confirmar la fuente de Pages en Settings → Pages (verificada solo por comportamiento) | Dueño del repo | Paso 2 |
| B7 | Autorización para cambiar el portal raíz (hoy muestra el README) | Dueño del repo | Paso 2 |

---

## 2. Orden de implementación

Cada paso es una PR independiente desde `feature/*` hacia `main`. Ninguna PR elimina demos ni archivos legados.

| Paso | PR | Contenido | Depende de |
|---|---|---|---|
| 1 | `chore/stop-legacy-deploy` | `deploy.yml` → trigger `workflow_dispatch` (deja de reescribir `gh-pages` con el App Key en cada push); `.gitignore` corregido. | — |
| 2 | `chore/untrack-node-modules` | `git rm -r --cached node_modules` (solo `node_modules`, que no tiene URL pública porque Jekyll lo excluye). `dist/` **no se toca**: tiene URLs públicas y se conserva hasta el paso 9. `package.json` se reduce a scripts de test. `.nojekyll` se añade **en esta PR o después**, nunca antes. | B6 |
| 3 | `feat/shared-core` | `shared/js/normalize.js`, `guard.js`, `diagnostics.js` + tests unitarios + `ci.yml`. Sin SDK. | 1 |
| 4 | `feat/vendor-sdk` | `vendor/indigitall/4.18.1/` con los dos archivos del zip oficial (*SDK Setup*). El SDK antiguo sigue en `indigitall/` para las URLs legadas. | — |
| 5 | `feat/indigitall-client` | Adaptador con Promesas + timeouts + códigos de error; tests con SDK simulado. | 3, 4 |
| 6 | `feat/lead-flow` | Orquestación §5.1 de la arquitectura; tests de orden y aborto. | 5 |
| 7 | `feat/demo-cdp-lead-capture` | `demos/cdp-lead-capture/` + `demos/_template/` + `.nojekyll` + portal `index.html`. App Key del proyecto de demo. | 6, B2-B4, B7 |
| 8 | Prueba de integración controlada | Ejecutada con el Journey de prueba con allowlist (B5). **Requiere autorización explícita antes de enviar eventos reales.** | 7, B5 |
| 9 | `chore/legacy-cleanup` (opcional, posterior) | Mover `src/`, `dist/`, `indigitall/`, `service-worker.js`, `webpack*`, `package*.json` a `legacy/` o eliminarlos, **solo con autorización**, dejando redirecciones HTML para URLs publicadas. | 7 |

---

## 3. Cambios por archivo

| Archivo | Acción | Detalle |
|---|---|---|
| `.github/workflows/deploy.yml` | Modificar (paso 1) | `on: workflow_dispatch`; documentar en cabecera que está obsoleto. Eliminación en paso 9. |
| `.github/workflows/ci.yml` | Crear (paso 3) | `actions/checkout@v4`, `actions/setup-node@v4` con Node 22 LTS, `node --test tests/`, validación de JSON de configs. `permissions: contents: read`. |
| `.gitignore` | Modificar (paso 1) | Eliminar comentario inline (`build/  # …`), añadir `.DS_Store`, mantener `node_modules/`. |
| `node_modules/` | Quitar del índice (paso 2) | `git rm -r --cached`. |
| `package.json`, `package-lock.json` | Paso 2: reducir a `{ "type": "module", "scripts": { "test": "node --test tests/" } }` sin dependencias. | Elimina `indigitall-webpush` (muerta) y webpack. |
| `webpack.config.js`, `src/scripts/webpacklocal.js` | Paso 9 | Sin uso tras el paso 2. |
| `service-worker.js` | Paso 9 | Archivo muerto (ruta absoluta errónea, no referenciado). |
| `src/scripts/app.js`, `src/index*.html`, `dist/*` | Intactos hasta el paso 9 | No se corrigen: se sustituyen por la nueva demo. Recomendado en el paso 1: marcar como *legacy* en el portal. |
| `indigitall/sdk.min.js`, `worker.min.js` | Copiar a `vendor/indigitall/4.9.1/` (paso 4); original intacto | URL legada. |
| `Dominos_…(2).html` | **Sin cambios** | URL publicada. |
| `index.html` (raíz) | Crear (paso 7) | Portal con enlaces a demos; sustituye al README renderizado. |
| `.nojekyll` | Crear (paso 7, tras paso 2) | Ver Arquitectura §7.2. |
| `shared/js/*.js`, `shared/css/demo-base.css` | Crear (pasos 3, 5, 6) | Ver Arquitectura §6. |
| `demos/_template/*`, `demos/cdp-lead-capture/*` | Crear (paso 7) | |
| `tests/unit/*.test.mjs`, `tests/fixtures/fake-sdk.js` | Crear (pasos 3, 5, 6) | |
| `README.md` | Reescribir (paso 7) | Cómo crear una demo, cómo activar diagnóstico, política de seguridad. |
| `docs/*.md` | Añadir | Estos cuatro entregables. |

---

## 4. Pruebas

### 4.1 Unitarias (`node --test`, sin dependencias)

| Módulo | Casos |
|---|---|
| `normalize` | email: mayúsculas, espacios, inválidos; teléfono: con y sin `+`, espacios, guiones, país por defecto, longitudes inválidas; nombre: espacios múltiples, longitud; consentimiento obligatorio. |
| `normalize.externalId` | determinista para `email`/`phone`/`composite`; mismo input ⇒ mismo ID; nunca Device ID. |
| `guard` | bloqueo de doble clic; cooldown; honeypot relleno ⇒ rechazo silencioso; idempotencia. |
| `diagnostics.mask` | email, teléfono, nombre; **nunca** contiene el valor completo ni el App Key (prueba con expresión regular sobre la salida). |
| Config | esquema válido/ inválido; `cdpField` duplicado; evento vacío; `pushMode` desconocido ⇒ el runtime no arranca. |

### 4.2 Adaptador y orquestación (SDK simulado)

`tests/fixtures/fake-sdk.js` reproduce las firmas de la versión objetivo y permite programar éxito / error / silencio por método.

| Escenario | Resultado esperado |
|---|---|
| Todo OK | Orden exacto `init → link → assignOrUpdate → getCustomerInformation → sendCustomerCustomEvent`; UI de éxito. |
| `link` falla | No se llama a `assignOrUpdate` ni a evento; UI de error; botón rehabilitado. |
| `assignOrUpdate` falla | Evento **no** enviado. |
| Verificación devuelve campos distintos | Evento **no** enviado; error `PROFILE_MISMATCH`. |
| Evento falla | Sin UI de éxito; reintento manual permitido (misma clave de idempotencia). |
| Callback nunca llega | `TIMEOUT` tras `operationTimeoutMs`; sin éxito. |
| Doble submit rápido | Una sola secuencia. |
| `customData` | No contiene campos de perfil salvo los declarados en `event.data`; nunca campos de tipo contraseña. |
| SDK no cargado (404) | Error `SDK_NOT_LOADED` visible; formulario deshabilitado. |

### 4.3 Integración (navegador, proyecto de test, **con autorización**)

1. Servidor local: `python -m http.server` en la raíz → `http://localhost:8000/demos/cdp-lead-capture/?debug=1`.
2. Simular la estructura de Pages con un subdirectorio (`/static-web-page/`) para validar rutas relativas.
3. Contra el proyecto de demo y el Journey con allowlist (B5): enviar un lead con datos internos; verificar en consola indigitall: perfil creado, atributos con formato esperado, evento recibido, Journey ejecutado solo para la allowlist.
4. Repetir con un teléfono fuera de la allowlist: evento aceptado, **Journey no continúa**.
5. Verificar que no aparece ningún prompt de permisos (notificaciones/ubicación) y que no se registra Service Worker.
6. Verificar en DevTools → Network que ninguna petición contiene contraseñas ni campos no declarados.
7. Navegadores: Chrome, Edge, Firefox, Safari (macOS/iOS).

### 4.4 Despliegue

- Tras el merge: comprobar HTTP 200 de `/`, `/demos/cdp-lead-capture/`, `/vendor/indigitall/<v>/sdk.min.js`, y de **todas las URLs legadas** (`/Dominos_…(2).html`, `/src/index.html`, `/dist/index.html`, `/indigitall/sdk.min.js`).
- Comprobar que `/node_modules/…` sigue devolviendo 404 tras `.nojekyll`.

---

## 5. Criterios de aceptación — CDP Lead Capture

| # | Criterio | Verificación |
|---|---|---|
| AC1 | La demo es accesible en `…/static-web-page/demos/cdp-lead-capture/`. | HTTP 200 |
| AC2 | Formulario con nombre, email, teléfono, producto y consentimiento; el envío se bloquea sin consentimiento. | Manual + unitaria |
| AC3 | Datos validados y normalizados según la config (email minúsculas, teléfono E.164). | Unitaria + consola indigitall |
| AC4 | External ID establecido con la estrategia configurada antes de cualquier escritura en CDP. | Diagnóstico + SDK simulado |
| AC5 | Perfil CDP creado/actualizado con todos los atributos declarados. | Consola indigitall |
| AC6 | El evento `lead_submitted` (configurable) se envía **solo** tras la confirmación de atributos. | SDK simulado (orden) + diagnóstico |
| AC7 | Ningún mensaje de éxito si falla cualquier paso; el error se muestra con un texto comprensible. | Pruebas de fallo |
| AC8 | Sin solicitudes de permiso de notificaciones ni de ubicación; sin Service Worker. | DevTools |
| AC9 | Ningún payload contiene contraseñas; el diagnóstico enmascara PII y nunca muestra el App Key. | Network + unitaria |
| AC10 | Un doble clic produce una única secuencia. | Prueba |
| AC11 | El diagnóstico (`?debug=1`) muestra versión SDK, estados, IDs enmascarados, operaciones, tiempos y distingue `ACCEPTED_BY_API` de `JOURNEY_CONFIRMED`. | Manual |
| AC12 | Todas las URLs publicadas antes del cambio siguen respondiendo 200. | Script de comprobación |
| AC13 | Nueva demo creable copiando `_template/` y editando solo `demo.config.json`. | Prueba en seco |
| AC14 | Sin backend, sin frameworks, sin dependencias de ejecución nuevas. | Revisión |

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El External ID o los nombres de campo no coinciden con lo que espera el Journey, y Voice AI / WhatsApp no encuentran al cliente | B3 y B4 antes del paso 7; la prueba de integración (paso 8) lo verifica en consola. |
| Un método devuelve `error` en la prueba real | El diagnóstico muestra el error exacto del callback; se revisa con indigitall con esa evidencia. |
| Abuso del formulario genera llamadas/WhatsApp con coste | Proyecto de demo + filtro de allowlist en el Journey (B5); los controles frontend se documentan como mitigación de ruido. |
| Identidades mezcladas entre demos (mismo origen) | Comprobación de App Key almacenado + "Nueva sesión"; preferir un proyecto por origen. |
| `.nojekyll` expone archivos antes ocultos | Ordenar pasos 2 → 7; comprobación de 404 de `node_modules`. |
| Cambios en la UI de GitHub Pages / fuente distinta a la observada | B6. |
| Datos personales de prueba persistentes | Purga periódica del proyecto de demo; consentimiento. |

## 7. Estrategia de migración sin romper demos

1. **Aditiva**: las PR 1–8 solo añaden carpetas (`shared/`, `vendor/`, `demos/`, `tests/`) y cambian archivos sin URL pública (workflow, `.gitignore`, `package.json`).
2. **Las URLs legadas no se tocan** hasta el paso 9 y, si se retiran, se sustituyen por páginas de redirección.
3. **Versiones del SDK conviven** en `vendor/indigitall/<versión>/`; cada demo declara la suya. Actualizar una demo no afecta a otras.
4. **El SDK legado `indigitall/` permanece** en su ruta para no romper referencias externas.
5. **Rollback**: cada paso es una PR revertible; como no hay build, revertir el merge restaura el sitio publicado.

## 8. Acciones que requieren autorización explícita (no realizadas en la fase 1)

- Cualquier commit, push o PR al repositorio (incluida la publicación de estos documentos).
- Cambiar la configuración de GitHub Pages o eliminar la rama `gh-pages`.
- Eliminar o mover demos y archivos legados.
- Enviar eventos reales, crear perfiles o ejecutar Customer Journeys.
