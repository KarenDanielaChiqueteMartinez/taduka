-- TADUKA: registro interno de notificaciones por correo (resumen diario y alertas urgentes).
-- Solo lo usa la Edge Function `inventory-alerts` con la clave de servicio (service_role).
-- No modifica tablas, triggers, funciones ni políticas existentes.

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  kind text not null check (kind in ('daily_summary', 'urgent_alert')),
  -- Resumen diario: fecha local de la tienda (America/Mazatlan).
  local_date date,
  -- Alerta urgente: lote y estado notificado (los de lots_with_status).
  lot_id uuid,
  notified_status text check (notified_status in ('por_vencer', 'vencido')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 200),
  provider_message_id text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  foreign key (lot_id, store_id)
    references public.lots (id, store_id) on delete cascade,
  check (
    (kind = 'daily_summary'
      and local_date is not null and lot_id is null and notified_status is null)
    or
    (kind = 'urgent_alert'
      and lot_id is not null and notified_status is not null and local_date is null)
  ),
  check (status <> 'sent' or sent_at is not null)
);

-- Un resumen por tienda y fecha; una alerta por lote y estado.
create unique index notification_log_daily_key
  on public.notification_log (store_id, local_date) where kind = 'daily_summary';
create unique index notification_log_urgent_key
  on public.notification_log (lot_id, notified_status) where kind = 'urgent_alert';
create index notification_log_retry_idx
  on public.notification_log (kind, status, attempted_at)
  where status in ('pending', 'failed');

alter table public.notification_log enable row level security;
-- Sin políticas: ni anon ni authenticated pueden leer ni escribir el historial.

-- ---------------------------------------------------------------------------
-- Funciones de reclamo y cierre (SECURITY INVOKER: solo service_role las ejecuta)
-- ---------------------------------------------------------------------------
-- "Reclamar" = insertar la fila en estado pending (la clave única evita que dos
-- ejecuciones simultáneas notifiquen lo mismo) o retomar un fallo / un pending
-- abandonado, con FOR UPDATE SKIP LOCKED para que solo una ejecución lo obtenga.

create function public.claim_daily_summaries(
  p_local_date date,
  p_max_attempts integer default 5,
  p_stale interval default interval '15 minutes'
)
returns table (log_id uuid, store_id uuid, local_date date, attempts integer)
language sql
volatile
set search_path = ''
as $$
  with inserted as (
    insert into public.notification_log
      (store_id, kind, local_date, status, attempts, attempted_at)
    select s.id, 'daily_summary', p_local_date, 'pending', 1, now()
    from public.stores s
    on conflict (store_id, local_date) where kind = 'daily_summary' do nothing
    returning id, store_id, local_date, attempts
  ),
  reclaimed as (
    update public.notification_log n
    set status = 'pending', attempts = n.attempts + 1,
        attempted_at = now(), last_error = null
    where n.id in (
      select x.id from public.notification_log x
      where x.kind = 'daily_summary'
        and x.local_date = p_local_date
        and x.attempts < p_max_attempts
        and (x.status = 'failed'
             or (x.status = 'pending' and x.attempted_at < now() - p_stale))
      for update skip locked
    )
    returning n.id, n.store_id, n.local_date, n.attempts
  )
  select id, store_id, local_date, attempts from inserted
  union all
  select id, store_id, local_date, attempts from reclaimed;
$$;

create function public.claim_urgent_alerts(
  p_max_attempts integer default 5,
  p_stale interval default interval '15 minutes'
)
returns table (
  log_id uuid, store_id uuid, lot_id uuid, notified_status text, attempts integer
)
language sql
volatile
set search_path = ''
as $$
  with inserted as (
    insert into public.notification_log
      (store_id, kind, lot_id, notified_status, status, attempts, attempted_at)
    select l.store_id, 'urgent_alert', l.id, l.status, 'pending', 1, now()
    from public.lots_with_status l
    where l.current_quantity > 0 and l.status in ('por_vencer', 'vencido')
    on conflict (lot_id, notified_status) where kind = 'urgent_alert' do nothing
    returning id, store_id, lot_id, notified_status, attempts
  ),
  reclaimed as (
    update public.notification_log n
    set status = 'pending', attempts = n.attempts + 1,
        attempted_at = now(), last_error = null
    where n.id in (
      select x.id from public.notification_log x
      where x.kind = 'urgent_alert'
        and x.attempts < p_max_attempts
        and (x.status = 'failed'
             or (x.status = 'pending' and x.attempted_at < now() - p_stale))
      for update skip locked
    )
    returning n.id, n.store_id, n.lot_id, n.notified_status, n.attempts
  )
  select id, store_id, lot_id, notified_status, attempts from inserted
  union all
  select id, store_id, lot_id, notified_status, attempts from reclaimed;
$$;

-- Solo se cierra lo que sigue pendiente: un fallo nunca se marca como enviado
-- sin un nuevo reclamo, ni un enviado se degrada.
create function public.mark_notifications_sent(p_ids uuid[], p_message_id text)
returns integer
language sql
volatile
set search_path = ''
as $$
  with u as (
    update public.notification_log
    set status = 'sent', sent_at = now(), provider_message_id = p_message_id,
        last_error = null
    where id = any (p_ids) and status = 'pending'
    returning 1
  )
  select count(*)::integer from u;
$$;

create function public.mark_notifications_failed(p_ids uuid[], p_error text)
returns integer
language sql
volatile
set search_path = ''
as $$
  with u as (
    update public.notification_log
    set status = 'failed', last_error = left(coalesce(p_error, 'error'), 200)
    where id = any (p_ids) and status = 'pending'
    returning 1
  )
  select count(*)::integer from u;
$$;

create function public.mark_notifications_skipped(p_ids uuid[], p_reason text)
returns integer
language sql
volatile
set search_path = ''
as $$
  with u as (
    update public.notification_log
    set status = 'skipped', last_error = left(coalesce(p_reason, 'omitida'), 200)
    where id = any (p_ids) and status = 'pending'
    returning 1
  )
  select count(*)::integer from u;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- La Edge Function usa service_role. Con auto_expose_new_tables = false este rol
-- no recibe permisos automáticos, así que se otorgan solo los necesarios:
-- lectura de lo que alimenta el correo y manejo del registro interno.
-- Evita así usar un rol con permisos de escritura sobre el inventario.

revoke all on public.notification_log from public, anon, authenticated;
grant select, insert, update on public.notification_log to service_role;

grant select on public.stores, public.products, public.lots,
  public.lots_with_status to service_role;

revoke all on function public.claim_daily_summaries(date, integer, interval)
  from public, anon, authenticated;
revoke all on function public.claim_urgent_alerts(integer, interval)
  from public, anon, authenticated;
revoke all on function public.mark_notifications_sent(uuid[], text)
  from public, anon, authenticated;
revoke all on function public.mark_notifications_failed(uuid[], text)
  from public, anon, authenticated;
revoke all on function public.mark_notifications_skipped(uuid[], text)
  from public, anon, authenticated;

grant execute on function public.claim_daily_summaries(date, integer, interval) to service_role;
grant execute on function public.claim_urgent_alerts(integer, interval) to service_role;
grant execute on function public.mark_notifications_sent(uuid[], text) to service_role;
grant execute on function public.mark_notifications_failed(uuid[], text) to service_role;
grant execute on function public.mark_notifications_skipped(uuid[], text) to service_role;
