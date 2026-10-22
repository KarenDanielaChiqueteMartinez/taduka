-- TADUKA: envíos de correo con instantánea inmutable (notification_batches).
--
-- Problema que resuelve: si Resend recibía una solicitud pero TADUKA no registraba la
-- respuesta, el reintento reconstruía el correo con datos nuevos (otra existencia, otro
-- "caduca en N días", otro grupo de lotes) y Resend respondía 409 invalid_idempotent_request
-- o se enviaba un correo distinto. Ahora cada correo es un "batch":
--   * tiene un id estable (la clave de idempotencia es 'batch:<id>'),
--   * fija una instantánea inmutable (destinatario, asunto, HTML y texto) antes del primer
--     envío, y todos los reintentos envían exactamente esa instantánea,
--   * agrupa las filas de notification_log (resumen de tienda/fecha, o alertas de lote/estado).
-- No toca tablas de inventario, triggers existentes ni RLS existente.

-- ---------------------------------------------------------------------------
-- Tabla de envíos
-- ---------------------------------------------------------------------------

create table public.notification_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  kind text not null check (kind in ('daily_summary', 'urgent_alert')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  attempted_at timestamptz,
  sent_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  -- Historial de fallos para investigar: [{attempt, at, error}, ...]
  error_history jsonb not null default '[]'::jsonb,
  provider_message_id text,
  -- Instantánea inmutable del correo (se fija una sola vez, antes del primer envío).
  recipient text,
  subject text,
  html text,
  text_body text,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (recipient is null and subject is null and html is null
      and text_body is null and snapshot_at is null)
    or
    (recipient is not null and subject is not null and html is not null
      and text_body is not null and snapshot_at is not null)
  ),
  -- Un envío solo cuenta como enviado con instantánea e identificador de Resend.
  check (
    status <> 'sent'
    or (sent_at is not null and snapshot_at is not null
        and provider_message_id is not null and provider_message_id <> '')
  )
);

create index notification_batches_claim_idx
  on public.notification_batches (kind, status, attempted_at)
  where status in ('pending', 'failed');

alter table public.notification_batches enable row level security;
-- Sin políticas: el contenido del correo y los destinatarios no se exponen al cliente.

alter table public.notification_log
  add column batch_id uuid references public.notification_batches (id) on delete cascade;
create index notification_log_batch_idx on public.notification_log (batch_id);
create index notification_log_unbatched_idx
  on public.notification_log (kind) where batch_id is null and status = 'pending';

-- La instantánea y la identidad del envío no se pueden modificar una vez fijadas.
create function public.notification_batches_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.store_id is distinct from old.store_id
     or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at then
    raise exception 'La identidad del envío no es modificable' using errcode = '42501';
  end if;
  if old.snapshot_at is not null and (
       new.recipient is distinct from old.recipient
       or new.subject is distinct from old.subject
       or new.html is distinct from old.html
       or new.text_body is distinct from old.text_body
       or new.snapshot_at is distinct from old.snapshot_at) then
    raise exception 'La instantánea del correo es inmutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_notification_batches_immutable
  before update on public.notification_batches
  for each row execute function public.notification_batches_immutable();

-- ---------------------------------------------------------------------------
-- Reemplazo de las funciones de reclamo anteriores
-- ---------------------------------------------------------------------------

drop function public.claim_daily_summaries(date, integer, interval);
drop function public.claim_urgent_alerts(integer, interval);
drop function public.mark_notifications_sent(uuid[], text);
drop function public.mark_notifications_failed(uuid[], text);

-- 1. Detectar: registra qué hay que notificar (la clave única evita repetidos).
create function public.detect_daily_items(p_local_date date)
returns integer
language sql
volatile
set search_path = ''
as $$
  with ins as (
    insert into public.notification_log (store_id, kind, local_date, status)
    select s.id, 'daily_summary', p_local_date, 'pending' from public.stores s
    on conflict (store_id, local_date) where kind = 'daily_summary' do nothing
    returning 1
  )
  select count(*)::integer from ins;
$$;

create function public.detect_urgent_items()
returns integer
language sql
volatile
set search_path = ''
as $$
  with ins as (
    insert into public.notification_log
      (store_id, kind, lot_id, notified_status, status)
    select l.store_id, 'urgent_alert', l.id, l.status, 'pending'
    from public.lots_with_status l
    where l.current_quantity > 0 and l.status in ('por_vencer', 'vencido')
    on conflict (lot_id, notified_status) where kind = 'urgent_alert' do nothing
    returning 1
  )
  select count(*)::integer from ins;
$$;

-- 2. Agrupar: cada fila pendiente sin envío se asigna a UN envío nuevo por tienda
-- (resumen: por tienda y fecha). Un envío ya creado nunca recibe filas nuevas, así que
-- su grupo no cambia entre reintentos. SKIP LOCKED evita que dos ejecuciones simultáneas
-- agrupen las mismas filas.
create function public.assemble_batches()
returns integer
language sql
volatile
set search_path = ''
as $$
  with locked as (
    select n.id, n.store_id, n.kind, n.local_date
    from public.notification_log n
    where n.batch_id is null and n.status = 'pending'
    for update skip locked
  ),
  groups as (
    select d.store_id, d.kind, d.local_date, gen_random_uuid() as batch_id
    from (select distinct store_id, kind, local_date from locked) d
  ),
  new_batches as (
    insert into public.notification_batches (id, store_id, kind)
    select batch_id, store_id, kind from groups
    returning id
  ),
  assigned as (
    update public.notification_log n
    set batch_id = g.batch_id
    from locked l
    join groups g
      on g.store_id = l.store_id and g.kind = l.kind
     and g.local_date is not distinct from l.local_date
    where n.id = l.id
    returning 1
  )
  select count(*)::integer from new_batches;
$$;

-- 3. Reclamar para enviar: envíos nuevos, fallidos o pendientes abandonados.
--   * Cada reclamo suma un intento; solo lo obtiene una ejecución (SKIP LOCKED).
--   * Un envío no se reintenta después de p_max_attempts ni pasadas p_max_age horas desde
--     su creación (por defecto 20 h): queda por debajo de las 24 h que Resend conserva las
--     claves de idempotencia, así ningún reintento automático ocurre con la clave vencida.
--   * Devuelve la instantánea (null si aún no se fija) para reenviarla tal cual.
create function public.claim_batches(
  p_kind text,
  p_max_attempts integer default 5,
  p_stale interval default interval '15 minutes',
  p_max_age interval default interval '20 hours'
)
returns table (
  batch_id uuid, store_id uuid, kind text, attempts integer,
  recipient text, subject text, html text, text_body text
)
language sql
volatile
set search_path = ''
as $$
  with dead as (
    update public.notification_batches b
    set status = 'failed',
        last_error = case when b.created_at < now() - p_max_age
                          then 'expirado' else 'abandonado' end,
        error_history = b.error_history || jsonb_build_array(jsonb_build_object(
          'attempt', b.attempts, 'at', now(),
          'error', case when b.created_at < now() - p_max_age
                        then 'expirado' else 'abandonado' end))
    where b.kind = p_kind and b.status = 'pending'
      and (b.created_at < now() - p_max_age
           or (b.attempts >= p_max_attempts and b.attempted_at < now() - p_stale))
    returning b.id
  ),
  dead_items as (
    update public.notification_log n
    set status = 'failed', last_error = 'envio_cerrado'
    where n.batch_id in (select id from dead) and n.status = 'pending'
    returning 1
  ),
  claimed as (
    update public.notification_batches b
    set status = 'pending', attempts = b.attempts + 1, attempted_at = now()
    where b.id in (
      select x.id from public.notification_batches x
      where x.kind = p_kind
        and x.attempts < p_max_attempts
        and x.created_at >= now() - p_max_age
        and ((x.status = 'pending' and x.attempts = 0)
             or x.status = 'failed'
             or (x.status = 'pending' and x.attempted_at < now() - p_stale))
      for update skip locked
    )
    returning b.id, b.store_id, b.kind, b.attempts,
              b.recipient, b.subject, b.html, b.text_body
  ),
  reopened as (
    update public.notification_log n
    set status = 'pending'
    where n.batch_id in (select id from claimed) and n.status = 'failed'
    returning 1
  )
  select id, store_id, kind, attempts, recipient, subject, html, text_body from claimed;
$$;

-- 4. Fijar la instantánea (una sola vez) antes del primer envío.
create function public.save_batch_snapshot(
  p_batch_id uuid, p_recipient text, p_subject text, p_html text, p_text_body text
)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with u as (
    update public.notification_batches
    set recipient = p_recipient, subject = p_subject, html = p_html,
        text_body = p_text_body, snapshot_at = now()
    where id = p_batch_id and status = 'pending' and snapshot_at is null
    returning 1
  )
  select exists (select 1 from u);
$$;

-- 5. Cierre. Solo se cierra lo que sigue pendiente; "enviado" exige el id de Resend.
create function public.finish_batch_sent(p_batch_id uuid, p_message_id text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with b as (
    update public.notification_batches
    set status = 'sent', sent_at = now(), provider_message_id = p_message_id,
        last_error = null
    where id = p_batch_id and status = 'pending' and snapshot_at is not null
      and coalesce(p_message_id, '') <> ''
    returning id
  ),
  i as (
    update public.notification_log n
    set status = 'sent', sent_at = now(), provider_message_id = p_message_id
    where n.batch_id in (select id from b) and n.status = 'pending'
    returning 1
  )
  select exists (select 1 from b);
$$;

create function public.finish_batch_failed(p_batch_id uuid, p_error text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with b as (
    update public.notification_batches
    set status = 'failed', last_error = left(coalesce(p_error, 'error'), 200),
        error_history = error_history || jsonb_build_array(jsonb_build_object(
          'attempt', attempts, 'at', now(), 'error', left(coalesce(p_error, 'error'), 200)))
    where id = p_batch_id and status = 'pending'
    returning id
  ),
  i as (
    update public.notification_log n
    set status = 'failed', last_error = left(coalesce(p_error, 'error'), 200)
    where n.batch_id in (select id from b) and n.status = 'pending'
    returning 1
  )
  select exists (select 1 from b);
$$;

-- Omitir un envío solo es posible antes de fijar la instantánea (después ya hay un correo
-- definido que puede haber salido).
create function public.skip_batch(p_batch_id uuid, p_reason text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with b as (
    update public.notification_batches
    set status = 'skipped', last_error = left(coalesce(p_reason, 'omitido'), 200)
    where id = p_batch_id and status = 'pending' and snapshot_at is null
    returning id
  ),
  i as (
    update public.notification_log n
    set status = 'skipped', last_error = left(coalesce(p_reason, 'omitido'), 200)
    where n.batch_id in (select id from b) and n.status = 'pending'
    returning 1
  )
  select exists (select 1 from b);
$$;

-- ---------------------------------------------------------------------------
-- Permisos (solo service_role, mismo criterio que la migración anterior)
-- ---------------------------------------------------------------------------

revoke all on public.notification_batches from public, anon, authenticated;
grant select, insert, update on public.notification_batches to service_role;

revoke all on function public.notification_batches_immutable()
  from public, anon, authenticated;

revoke all on function public.detect_daily_items(date) from public, anon, authenticated;
revoke all on function public.detect_urgent_items() from public, anon, authenticated;
revoke all on function public.assemble_batches() from public, anon, authenticated;
revoke all on function public.claim_batches(text, integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.save_batch_snapshot(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.finish_batch_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_batch_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.skip_batch(uuid, text) from public, anon, authenticated;

grant execute on function public.detect_daily_items(date) to service_role;
grant execute on function public.detect_urgent_items() to service_role;
grant execute on function public.assemble_batches() to service_role;
grant execute on function public.claim_batches(text, integer, interval, interval) to service_role;
grant execute on function public.save_batch_snapshot(uuid, text, text, text, text) to service_role;
grant execute on function public.finish_batch_sent(uuid, text) to service_role;
grant execute on function public.finish_batch_failed(uuid, text) to service_role;
grant execute on function public.skip_batch(uuid, text) to service_role;
