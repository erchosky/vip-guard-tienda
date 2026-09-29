-- Tienda: intereses, ventas, anulaciones y reglas de producto.
begin;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if; end $$;

insert into public.customers (id, telegram_id) values
  ('f0000000-0000-4000-8000-000000000001', 900000001),
  ('f0000000-0000-4000-8000-000000000002', 900000002);
insert into public.shop_categories (id, slug, name, status) values
  ('f1000000-0000-4000-8000-000000000001', 'test-visible', 'Visible', 'visible'),
  ('f1000000-0000-4000-8000-000000000002', 'test-oculta', 'Oculta', 'hidden');
insert into public.shop_products (id, category_id, title, price_cents, status, is_unique) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Pieza única', 3000, 'available', true),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Pack digital', 1500, 'available', false),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'En categoría oculta', 1000, 'available', true),
  ('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'Borrador', 1000, 'draft', true);

-- Interés: el primero es nuevo, el segundo clic solo suma.
create temp table i1 as select * from public.shop_register_interest('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 3000, false);
select pg_temp.check((select is_new from i1), 'primer interés es nuevo');
create temp table i2 as select * from public.shop_register_interest('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 2550, true);
select pg_temp.check(not (select is_new from i2) and (select interest_id from i2) = (select interest_id from i1), 'segundo clic reutiliza el interés');
select pg_temp.check((select clicks from public.shop_interests where id = (select interest_id from i1)) = 2, 'cuenta clics');
select pg_temp.check((select price_shown_cents from public.shop_interests where id = (select interest_id from i1)) = 2550, 'actualiza precio mostrado');

-- No se aceptan intereses en productos no públicos.
do $$ begin
  perform public.shop_register_interest('f2000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 1000, false);
  raise exception 'FALLO: interés en categoría oculta';
exception when no_data_found then null; end $$;
do $$ begin
  perform public.shop_register_interest('f2000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 1000, false);
  raise exception 'FALLO: interés en borrador';
exception when no_data_found then null; end $$;

-- Venta de pieza única: pasa a vendido, cierra el interés del comprador.
insert into public.settings (key, value) values ('shop', '{"soldVisibleDays": 5}')
  on conflict (key) do update set value = excluded.value;
create temp table s1 as select public.shop_register_sale('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 3000, 'bizum', 500, null, null, '2026-03-01 12:00+00') as id;
select pg_temp.check((select status from public.shop_products where id = 'f2000000-0000-4000-8000-000000000001') = 'sold', 'pieza única vendida');
select pg_temp.check((select sold_visible_until from public.shop_products where id = 'f2000000-0000-4000-8000-000000000001') = '2026-03-06 12:00+00', 'sello VENDIDO 5 días');
select pg_temp.check((select status from public.shop_interests where id = (select interest_id from i1)) = 'sold', 'interés del comprador cerrado');
select pg_temp.check((select product_title from public.shop_sales where id = (select id from s1)) = 'Pieza única', 'guarda título del producto');

-- No se vende dos veces una pieza única.
do $$ begin
  perform public.shop_register_sale('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 3000, 'bizum');
  raise exception 'FALLO: doble venta de pieza única';
exception when raise_exception then
  if sqlerrm <> 'product_already_sold' then raise; end if;
end $$;

-- Producto no único: se puede vender varias veces y sigue disponible.
select public.shop_register_sale('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 1500, 'paypal');
select public.shop_register_sale('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 1500, 'paypal');
select pg_temp.check((select status from public.shop_products where id = 'f2000000-0000-4000-8000-000000000002') = 'available', 'no único sigue disponible');

-- Venta sin cliente necesita etiqueta.
do $$ begin
  perform public.shop_register_sale('f2000000-0000-4000-8000-000000000002', null, 1500, 'bizum');
  raise exception 'FALLO: venta sin comprador';
exception when check_violation then null; end $$;
select public.shop_register_sale('f2000000-0000-4000-8000-000000000002', null, 1500, 'bizum', 0, 'Cliente de Instagram');

-- Estadísticas del cliente.
select pg_temp.check((select purchases_count from public.customer_stats where customer_id = 'f0000000-0000-4000-8000-000000000001') = 2, 'cuenta compras');
select pg_temp.check((select shop_spent_cents from public.customer_stats where customer_id = 'f0000000-0000-4000-8000-000000000001') = 4500, 'suma gasto sin envío');

-- Anular la venta devuelve la pieza a disponible.
select pg_temp.check(public.shop_void_sale((select id from s1), 'devolución'), 'anula venta');
select pg_temp.check((select status from public.shop_products where id = 'f2000000-0000-4000-8000-000000000001') = 'available', 'pieza vuelve a disponible');
select pg_temp.check(not public.shop_void_sale((select id from s1), 'otra vez'), 'no se anula dos veces');

-- Reglas de precio.
do $$ begin
  update public.shop_products set offer_price_cents = 5000 where id = 'f2000000-0000-4000-8000-000000000002';
  raise exception 'FALLO: oferta mayor que el precio';
exception when check_violation then null; end $$;
do $$ begin
  update public.shop_products set offer_ends_at = now() where id = 'f2000000-0000-4000-8000-000000000002';
  raise exception 'FALLO: fechas de oferta sin precio de oferta';
exception when check_violation then null; end $$;
do $$ begin
  update public.shop_products set vip_price_cents = 99999 where id = 'f2000000-0000-4000-8000-000000000002';
  raise exception 'FALLO: precio VIP mayor que el normal';
exception when check_violation then null; end $$;
do $$ begin
  update public.shop_products set status = 'sold' where id = 'f2000000-0000-4000-8000-000000000002';
  raise exception 'FALLO: vendido sin fecha';
exception when check_violation then null; end $$;

-- Borrar un producto conserva ventas e intereses.
delete from public.shop_products where id = 'f2000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from public.shop_sales where product_title = 'Pack digital') = 3, 'ventas conservadas');
rollback;
