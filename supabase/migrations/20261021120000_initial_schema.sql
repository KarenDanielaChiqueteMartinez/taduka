-- TADUKA: esquema inicial (tiendas, miembros, categorías, productos, lotes, movimientos).
-- Aislamiento por tienda mediante store_id + RLS. Sin ventas: los conteos/ajustes no son ventas.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  expiry_alert_days smallint not null default 7
    check (expiry_alert_days between 1 and 90),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_id_idx on public.store_members (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, store_id)
);
create unique index categories_store_name_key
  on public.categories (store_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text not null
    check (unit in ('pieza', 'kg', 'g', 'litro', 'ml', 'paquete', 'caja')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  foreign key (category_id, store_id)
    references public.categories (id, store_id) on delete restrict
);
create unique index products_store_name_key
  on public.products (store_id, lower(name));
create index products_store_active_name_idx
  on public.products (store_id, is_active, name);
create index products_store_category_idx
  on public.products (store_id, category_id);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null,
  supplier_lot_code text check (char_length(supplier_lot_code) <= 60),
  entry_date date not null
    default ((now() at time zone 'America/Mazatlan')::date),
  expiration_date date not null,
  initial_quantity numeric(12, 3) not null check (initial_quantity > 0),
  current_quantity numeric(12, 3) not null check (current_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  check (expiration_date >= entry_date),
  foreign key (product_id, store_id)
    references public.products (id, store_id) on delete restrict
);
create index lots_store_product_idx on public.lots (store_id, product_id);
create index lots_store_expiration_idx
  on public.lots (store_id, expiration_date) where current_quantity > 0;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  lot_id uuid not null,
  type text not null check (type in ('count', 'adjustment', 'write_off')),
  quantity_before numeric(12, 3) not null check (quantity_before >= 0),
  quantity_after numeric(12, 3) not null check (quantity_after >= 0),
  difference numeric(12, 3) generated always as (quantity_after - quantity_before) stored,
  reason text check (char_length(reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (lot_id, store_id)
    references public.lots (id, store_id) on delete restrict,
  check (type = 'count' or char_length(btrim(coalesce(reason, ''))) > 0),
  check (type <> 'write_off' or quantity_after < quantity_before),
  check (type <> 'adjustment' or quantity_after <> quantity_before)
);
create index inventory_movements_store_created_idx
  on public.inventory_movements (store_id, created_at desc);
create index inventory_movements_lot_created_idx
  on public.inventory_movements (lot_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Funciones de apoyo para RLS (SECURITY DEFINER, solo devuelven booleano)
-- ---------------------------------------------------------------------------

create function public.is_store_member(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = sid and m.user_id = (select auth.uid())
  );
$$;

create function public.is_store_owner(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = sid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Funciones de trigger (SECURITY INVOKER; nadie las ejecuta directamente)
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.prevent_store_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_id is distinct from old.store_id then
    raise exception 'store_id no es modificable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.prevent_member_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id no es modificable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.lots_set_initial_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.current_quantity := new.initial_quantity;
  return new;
end;
$$;

create function public.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Solo importa si se degrada o elimina a un propietario.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Un owner que sigue siendo owner (solo UPDATE; en DELETE no se consulta NEW).
  if tg_op = 'UPDATE' then
    if new.role = 'owner' then
      return new;
    end if;
  end if;

  -- Eliminación en cascada de la tienda completa.
  if not exists (select 1 from public.stores s where s.id = old.store_id) then
    return old;
  end if;

  perform 1
  from public.store_members m
  where m.store_id = old.store_id
    and m.role = 'owner'
    and m.user_id <> old.user_id
  for update;

  if not found then
    raise exception 'La tienda debe conservar al menos un propietario'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger trg_stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_lots_updated_at before update on public.lots
  for each row execute function public.set_updated_at();

create trigger trg_categories_store_immutable before update on public.categories
  for each row execute function public.prevent_store_change();
create trigger trg_products_store_immutable before update on public.products
  for each row execute function public.prevent_store_change();
create trigger trg_lots_store_immutable before update on public.lots
  for each row execute function public.prevent_store_change();
create trigger trg_store_members_store_immutable before update on public.store_members
  for each row execute function public.prevent_store_change();
create trigger trg_store_members_user_immutable before update on public.store_members
  for each row execute function public.prevent_member_identity_change();

create trigger trg_lots_initial_quantity before insert on public.lots
  for each row execute function public.lots_set_initial_quantity();

create trigger trg_store_members_protect_last_owner
  before update or delete on public.store_members
  for each row execute function public.protect_last_owner();

-- ---------------------------------------------------------------------------
-- Funciones de negocio (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create function public.create_store(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Nombre de tienda inválido' using errcode = '22023';
  end if;

  insert into public.stores (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_id;

  insert into public.store_members (store_id, user_id, role)
  values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;

-- Único camino para cambiar existencias. Un conteo o ajuste NO es una venta.
create function public.register_movement(
  p_lot_id uuid,
  p_type text,
  p_quantity_after numeric,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_store uuid;
  v_before numeric(12, 3);
  v_after numeric(12, 3);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_type is null or p_type not in ('count', 'adjustment', 'write_off') then
    raise exception 'Tipo de movimiento inválido' using errcode = '22023';
  end if;
  if p_quantity_after is null or p_quantity_after < 0 then
    raise exception 'Cantidad inválida' using errcode = '22023';
  end if;

  -- La tienda se obtiene del lote, nunca de un parámetro; mensaje genérico.
  select l.store_id into v_store from public.lots l where l.id = p_lot_id;
  if v_store is null or not public.is_store_member(v_store) then
    raise exception 'Lote no encontrado' using errcode = 'P0002';
  end if;

  select l.current_quantity into v_before
  from public.lots l
  where l.id = p_lot_id and l.store_id = v_store
  for update;

  v_after := round(p_quantity_after, 3);

  if p_type <> 'count' and v_reason is null then
    raise exception 'El motivo es obligatorio' using errcode = '22023';
  end if;
  if p_type = 'write_off' and v_after >= v_before then
    raise exception 'La baja debe reducir la existencia' using errcode = '22023';
  end if;
  if p_type = 'adjustment' and v_after = v_before then
    raise exception 'El ajuste debe cambiar la existencia' using errcode = '22023';
  end if;

  insert into public.inventory_movements
    (store_id, lot_id, type, quantity_before, quantity_after, reason, created_by)
  values
    (v_store, p_lot_id, p_type, v_before, v_after, v_reason, v_uid)
  returning id into v_id;

  update public.lots set current_quantity = v_after where id = p_lot_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vista de estado de lotes (respeta RLS del usuario que consulta)
-- ---------------------------------------------------------------------------

create view public.lots_with_status
with (security_invoker = true) as
select
  l.id,
  l.store_id,
  l.product_id,
  p.name as product_name,
  p.unit,
  l.supplier_lot_code,
  l.entry_date,
  l.expiration_date,
  l.initial_quantity,
  l.current_quantity,
  l.created_at,
  l.updated_at,
  (l.expiration_date - t.today)::int as days_to_expiry,
  case
    when l.expiration_date < t.today then 'vencido'
    when l.expiration_date <= t.today + s.expiry_alert_days then 'por_vencer'
    else 'vigente'
  end as status
from public.lots l
join public.products p on p.id = l.product_id and p.store_id = l.store_id
join public.stores s on s.id = l.store_id
cross join lateral (
  select (now() at time zone 'America/Mazatlan')::date as today
) t;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.lots enable row level security;
alter table public.inventory_movements enable row level security;

-- stores: miembros leen; solo el propietario edita. El alta es vía create_store().
create policy stores_select on public.stores for select to authenticated
  using (public.is_store_member(id));
create policy stores_update on public.stores for update to authenticated
  using (public.is_store_owner(id)) with check (public.is_store_owner(id));

-- store_members: miembros leen; solo el propietario cambia roles o elimina.
-- Sin INSERT desde el cliente (alta/invitación diferida).
create policy store_members_select on public.store_members for select to authenticated
  using (public.is_store_member(store_id));
create policy store_members_update on public.store_members for update to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy store_members_delete on public.store_members for delete to authenticated
  using (public.is_store_owner(store_id));

-- categories, products, lots: cualquier miembro (owner o staff). Sin DELETE.
create policy categories_select on public.categories for select to authenticated
  using (public.is_store_member(store_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (public.is_store_member(store_id));
create policy categories_update on public.categories for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy products_select on public.products for select to authenticated
  using (public.is_store_member(store_id));
create policy products_insert on public.products for insert to authenticated
  with check (public.is_store_member(store_id));
create policy products_update on public.products for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy lots_select on public.lots for select to authenticated
  using (public.is_store_member(store_id));
create policy lots_insert on public.lots for insert to authenticated
  with check (public.is_store_member(store_id));
create policy lots_update on public.lots for update to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- inventory_movements: solo lectura; se escribe únicamente con register_movement().
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (public.is_store_member(store_id));

-- ---------------------------------------------------------------------------
-- Permisos explícitos (tablas y columnas)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on public.stores, public.store_members, public.categories,
  public.products, public.lots, public.inventory_movements,
  public.lots_with_status to authenticated;

grant update (name, expiry_alert_days) on public.stores to authenticated;

grant update (role) on public.store_members to authenticated;
grant delete on public.store_members to authenticated;

grant insert (store_id, name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;

grant insert (store_id, category_id, name, unit) on public.products to authenticated;
grant update (category_id, name, unit, is_active) on public.products to authenticated;

-- current_quantity lo fija el trigger al insertar y register_movement() después.
grant insert (store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity)
  on public.lots to authenticated;
grant update (supplier_lot_code, entry_date, expiration_date) on public.lots to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos EXECUTE
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;
grant execute on function public.create_store(text) to authenticated;
grant execute on function public.register_movement(uuid, text, numeric, text) to authenticated;
