-- Endurecimiento de notification_log: una fila `pending` abandonada (la función se cayó
-- a mitad de camino) que ya agotó sus intentos pasaba a quedar "pendiente" para siempre.
-- Ahora se cierra como `failed` con last_error = 'abandonado', de modo que el historial
-- no miente y no se vuelve a intentar. Solo reemplaza las dos funciones de reclamo
-- (misma firma, permisos intactos); no toca tablas ni datos.

create or replace function public.claim_daily_summaries(
  p_local_date date,
  p_max_attempts integer default 5,
  p_stale interval default interval '15 minutes'
)
returns table (log_id uuid, store_id uuid, local_date date, attempts integer)
language sql
volatile
set search_path = ''
as $$
  with abandoned as (
    update public.notification_log n
    set status = 'failed', last_error = 'abandonado'
    where n.kind = 'daily_summary'
      and n.status = 'pending'
      and n.attempts >= p_max_attempts
      and n.attempted_at < now() - p_stale
    returning 1
  ),
  inserted as (
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

create or replace function public.claim_urgent_alerts(
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
  with abandoned as (
    update public.notification_log n
    set status = 'failed', last_error = 'abandonado'
    where n.kind = 'urgent_alert'
      and n.status = 'pending'
      and n.attempts >= p_max_attempts
      and n.attempted_at < now() - p_stale
    returning 1
  ),
  inserted as (
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
