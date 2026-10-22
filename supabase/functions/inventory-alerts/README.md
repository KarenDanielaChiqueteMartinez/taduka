# inventory-alerts

Edge Function (Deno) que envía por Resend el resumen diario y las alertas urgentes de caducidad.

- **Disparo:** pg_cron → `POST /functions/v1/inventory-alerts` con `x-cron-secret` y `{"job":"daily_summary"|"urgent_alerts"}`. Plantilla en `supabase/cron/inventory-alerts.sql` (manual, sin ejecutar ni probada).
- **Destinatario:** solo el correo de `stores.created_by`, resuelto en Supabase Auth. Sin correo → envío `failed` (`recipient_missing`) y error en logs.
- **Estados y umbral:** vienen de `lots_with_status` y `stores.expiry_alert_days`; no se recalculan aquí.
- **Seguridad:** sin JWT (`verify_jwt = false`); autentica con `CRON_SECRET` en tiempo constante **antes** de revisar método, configuración o tiendas. Sin secreto válido solo se responde 401. Con secreto válido y configuración incompleta, 500 genérico (los nombres de variables van solo a logs). `service_role` se usa solo dentro de la función; las migraciones le otorgan únicamente `SELECT` en `stores`, `products`, `lots`, `lots_with_status` y acceso a las tablas/funciones de notificaciones; no puede escribir en el inventario. `RESEND_API_URL` solo admite `https://api.resend.com/emails` o hosts locales de prueba.

## Modelo de envío (migración `20261023120000_notification_batches.sql`)

Un correo = un **envío** (`notification_batches`) con id estable. Las filas de `notification_log` (resumen por tienda y fecha local, o alerta por lote y estado) cuelgan de un envío.

1. **detect**: registra qué notificar; las claves únicas evitan repetir (tienda+fecha, lote+estado).
2. **assemble**: agrupa las filas sin envío en un envío nuevo por tienda. Un envío ya creado **nunca** recibe filas nuevas.
3. **claim**: reclama envíos nuevos, fallidos o pendientes abandonados (`FOR UPDATE SKIP LOCKED`: solo una ejecución lo obtiene). Máximo 5 intentos y 20 h de vida.
4. **snapshot**: antes del primer envío se guarda una **instantánea inmutable** (destinatario, asunto, HTML y texto). Un trigger impide modificarla.
5. **send**: se envía exactamente la instantánea con la clave `Idempotency-Key: batch:<id>`, igual en todos los reintentos.
6. **finish**: `sent` solo con respuesta satisfactoria de Resend **y** su id (restricción en la base). Los fallos guardan `last_error` y `error_history`.

## Garantías

- Un lote/estado o un resumen tienda/fecha produce **como máximo un envío**; ejecuciones simultáneas no reclaman el mismo.
- Todos los reintentos usan la misma clave **y el mismo contenido**, aunque cambien existencias, días restantes, destinatario o lotes nuevos (estos van en un envío aparte).
- Una respuesta 409 `invalid_idempotent_request` **no** genera clave nueva: el envío queda `failed` con el error y su historial y deja de reintentarse al agotar intentos.
- Ningún reintento automático ocurre pasadas 20 h desde la creación del envío, por debajo de las 24 h que Resend conserva las claves.
- Nunca se marca como enviado sin confirmación de Resend.

Resend (`Idempotency-Key`, hasta 256 caracteres): con la misma clave y contenido devuelve la respuesta original sin reenviar; con contenido distinto, `409 invalid_idempotent_request`; con una solicitud en curso, `409 concurrent_idempotent_requests`. Su documentación **no indica** si las solicitudes fallidas (4xx/5xx) conservan la clave.

### Lo que NO se garantiza (entrega exactamente una vez no es posible aquí)
Es **al menos una vez con deduplicación del proveedor durante 24 h**, no exactamente una vez.
1. Si Resend entrega el correo pero no conserva la clave (fallo interno suyo, o solicitudes fallidas que no la guardan en el caso de una entrega parcial), el reintento puede enviarlo de nuevo.
2. Un envío que agota 5 intentos o supera 20 h queda `failed` aunque el correo pudiera haber salido (p. ej. 5 errores 500 tras aceptarlo): no se reintenta y requiere revisión manual de `notification_batches`.
3. La instantánea puede tener hasta 20 h de antigüedad al reintentarse (por ejemplo, un lote ya agotado seguiría mencionado). Es el costo de no cambiar el contenido.
4. El destinatario queda fijado en la instantánea: si la cuenta cambia de correo, los reintentos del envío ya armado van al correo anterior.
5. Un lote que cambie de estado después de haber sido notificado con otro estado genera una alerta nueva (comportamiento intencional); un envío fallido definitivo no vuelve a avisar ese mismo lote/estado.
6. Los correos pueden rebotar o caer en spam sin que TADUKA lo sepa (no se consumen webhooks de Resend).

## Pruebas
- Función (unitarias, Resend/BD simulados): `node --test supabase/functions/inventory-alerts/*.test.ts` (también con `deno test`). Tipos: `npx tsc -p supabase/functions/tsconfig.json` (excluye `index.ts`).
- SQL: `npx supabase test db` (`supabase/tests/database/02_notification_log.test.sql`).
- Extremo a extremo local (función real en Edge Runtime + Resend simulado + base local): ver `supabase/dev-tools/`.
  1. `cp supabase/functions/.env.example supabase/functions/.env` y poner valores **de prueba** (`RESEND_API_URL=http://host.docker.internal:54999/emails`, `RESEND_API_KEY=re_test_local_mock_key`, `CRON_SECRET` aleatorio).
  2. `MOCK_RESEND_KEY=re_test_local_mock_key node supabase/dev-tools/mock-resend.mjs 54999`
  3. `npx supabase functions serve --env-file supabase/functions/.env`
  4. `node supabase/dev-tools/e2e-inventory-alerts.mjs` (la ventana del resumen diario es 07–12 h locales; fuera de ella solo se comprueba que se omite).
- Sin probar aún: pg_cron/pg_net (la plantilla de cron), un envío real a Resend y `deno check` (no hay Deno instalado).
