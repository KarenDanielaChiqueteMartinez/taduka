-- Pruebas pgTAP: registro de notificaciones con envíos (batches) e instantánea inmutable.
-- Cubre idempotencia (mismo envío/contenido en reintentos), cierre de estados, tope de intentos,
-- abandonados/expirados, aislamiento entre tiendas y permisos.
-- Todo ocurre en una transacción con ROLLBACK. Las funciones corren como service_role (el rol
-- de la Edge Function). La base local puede tener otras tiendas: cada consulta filtra por las
-- de esta prueba (A = aaaa…, B = bbbb…).
-- La concurrencia real entre sesiones (FOR UPDATE SKIP LOCKED) no se puede probar en una sola
-- sesión; se verifica por separado con ejecuciones paralelas.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-1111111111a1', 'owner_a@notif.test', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-3333333333b1', 'owner_b@notif.test', 'authenticated', 'authenticated');

insert into public.stores (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Tienda A', '11111111-1111-1111-1111-1111111111a1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'Tienda B', '33333333-3333-3333-3333-3333333333b1');

insert into public.products (id, store_id, name, unit) values
  ('aaaaaaaa-0000-0000-0000-00000000aa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Leche A', 'litro'),
  ('bbbbbbbb-0000-0000-0000-00000000bb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'Leche B', 'litro');

-- Tienda A: vencido, por vencer, vigente y agotado. Tienda B: por vencer.
insert into public.lots (id, store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity) values
  ('aaaaaaaa-0000-0000-0000-0000000a0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'aaaaaaaa-0000-0000-0000-00000000aa01', 'A-VENCIDO',
   (now() at time zone 'America/Mazatlan')::date - 10, (now() at time zone 'America/Mazatlan')::date - 2, 5),
  ('aaaaaaaa-0000-0000-0000-0000000a0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'aaaaaaaa-0000-0000-0000-00000000aa01', 'A-POR-VENCER',
   (now() at time zone 'America/Mazatlan')::date, (now() at time zone 'America/Mazatlan')::date + 3, 5),
  ('aaaaaaaa-0000-0000-0000-0000000a0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'aaaaaaaa-0000-0000-0000-00000000aa01', 'A-VIGENTE',
   (now() at time zone 'America/Mazatlan')::date, (now() at time zone 'America/Mazatlan')::date + 60, 5),
  ('aaaaaaaa-0000-0000-0000-0000000a0004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'aaaaaaaa-0000-0000-0000-00000000aa01', 'A-AGOTADO',
   (now() at time zone 'America/Mazatlan')::date - 10, (now() at time zone 'America/Mazatlan')::date - 1, 5),
  ('bbbbbbbb-0000-0000-0000-0000000b0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
   'bbbbbbbb-0000-0000-0000-00000000bb01', 'B-POR-VENCER',
   (now() at time zone 'America/Mazatlan')::date, (now() at time zone 'America/Mazatlan')::date + 2, 7);
update public.lots set current_quantity = 0 where supplier_lot_code = 'A-AGOTADO';

-- ---------------------------------------------------------------------------
-- 1. Permisos: el registro es interno
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.notification_log'::regclass),
  'RLS activo en notification_log');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_batches'::regclass),
  'RLS activo en notification_batches');
select ok(not has_table_privilege('anon', 'public.notification_batches', 'select'),
  'anon no puede leer notification_batches');
select ok(not has_table_privilege('authenticated', 'public.notification_batches', 'select'),
  'authenticated no puede leer notification_batches');
select ok(not has_table_privilege('authenticated', 'public.notification_log', 'select'),
  'authenticated no puede leer notification_log');
select ok(has_table_privilege('service_role', 'public.notification_batches', 'select'),
  'service_role puede leer notification_batches');
select ok(not has_table_privilege('service_role', 'public.lots', 'update'),
  'service_role no recibe permisos de escritura sobre lots');
select ok(not has_table_privilege('service_role', 'public.products', 'insert'),
  'service_role no recibe permisos de escritura sobre products');

select ok(not has_function_privilege('anon', 'public.claim_batches(text,integer,interval,interval)', 'execute'),
  'anon no ejecuta claim_batches');
select ok(not has_function_privilege('authenticated', 'public.claim_batches(text,integer,interval,interval)', 'execute'),
  'authenticated no ejecuta claim_batches');
select ok(not has_function_privilege('authenticated', 'public.finish_batch_sent(uuid,text)', 'execute'),
  'authenticated no ejecuta finish_batch_sent');
select ok(not has_function_privilege('authenticated', 'public.save_batch_snapshot(uuid,text,text,text,text)', 'execute'),
  'authenticated no ejecuta save_batch_snapshot');
select ok(not has_function_privilege('authenticated', 'public.notification_batches_immutable()', 'execute'),
  'authenticated no ejecuta la función del trigger');
select ok(has_function_privilege('service_role', 'public.claim_batches(text,integer,interval,interval)', 'execute'),
  'service_role ejecuta claim_batches');
select ok(has_function_privilege('service_role', 'public.assemble_batches()', 'execute'),
  'service_role ejecuta assemble_batches');
select ok(not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('claim_daily_summaries', 'claim_urgent_alerts', 'mark_notifications_sent', 'mark_notifications_failed')),
  'las funciones antiguas de reclamo ya no existen');

set local role authenticated;
select throws_ok($$select count(*) from public.notification_batches$$, '42501', NULL,
  'authenticated recibe permiso denegado al leer notification_batches');
select throws_ok($$select public.assemble_batches()$$, '42501', NULL,
  'authenticated no puede agrupar envíos');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.notification_batches$$, '42501', NULL,
  'anon recibe permiso denegado al leer notification_batches');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Resumen diario: detectar, agrupar y reclamar una vez por tienda y fecha
-- ---------------------------------------------------------------------------
set local role service_role;
select public.detect_daily_items('2026-10-22');
select public.detect_daily_items('2026-10-22');
select public.assemble_batches();
select public.assemble_batches();
create temp table c_daily1 as select * from public.claim_batches('daily_summary');
grant select on c_daily1 to public;
create temp table c_daily2 as select * from public.claim_batches('daily_summary');
grant select on c_daily2 to public;
reset role;

select is((select count(*)::int from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-22' and store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 2,
  'detectar dos veces deja un solo resumen por tienda y fecha');
select is((select count(distinct batch_id)::int from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-22' and store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 2,
  'cada tienda tiene su propio envío de resumen');
select is((select count(*)::int from c_daily1 where store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 2,
  'el primer reclamo cubre ambas tiendas');
select is((select count(*)::int from c_daily2 where store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 0,
  'el segundo reclamo no devuelve envíos ya reclamados');
select is((select attempts from c_daily1 where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'), 1,
  'el primer intento queda registrado');
select ok((select recipient is null from c_daily1 where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'),
  'antes del primer envío no hay instantánea');

set local role service_role;
select public.detect_daily_items('2026-10-23');
select public.assemble_batches();
reset role;
select is((select count(*)::int from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-23' and store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 2,
  'al día siguiente se genera un resumen nuevo por tienda');
select throws_ok($$insert into public.notification_log (store_id, kind, local_date)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', '2026-10-22')$$,
  '23505', NULL, 'la base impide un segundo resumen para la misma tienda y fecha');

-- ---------------------------------------------------------------------------
-- 3. Instantánea inmutable y reintento con el MISMO contenido
-- ---------------------------------------------------------------------------
create temp table ids as
  select (select batch_id from c_daily1 where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01') as a,
         (select batch_id from c_daily1 where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01') as b;
grant select on ids to public;

set local role service_role;
select is(public.save_batch_snapshot((select a from ids), 'owner_a@notif.test',
  'Asunto original', '<p>HTML original</p>', 'Texto original'), true,
  'la instantánea se fija una vez');
select is(public.save_batch_snapshot((select a from ids), 'otro@notif.test',
  'Asunto distinto', '<p>otro</p>', 'otro'), false,
  'una segunda instantánea no reemplaza a la primera');
reset role;

select throws_ok($$update public.notification_batches set html = '<p>cambiado</p>'
  where snapshot_at is not null and id = (select a from ids)$$,
  '42501', NULL, 'el HTML de la instantánea es inmutable');
select throws_ok($$update public.notification_batches set recipient = 'otro@notif.test'
  where id = (select a from ids)$$,
  '42501', NULL, 'el destinatario de la instantánea es inmutable');
select throws_ok($$update public.notification_batches set store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'
  where id = (select a from ids)$$,
  '42501', NULL, 'un envío no cambia de tienda');

-- Fallo -> los datos cambian -> el reintento recibe la misma instantánea
set local role service_role;
select is(public.finish_batch_failed((select a from ids), 'resend_http_500'), true,
  'un envío pendiente puede marcarse como fallido');
reset role;
update public.lots set current_quantity = 1
  where id = 'aaaaaaaa-0000-0000-0000-0000000a0002';   -- cambia la existencia entre intentos
set local role service_role;
create temp table c_retry as select * from public.claim_batches('daily_summary');
grant select on c_retry to public;
reset role;

select is((select count(*)::int from c_retry where batch_id = (select a from ids)), 1,
  'el envío fallido se reclama de nuevo');
select is((select attempts from c_retry where batch_id = (select a from ids)), 2,
  'el reintento incrementa los intentos');
select is((select html from c_retry where batch_id = (select a from ids)), '<p>HTML original</p>',
  'el reintento recibe el HTML original aunque los datos cambiaron');
select is((select subject from c_retry where batch_id = (select a from ids)), 'Asunto original',
  'el reintento conserva el asunto original');
select is((select recipient from c_retry where batch_id = (select a from ids)), 'owner_a@notif.test',
  'el reintento conserva el destinatario original');
select is((select count(*)::int from c_retry where batch_id = (select b from ids)), 0,
  'el envío de la otra tienda (pendiente reciente) no se reclama');
select is((select error_history -> 0 ->> 'error' from public.notification_batches where id = (select a from ids)),
  'resend_http_500', 'el historial conserva el error del primer intento');
select is((select status from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-22' and store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'), 'pending',
  'al reclamar de nuevo la fila vuelve a pendiente');

-- Éxito: exige id de Resend
set local role service_role;
select is(public.finish_batch_sent((select a from ids), null), false,
  'no se marca como enviado sin id de Resend');
select is(public.finish_batch_sent((select a from ids), ''), false,
  'no se marca como enviado con id vacío');
select is(public.finish_batch_sent((select b from ids), 'msg_sin_instantanea'), false,
  'no se marca como enviado un envío sin instantánea');
select is(public.finish_batch_sent((select a from ids), 'msg_123'), true,
  'con el id de Resend se marca como enviado');
select is(public.finish_batch_failed((select a from ids), 'tarde'), false,
  'un enviado no se degrada a fallido');
create temp table c_after_sent as select * from public.claim_batches('daily_summary');
grant select on c_after_sent to public;
reset role;

select is((select status from public.notification_batches where id = (select a from ids)), 'sent',
  'el estado enviado se conserva');
select is((select provider_message_id from public.notification_batches where id = (select a from ids)), 'msg_123',
  'se guarda el identificador de Resend');
select ok((select sent_at is not null from public.notification_batches where id = (select a from ids)),
  'se registra la fecha de envío');
select is((select status from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-22' and store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'), 'sent',
  'la fila del resumen queda enviada');
select is((select count(*)::int from c_after_sent where batch_id = (select a from ids)), 0,
  'un envío confirmado no se vuelve a reclamar');

-- Omitir: solo antes de la instantánea
set local role service_role;
select is(public.skip_batch((select b from ids), 'tienda_no_encontrada'), true,
  'un envío sin instantánea puede omitirse');
reset role;
select is((select status from public.notification_log where kind = 'daily_summary'
  and local_date = '2026-10-22' and store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'), 'skipped',
  'omitir cierra también las filas del envío');

-- ---------------------------------------------------------------------------
-- 4. Alertas urgentes: una vez por lote y estado, agrupadas por tienda
-- ---------------------------------------------------------------------------
set local role service_role;
select public.detect_urgent_items();
select public.detect_urgent_items();
select public.assemble_batches();
reset role;

select is((select count(*)::int from public.notification_log where kind = 'urgent_alert'
  and store_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')), 3,
  'se detectan solo los lotes vencido y por vencer con existencia (A: 2, B: 1)');
select is((select count(*)::int from public.notification_log where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0003'), 0,
  'un lote vigente no genera alerta');
select is((select count(*)::int from public.notification_log where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0004'), 0,
  'un lote agotado no genera alerta');
select is((select notified_status from public.notification_log where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0001'), 'vencido',
  'el lote vencido se notifica como vencido');
select is((select notified_status from public.notification_log where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0002'), 'por_vencer',
  'el lote por vencer se notifica como por_vencer');
select is((select count(distinct batch_id)::int from public.notification_log where kind = 'urgent_alert'
  and store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'), 1,
  'las alertas de una tienda van en un solo envío');
select is((select count(*)::int from (
    select batch_id from public.notification_log where batch_id is not null
    group by batch_id having count(distinct store_id) > 1) x), 0,
  'ningún envío mezcla filas de tiendas distintas');
select is((select count(*)::int from public.notification_log n
  join public.notification_batches b on b.id = n.batch_id
  where n.store_id <> b.store_id), 0,
  'cada fila pertenece a un envío de su propia tienda');
select throws_ok($$insert into public.notification_log (store_id, kind, lot_id, notified_status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'urgent_alert',
          'aaaaaaaa-0000-0000-0000-0000000a0001', 'vencido')$$,
  '23505', NULL, 'la base impide una segunda alerta del mismo lote y estado');
select throws_ok($$insert into public.notification_log (store_id, kind, lot_id, notified_status)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'urgent_alert',
          'aaaaaaaa-0000-0000-0000-0000000a0001', 'por_vencer')$$,
  '23503', NULL, 'una alerta no puede ligar un lote con otra tienda');

create temp table old_batch as
  select batch_id as id from public.notification_log
  where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0002';
grant select on old_batch to public;

-- Cambio de estado: por_vencer -> vencido genera una alerta nueva en un envío NUEVO,
-- sin modificar el grupo del envío anterior.
update public.lots
  set entry_date = (now() at time zone 'America/Mazatlan')::date - 10,
      expiration_date = (now() at time zone 'America/Mazatlan')::date - 1
  where id = 'aaaaaaaa-0000-0000-0000-0000000a0002';
set local role service_role;
select public.detect_urgent_items();
select public.assemble_batches();
reset role;
select is((select count(*)::int from public.notification_log where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0002'), 2,
  'al pasar de por_vencer a vencido se agrega una alerta nueva y se conserva la anterior');
select isnt((select batch_id from public.notification_log
  where lot_id = 'aaaaaaaa-0000-0000-0000-0000000a0002' and notified_status = 'vencido'),
  (select id from old_batch),
  'la alerta nueva va en un envío distinto al anterior');
select is((select count(*)::int from public.notification_log where batch_id = (select id from old_batch)), 2,
  'el envío anterior conserva exactamente sus filas originales');

-- ---------------------------------------------------------------------------
-- 5. Tope de intentos, abandonados y expirados
-- ---------------------------------------------------------------------------
set local role service_role;
create temp table c_urg as select * from public.claim_batches('urgent_alert');
grant select on c_urg to public;
reset role;
select ok((select count(*) >= 3 from c_urg where store_id in
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01')),
  'se reclaman los envíos urgentes de ambas tiendas (A: 2 envíos, B: 1)');

-- Agotar intentos: fallido con 5 intentos no se reclama
create temp table urgent_b as
  select batch_id as id from public.notification_log
  where lot_id = 'bbbbbbbb-0000-0000-0000-0000000b0001';
grant select on urgent_b to public;
update public.notification_batches set status = 'failed', attempts = 5, last_error = 'resend_http_500'
  where id = (select id from urgent_b);
set local role service_role;
create temp table c_cap as select * from public.claim_batches('urgent_alert');
grant select on c_cap to public;
reset role;
select is((select count(*)::int from c_cap where batch_id = (select id from urgent_b)), 0,
  'un envío fallido con el máximo de intentos no se reclama');

-- Abandonado: pendiente, intentos agotados y sin actividad -> fallido
update public.notification_batches
  set status = 'pending', attempts = 5, attempted_at = now() - interval '1 hour'
  where id = (select id from urgent_b);
update public.notification_log set status = 'pending' where batch_id = (select id from urgent_b);
set local role service_role;
create temp table c_dead as select * from public.claim_batches('urgent_alert');
grant select on c_dead to public;
reset role;
select is((select count(*)::int from c_dead where batch_id = (select id from urgent_b)), 0,
  'un pendiente abandonado sin intentos restantes no se reclama');
select is((select status from public.notification_batches where id = (select id from urgent_b)), 'failed',
  'un pendiente abandonado queda como fallido');
select is((select last_error from public.notification_batches where id = (select id from urgent_b)), 'abandonado',
  'el motivo queda registrado como abandonado');
select is((select status from public.notification_log where batch_id = (select id from urgent_b)), 'failed',
  'las filas del envío abandonado quedan fallidas');

-- Pendiente con intentos disponibles y sin actividad: se retoma
update public.notification_batches
  set status = 'pending', attempts = 1, attempted_at = now() - interval '1 hour'
  where id = (select id from urgent_b);
set local role service_role;
create temp table c_stale as select * from public.claim_batches('urgent_alert');
grant select on c_stale to public;
reset role;
select is((select attempts from c_stale where batch_id = (select id from urgent_b)), 2,
  'un pendiente abandonado con intentos disponibles se retoma');

-- Expirado: más viejo que p_max_age (queda por debajo de las 24 h de Resend)
alter table public.notification_batches disable trigger trg_notification_batches_immutable;
update public.notification_batches
  set created_at = now() - interval '21 hours', status = 'failed', attempts = 1
  where id = (select id from urgent_b);
alter table public.notification_batches enable trigger trg_notification_batches_immutable;
set local role service_role;
create temp table c_old as select * from public.claim_batches('urgent_alert');
grant select on c_old to public;
reset role;
select is((select count(*)::int from c_old where batch_id = (select id from urgent_b)), 0,
  'un envío de más de 20 horas ya no se reintenta');

-- ---------------------------------------------------------------------------
-- 6. Restricciones del registro
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.notification_log (store_id, kind, local_date, lot_id, notified_status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', '2026-11-01',
          'aaaaaaaa-0000-0000-0000-0000000a0001', 'vencido')$$,
  '23514', NULL, 'un resumen no puede llevar lote ni estado');
select throws_ok($$insert into public.notification_log (store_id, kind)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'urgent_alert')$$,
  '23514', NULL, 'una alerta urgente requiere lote y estado');
select throws_ok($$insert into public.notification_batches (store_id, kind, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', 'sent')$$,
  '23514', NULL, 'un envío no puede nacer como enviado sin instantánea ni id de Resend');
select throws_ok($$insert into public.notification_batches
  (store_id, kind, status, recipient, subject, html, text_body, snapshot_at, sent_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', 'sent',
          'a@b.test', 's', 'h', 't', now(), now())$$,
  '23514', NULL, 'un envío enviado exige el id de Resend');
select throws_ok($$insert into public.notification_batches (store_id, kind, recipient)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', 'a@b.test')$$,
  '23514', NULL, 'la instantánea se guarda completa o no se guarda');
select throws_ok($$insert into public.notification_batches (store_id, kind, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'daily_summary', 'enviado')$$,
  '23514', NULL, 'solo se admiten los estados definidos');

select * from finish();
rollback;
