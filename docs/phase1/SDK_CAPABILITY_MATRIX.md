# SDK_CAPABILITY_MATRIX — Funcionalidades del Web SDK de indigitall

> Fase 1 · Revisado 2026-11-26
> **Base:** la documentación oficial vigente. El SDK se considera correcto tal como lo documenta indigitall.
> **Versión objetivo:** la última publicada (**4.18.1**, descarga oficial desde la página *SDK Setup*). Actualizar el SDK es un paso más de la implementación, no algo que haya que investigar.

## 0. Páginas de referencia

| Clave | Página | Funcionalidad |
|---|---|---|
| **INIT** | [initialization-19](https://documentation.indigitall.com/reference/initialization-19) | Inicialización para Customer Journey, `getCustomer`, `getCustomerInformation` |
| **ID** | [integration-25](https://documentation.indigitall.com/reference/integration-25) | Customer Identification: `link` / `unlink` |
| **FIELDS** | [customization-16](https://documentation.indigitall.com/reference/customization-16) | Customer Creation and Update: `assignOrUpdateValueToCustomerFields` / `deleteValuesFromCustomerFields` |
| **CJ-EVT** | [custom-events-1](https://documentation.indigitall.com/reference/custom-events-1) | Custom Events para Customer Journey: `sendCustomerCustomEvent` |
| **ADV** | [features](https://documentation.indigitall.com/reference/features) | Advanced Settings: Retargeting (`sendCustomEvent`) y Topics |
| **SETUP** | [sdk-setup](https://documentation.indigitall.com/reference/sdk-setup) | Descarga del SDK (zip con `sdk.min.js` y `worker.min.js`) |

Estados: ✅ documentado y aplicable · ➖ documentado, no necesario para Lead Capture · ⏳ dato que debe confirmar indigitall o el proyecto.

---

## 1. Matriz funcional

| # | Operación requerida | Método documentado | Firma documentada | Ref. | Depende de | Estado |
|---|---|---|---|---|---|---|
| 1 | Inicializar sin Web Push | `indigitall.init` | `init({ appKey, urlDeviceApi?, disabledPushService: true })` | INIT | `sdk.min.js` cargado | ✅ |
| 2 | Identificar al cliente (External ID) | `indigitall.link` | `link(externalId, indigitall.Channel.NONE, success, error)` | ID | 1 | ✅ |
| 3 | Desvincular / nueva sesión | `indigitall.unlink` | `unlink(indigitall.Channel.NONE, success, error)` | ID | 2 | ✅ |
| 4 | Crear o actualizar el perfil con atributos estándar | `indigitall.assignOrUpdateValueToCustomerFields` | `assignOrUpdateValueToCustomerFields({ "name": …, "email": …, "phone": … }, success, error)` | FIELDS | 2 | ✅ |
| 5 | Atributos personalizados (producto, consentimiento, origen) | mismo método | mismo objeto JSON con claves propias del proyecto | FIELDS | 2 · el campo debe existir en la CDP ⏳ | ✅ / ⏳ |
| 6 | Asociar teléfono y correo al perfil | mismo método | claves `"phone"` y `"email"` (ejemplo oficial) | FIELDS | 2 | ✅ · formato de `phone` ⏳ |
| 7 | Borrar atributos | `indigitall.deleteValuesFromCustomerFields` | `deleteValuesFromCustomerFields(["field1", …], success, error)` | FIELDS | 2 | ➖ |
| 8 | Consultar el ID del cliente | `indigitall.getCustomer` | `getCustomer(success, error)` — *"Once the customer is linked"* | INIT | 2 | ✅ (diagnóstico) |
| 9 | Verificar que los atributos persistieron | `indigitall.getCustomerInformation` | `getCustomerInformation(success, error)` | INIT | 4 | ✅ (verificación previa al evento) |
| 10 | Disparar el Customer Journey | `indigitall.sendCustomerCustomEvent` | `sendCustomerCustomEvent(eventCode, eventId?, eventAt?, data, success, error)` | CJ-EVT | 2, 4 | ✅ |
| 11 | Evento de comportamiento / retargeting (por dispositivo) | `indigitall.sendCustomEvent` | `sendCustomEvent({ eventType, eventId?, eventAt?, customData, async }, success, error)` | ADV | 1 con push activo | ➖ |
| 12 | Segmentar por grupos de interés | `topicsList` / `topicsSubscribe` / `topicsUnsubscribe` | `(codes[], success, error)` | ADV | 1 con push activo + topics creados en consola | ➖ |

---

## 2. Qué método usar para cada cosa

| Necesidad | Usar | No usar | Motivo (según la documentación) |
|---|---|---|---|
| Que un formulario active un **Customer Journey** | `sendCustomerCustomEvent` | `sendCustomEvent` | CJ-EVT: *"If you want a customer journey to be executed after an action on your website"*. |
| Registrar acciones para **retargeting** de push | `sendCustomEvent` | — | ADV: sirve para *"automate retargeting actions"* y depende del dispositivo push. |
| Guardar datos del lead en el **perfil** | `assignOrUpdateValueToCustomerFields` | `data` del evento | Los datos del evento son *"the necessary variables that the journey needs"*; no son atributos del perfil. |
| **Identificar** a la persona | `link(externalId, Channel.NONE)` | `InApp.logIn`, Device ID | ID: sin canal push *"you must assign the value indigitall.Channel.NONE"*. |
| Marcar el **paso del funnel** en que está el usuario | atributo CDP o evento | Topics | Topics agrupan dispositivos push y se definen en consola; no sirven sin push. |

`sendJourneyEvent` no figura en la documentación vigente: no se usará.

---

## 3. Secuencia funcional de Lead Capture

```
1. init({ appKey, disabledPushService: true })
2. link(externalId, indigitall.Channel.NONE)                  → esperar success
3. assignOrUpdateValueToCustomerFields({                       → esperar success
       name, email, phone,
       product_interest, contact_consent, lead_source })
4. getCustomerInformation()                                    → comprobar campos
5. sendCustomerCustomEvent("lead_submitted",                   → esperar success
       submissionId, submittedAt, { product, ... })
6. UI de éxito
```

Reglas:
- Cada paso espera su callback `success`; un `error` o un tiempo de espera agotado detiene la secuencia y **no se muestra éxito**.
- El evento se envía **solo** tras confirmar el perfil (pasos 3 y 4).
- `eventId` = identificador único del envío. Se genera en el navegador y se reutiliza si se reintenta. ⏳ Confirmar si la plataforma deduplica por `eventId`.
- `eventAt` = fecha y hora del envío. ⏳ Confirmar el formato (ISO 8601 o epoch).
- Sin Web Push: no hay prompt de notificaciones, no hace falta Service Worker y no se pide ubicación.

---

## 4. Callbacks y niveles de confirmación

| Nivel | Qué significa | Cómo se observa |
|---|---|---|
| Aceptado por el SDK | La llamada se hizo sin error de parámetros. | Ningún `error` inmediato. |
| **Aceptado por la API** | `success` del método. Es lo máximo que puede confirmar el navegador. | Callback `success`. |
| Perfil verificado | Los atributos leídos coinciden con los enviados. | `getCustomerInformation`. |
| Journey ejecutado | El Journey se disparó y continuó. | **No es observable desde el navegador**: se comprueba en la consola de indigitall (estadísticas del Journey o del perfil). |

---

## 5. Funcionalidades del repositorio actual frente a la documentación

| Uso actual (`src/scripts/app.js`) | Funcionalidad documentada equivalente | Cambio |
|---|---|---|
| `sendCustomEvent` con `step1` / `step2` / `newUser` y datos del formulario (`:102`, `:170`, `:212`) | Retargeting (ADV) | Para Journeys sobre perfiles: `link` + `assignOrUpdateValueToCustomerFields` + `sendCustomerCustomEvent`. |
| Contraseñas en `customData` (`:206-215`) | — | Eliminar. Ninguna funcionalidad lo requiere. |
| `InApp.logIn(deviceId)` (`:52-55`) | Customer Identification (ID) | `link(externalId real, Channel.NONE)`. |
| Topics `incomplete_step1..3` (`:79-86`) | Topics (ADV) | Solo tienen sentido con push. Si se quiere medir el abandono del funnel, usar un atributo CDP (p. ej. `funnel_step`). |
| `requestLocation: true` (`src/index.html:18`) | Opción de `init` | Quitar. |
| Ningún `link` / `assignOrUpdate…` | ID / FIELDS | Añadir. |

---

## 6. Datos que debe confirmar indigitall o el proyecto (no son preguntas sobre el SDK)

1. **External ID:** ¿email, teléfono u otro identificador? Debe coincidir con la clave que usa el Journey para Voice AI y WhatsApp.
2. **Nombres de campos CDP:** ¿`phone`, `email`, `name` existen tal cual? ¿Hay que crear antes en la consola `product_interest`, `contact_consent` y `lead_source`?
3. **Formato de `phone`** que necesitan Voice AI y WhatsApp (p. ej. `+573001234567` o `573001234567`).
4. **Variables que el Journey espera** en `data` de `sendCustomerCustomEvent`, y el `eventCode` exacto configurado en el Journey.
5. **`eventId` / `eventAt`:** formato y si la plataforma deduplica por `eventId`.
6. **`urlDeviceApi`:** ¿el proyecto de demo está en la nube por defecto o en una región o nube privada (p. ej. `eu2`)?
7. **Proyecto de demo:** App Key de un proyecto exclusivo para demos, con un filtro en el Journey para que solo llame o escriba a contactos internos.
