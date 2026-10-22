-- Pruebas pgTAP: aislamiento entre tiendas, permisos owner/staff, columnas, funciones.
-- Escritas para `supabase test db`. Todo ocurre dentro de una transacción con ROLLBACK.
--
-- Usuarios:  owner_a (1111…), staff_a (2222…), owner_b (3333…), new_user (4444…)
-- Tiendas:   A (aaaa…) con owner_a + staff_a;  B (bbbb…) con owner_b

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Ayudantes (solo existen dentro de esta transacción)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end;
$$;

create function tests.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;

create function tests.act_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

-- Ejecuta una sentencia y devuelve las filas afectadas (RLS filtra sin error).
create function tests.affected(p_sql text) returns int language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::int;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner_a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'staff_a@test.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'owner_b@test.local', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'new_user@test.local', 'authenticated', 'authenticated');

insert into public.stores (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tienda A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tienda B', '33333333-3333-3333-3333-333333333333');

insert into public.store_members (store_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'staff'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

insert into public.categories (id, store_id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000c0a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lácteos A'),
  ('bbbbbbbb-0000-0000-0000-00000000c0b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Lácteos B');

insert into public.products (id, store_id, category_id, name, unit) values
  ('aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-00000000c0a1', 'Leche A', 'litro'),
  ('bbbbbbbb-0000-0000-0000-00000000b001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-00000000c0b1', 'Leche B', 'litro');

insert into public.lots (id, store_id, product_id, supplier_lot_code, entry_date, expiration_date, initial_quantity) values
  ('aaaaaaaa-0000-0000-0000-0000000010a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'L-MAIN',
   (now() at time zone 'America/Mazatlan')::date,
   (now() at time zone 'America/Mazatlan')::date + 60, 10),
  ('aaaaaaaa-0000-0000-0000-0000000010a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'L-EXP',
   (now() at time zone 'America/Mazatlan')::date - 10,
   (now() at time zone 'America/Mazatlan')::date - 1, 5),
  ('aaaaaaaa-0000-0000-0000-0000000010a3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'L-SOON',
   (now() at time zone 'America/Mazatlan')::date,
   (now() at time zone 'America/Mazatlan')::date + 3, 5),
  ('bbbbbbbb-0000-0000-0000-0000000010b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-00000000b001', 'L-B',
   (now() at time zone 'America/Mazatlan')::date,
   (now() at time zone 'America/Mazatlan')::date + 60, 7);

-- ---------------------------------------------------------------------------
-- 1. Estructura y permisos de funciones
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'),
  'RLS activo en todas las tablas de public');

select ok(not has_function_privilege('anon', 'public.create_store(text)', 'execute'),
  'anon no puede ejecutar create_store');
select ok(not has_function_privilege('anon', 'public.register_movement(uuid,text,numeric,text)', 'execute'),
  'anon no puede ejecutar register_movement');
select ok(has_function_privilege('authenticated', 'public.create_store(text)', 'execute'),
  'authenticated puede ejecutar create_store');
select ok(has_function_privilege('authenticated', 'public.register_movement(uuid,text,numeric,text)', 'execute'),
  'authenticated puede ejecutar register_movement');
select ok(has_function_privilege('authenticated', 'public.is_store_member(uuid)', 'execute'),
  'authenticated puede ejecutar is_store_member (lo usan las políticas)');
select ok(not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute'),
  'authenticated no ejecuta funciones de trigger (set_updated_at)');
select ok(not has_function_privilege('authenticated', 'public.protect_last_owner()', 'execute'),
  'authenticated no ejecuta funciones de trigger (protect_last_owner)');
select ok(not has_function_privilege('authenticated', 'public.lots_set_initial_quantity()', 'execute'),
  'authenticated no ejecuta funciones de trigger (lots_set_initial_quantity)');
select ok(
  (select bool_and(coalesce('search_path=""' = any(proconfig), false))
   from pg_proc where pronamespace = 'public'::regnamespace and prosecdef),
  'Toda función SECURITY DEFINER fija search_path vacío');

-- ---------------------------------------------------------------------------
-- 2. anon: sin acceso
-- ---------------------------------------------------------------------------
select tests.act_anon();
select throws_ok($$select count(*) from public.stores$$, '42501', NULL,
  'anon no puede leer stores');
select throws_ok($$select count(*) from public.products$$, '42501', NULL,
  'anon no puede leer products');
select throws_ok($$select public.create_store('X')$$, '42501', NULL,
  'anon no puede crear tiendas');
select tests.act_postgres();

-- ---------------------------------------------------------------------------
-- 3. Aislamiento: owner_b no ve ni toca la tienda A
-- ---------------------------------------------------------------------------
select tests.act_as('33333333-3333-3333-3333-333333333333');

select is((select count(*)::int from public.stores), 1, 'owner_b solo ve su tienda');
select is((select count(*)::int from public.store_members), 1, 'owner_b solo ve sus miembros');
select is((select count(*)::int from public.categories where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'owner_b no ve categorías de A');
select is((select count(*)::int from public.products where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'owner_b no ve productos de A');
select is((select count(*)::int from public.lots where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'owner_b no ve lotes de A');
select is((select count(*)::int from public.lots_with_status where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'owner_b no ve lotes de A en la vista');
select is((select count(*)::int from public.inventory_movements where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'owner_b no ve movimientos de A');

select is(tests.affected($$update public.products set name = 'hack' where id = 'aaaaaaaa-0000-0000-0000-00000000a001'$$), 0,
  'owner_b no puede editar productos de A');
select is(tests.affected($$update public.lots set supplier_lot_code = 'hack' where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 0,
  'owner_b no puede editar lotes de A');
select is(tests.affected($$update public.stores set name = 'hack' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 0,
  'owner_b no puede editar la tienda A');
select is(tests.affected($$delete from public.store_members where store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 0,
  'owner_b no puede eliminar miembros de A');

select throws_ok($$insert into public.products (store_id, name, unit) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 'pieza')$$,
  '42501', NULL, 'owner_b no puede insertar productos en A');
select throws_ok($$insert into public.categories (store_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X')$$,
  '42501', NULL, 'owner_b no puede insertar categorías en A');
select throws_ok($$insert into public.lots (store_id, product_id, expiration_date, initial_quantity) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-00000000a001', current_date + 5, 1)$$,
  '42501', NULL, 'owner_b no puede insertar lotes en A');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'count', 1, null)$$,
  'P0002', NULL, 'owner_b no puede registrar movimientos en un lote de A');

-- FK compuestas: no se mezclan tiendas aunque el store_id propio sea válido.
select throws_ok($$insert into public.lots (store_id, product_id, expiration_date, initial_quantity) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-0000-0000-00000000a001', current_date + 5, 1)$$,
  '23503', NULL, 'lote de B no puede apuntar a un producto de A');
select throws_ok($$insert into public.products (store_id, category_id, name, unit) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-0000-0000-00000000c0a1', 'Mezcla', 'pieza')$$,
  '23503', NULL, 'producto de B no puede usar una categoría de A');
select tests.act_postgres();

-- ---------------------------------------------------------------------------
-- 4. staff_a: gestiona catálogo y stock, no administra tienda ni miembros
-- ---------------------------------------------------------------------------
select tests.act_as('22222222-2222-2222-2222-222222222222');

select is((select count(*)::int from public.store_members), 2, 'staff_a ve los miembros de su tienda');

select lives_ok($$insert into public.categories (store_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bebidas')$$,
  'staff_a crea categorías');
select lives_ok($$insert into public.products (store_id, name, unit) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Refresco', 'pieza')$$,
  'staff_a crea productos');
select is(tests.affected($$update public.products set is_active = false where name = 'Refresco'$$), 1,
  'staff_a desactiva productos');
select lives_ok($$insert into public.lots (store_id, product_id, supplier_lot_code, expiration_date, initial_quantity) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-00000000a001', 'T-NEW', current_date + 20, 12.5)$$,
  'staff_a crea lotes');
select is((select current_quantity from public.lots where supplier_lot_code = 'T-NEW'), 12.500,
  'current_quantity inicia igual a initial_quantity');
select is(tests.affected($$update public.lots set expiration_date = current_date + 30 where supplier_lot_code = 'T-NEW'$$), 1,
  'staff_a edita la caducidad de un lote');

select is(tests.affected($$update public.stores set name = 'x' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 0,
  'staff_a no edita la tienda');
select is(tests.affected($$update public.stores set expiry_alert_days = 30 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 0,
  'staff_a no cambia expiry_alert_days');
select is(tests.affected($$update public.store_members set role = 'owner' where user_id = '22222222-2222-2222-2222-222222222222'$$), 0,
  'staff_a no puede ascenderse a owner');
select is(tests.affected($$delete from public.store_members where user_id = '11111111-1111-1111-1111-111111111111'$$), 0,
  'staff_a no puede eliminar al owner');
select throws_ok($$insert into public.store_members (store_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'staff')$$,
  '42501', NULL, 'ningún cliente inserta en store_members');

-- Movimientos vía register_movement
select lives_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'count', 8, null)$$,
  'staff_a registra un conteo sin motivo');
select is((select current_quantity from public.lots where id = 'aaaaaaaa-0000-0000-0000-0000000010a1'), 8.000,
  'el conteo actualiza la existencia del lote');
select results_eq(
  $$select quantity_before, quantity_after, difference from public.inventory_movements where lot_id = 'aaaaaaaa-0000-0000-0000-0000000010a1'$$,
  $$values (10.000::numeric, 8.000::numeric, -2.000::numeric)$$,
  'el movimiento guarda antes, después y diferencia');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'adjustment', 9, null)$$,
  '22023', NULL, 'un ajuste exige motivo');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'write_off', 9, 'merma')$$,
  '22023', NULL, 'una baja no puede aumentar la existencia');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'adjustment', 8, 'sin cambio')$$,
  '22023', NULL, 'un ajuste debe cambiar la existencia');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'count', -1, null)$$,
  '22023', NULL, 'no se aceptan cantidades negativas');
select throws_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'venta', 1, 'x')$$,
  '22023', NULL, 'no existe un tipo de movimiento "venta"');
select lives_ok($$select public.register_movement('aaaaaaaa-0000-0000-0000-0000000010a1', 'write_off', 5, 'caja dañada')$$,
  'staff_a registra una baja con motivo');
select throws_ok($$select public.register_movement('bbbbbbbb-0000-0000-0000-0000000010b1', 'count', 1, null)$$,
  'P0002', NULL, 'staff_a no registra movimientos en un lote de B');

-- Columnas inmutables / sin permiso
select throws_ok($$update public.products set store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = 'aaaaaaaa-0000-0000-0000-00000000a001'$$,
  '42501', NULL, 'products.store_id no es modificable');
select throws_ok($$update public.categories set store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = 'aaaaaaaa-0000-0000-0000-00000000c0a1'$$,
  '42501', NULL, 'categories.store_id no es modificable');
select throws_ok($$update public.lots set store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where supplier_lot_code = 'L-MAIN'$$,
  '42501', NULL, 'lots.store_id no es modificable');
select throws_ok($$update public.lots set product_id = 'aaaaaaaa-0000-0000-0000-00000000a001' where supplier_lot_code = 'L-MAIN'$$,
  '42501', NULL, 'lots.product_id no es modificable');
select throws_ok($$update public.lots set current_quantity = 999 where supplier_lot_code = 'L-MAIN'$$,
  '42501', NULL, 'lots.current_quantity no se edita directamente');
select throws_ok($$update public.lots set initial_quantity = 999 where supplier_lot_code = 'L-MAIN'$$,
  '42501', NULL, 'lots.initial_quantity no se edita');
select throws_ok($$insert into public.lots (store_id, product_id, expiration_date, initial_quantity, current_quantity) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-00000000a001', current_date + 5, 1, 99)$$,
  '42501', NULL, 'no se puede fijar current_quantity al insertar un lote');
select throws_ok($$update public.store_members set store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', NULL, 'store_members.store_id no es modificable');
select throws_ok($$update public.store_members set user_id = '44444444-4444-4444-4444-444444444444' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', NULL, 'store_members.user_id no es modificable');
select throws_ok($$update public.stores set created_by = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501', NULL, 'stores.created_by no es modificable');
select throws_ok($$delete from public.products where name = 'Leche A'$$,
  '42501', NULL, 'no se eliminan productos');
select throws_ok($$delete from public.lots where supplier_lot_code = 'L-MAIN'$$,
  '42501', NULL, 'no se eliminan lotes');
select throws_ok($$insert into public.inventory_movements (store_id, lot_id, type, quantity_before, quantity_after, reason) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-0000000010a1', 'adjustment', 1, 2, 'x')$$,
  '42501', NULL, 'no se inserta en inventory_movements directamente');
select throws_ok($$update public.inventory_movements set reason = 'x'$$,
  '42501', NULL, 'el historial no se actualiza');
select throws_ok($$delete from public.inventory_movements$$,
  '42501', NULL, 'el historial no se elimina');

-- Vista de estado
select is((select status from public.lots_with_status where supplier_lot_code = 'L-EXP'), 'vencido',
  'lote caducado -> vencido');
select is((select status from public.lots_with_status where supplier_lot_code = 'L-SOON'), 'por_vencer',
  'lote dentro del umbral (7 días) -> por_vencer');
select is((select status from public.lots_with_status where supplier_lot_code = 'L-MAIN'), 'vigente',
  'lote lejano -> vigente');
select tests.act_postgres();

-- ---------------------------------------------------------------------------
-- 5. owner_a: administra tienda y miembros
-- ---------------------------------------------------------------------------
select tests.act_as('11111111-1111-1111-1111-111111111111');

select is((select expiry_alert_days from public.stores where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 7::smallint,
  'expiry_alert_days por defecto es 7');
select is(tests.affected($$update public.stores set expiry_alert_days = 14 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 1,
  'owner_a cambia expiry_alert_days');
select throws_ok($$update public.stores set expiry_alert_days = 0 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', NULL, 'expiry_alert_days = 0 es inválido');
select throws_ok($$update public.stores set expiry_alert_days = 91 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', NULL, 'expiry_alert_days = 91 es inválido');
select is(tests.affected($$update public.store_members set role = 'staff' where user_id = '22222222-2222-2222-2222-222222222222'$$), 1,
  'owner_a puede cambiar el rol de un miembro');
select throws_ok($$update public.store_members set role = 'staff' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', NULL, 'no se puede degradar al último owner');
select throws_ok($$delete from public.store_members where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', NULL, 'no se puede eliminar al último owner');
select throws_ok($$insert into public.lots (store_id, product_id, entry_date, expiration_date, initial_quantity) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-00000000a001', current_date + 5, current_date + 1, 1)$$,
  '23514', NULL, 'la caducidad no puede ser anterior a la entrada');
select throws_ok($$insert into public.lots (store_id, product_id, expiration_date, initial_quantity) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-00000000a001', current_date + 5, 0)$$,
  '23514', NULL, 'initial_quantity debe ser mayor que 0');
select tests.act_postgres();

-- ---------------------------------------------------------------------------
-- 6. create_store
-- ---------------------------------------------------------------------------
select tests.act_as('44444444-4444-4444-4444-444444444444');
select is((select count(*)::int from public.stores), 0, 'un usuario sin tienda no ve ninguna');
select lives_ok($$select public.create_store('  Mi tiendita  ')$$, 'create_store crea una tienda');
select is((select name from public.stores), 'Mi tiendita', 'create_store recorta el nombre');
select is((select role from public.store_members), 'owner', 'el creador queda como owner');
select throws_ok($$select public.create_store('   ')$$, '22023', NULL,
  'create_store rechaza nombres vacíos');
select tests.act_postgres();

select * from finish();
rollback;
