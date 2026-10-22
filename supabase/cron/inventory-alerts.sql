-- PLANTILLA MANUAL: programa los dos trabajos de pg_cron que invocan la Edge Function
-- `inventory-alerts`. NO es una migración: contiene datos propios de cada entorno y no se
-- ha ejecutado en ningún proyecto. Reemplaza los marcadores <...> antes de correrlo.
--
-- Zona horaria: pg_cron usa `cron.timezone` (en Supabase es GMT; verificado en la base
-- local). Por eso los trabajos corren con una frecuencia fija y es la función la que decide
-- la hora local de America/Mazatlan (UTC-7 todo el año): envía el resumen en la primera
-- ejecución entre las 07:00 y las 11:59 locales y registra la fecha para no repetirlo.
-- No dependen de que la expresión cron use la zona de la tienda.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Los valores se guardan en Vault, no en el texto del trabajo.
-- Local: <PROJECT_URL> = http://supabase_kong_TADUKA:8000   (kong dentro de la red de Docker)
-- Producción: <PROJECT_URL> = https://<PROJECT_REF>.supabase.co
-- <CRON_SECRET> debe ser el mismo valor que el secreto CRON_SECRET de la Edge Function.
-- (Si el nombre ya existe, create_secret falla: usa vault.update_secret para rotarlo.)
-- Nota: pg_net guarda la solicitud (con la cabecera) en su cola hasta procesarla; esa cola
-- solo es legible por roles administrativos. El texto del trabajo de cron no contiene el secreto.
-- La URL local (red de Docker) y el funcionamiento de pg_cron/pg_net NO se han probado.
select vault.create_secret('<PROJECT_URL>', 'inventory_alerts_url');
select vault.create_secret('<CRON_SECRET>', 'inventory_alerts_cron_secret');

-- Resumen diario: ejecución horaria; la función solo envía dentro de la ventana local.
select cron.schedule(
  'inventory-alerts-daily-summary',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'inventory_alerts_url')
           || '/functions/v1/inventory-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'inventory_alerts_cron_secret')
    ),
    body := '{"job":"daily_summary"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Alertas urgentes: cada 30 minutos. Un lote solo se notifica una vez por estado
-- (restricción única en notification_log), así que la frecuencia no genera repetidos.
select cron.schedule(
  'inventory-alerts-urgent',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'inventory_alerts_url')
           || '/functions/v1/inventory-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'inventory_alerts_cron_secret')
    ),
    body := '{"job":"urgent_alerts"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Para quitarlos:
--   select cron.unschedule('inventory-alerts-daily-summary');
--   select cron.unschedule('inventory-alerts-urgent');
