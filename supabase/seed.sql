-- Datos de ejemplo SOLO para desarrollo local. Ficticios, sin datos personales.
-- En producción no se ejecuta: el contenido real se crea desde el panel.

insert into public.settings (key, value) values
  ('brand', '{"name": "Nina", "tagline": "Mi rincón privado 💋", "contactUsername": "tu_usuario_telegram"}'),
  ('shop', '{"vipDiscountPercent": 15, "soldVisibleDays": 3, "reserveHours": 48}'),
  ('vip', '{"reminderHours": [24]}')
on conflict (key) do nothing;

insert into public.vip_plans (id, name, description, duration_days, price_first_cents, price_renewal_cents, status, is_featured, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', '1 mes', 'Acceso completo al canal VIP durante 30 días.', 30, 2500, 2000, 'active', false, 10),
  ('a1000000-0000-4000-8000-000000000002', '3 meses', 'Tres meses de VIP con descuento.', 90, 6000, 5000, 'active', true, 20),
  ('a1000000-0000-4000-8000-000000000003', '1 semana', 'Prueba el VIP una semana.', 7, 900, 900, 'hidden', false, 30)
on conflict (id) do nothing;

insert into public.shop_categories (id, slug, name, description, status, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'tangas', 'Tangas', 'Usados y con mucho cariño.', 'visible', 10),
  ('b1000000-0000-4000-8000-000000000002', 'calcetines', 'Calcetines', 'Después de un día entero.', 'visible', 20),
  ('b1000000-0000-4000-8000-000000000003', 'packs', 'Packs digitales', 'Fotos y vídeos que te llegan por privado.', 'visible', 30),
  ('b1000000-0000-4000-8000-000000000004', 'borrador', 'Categoría oculta', 'No se ve en la tienda.', 'hidden', 40)
on conflict (id) do nothing;

insert into public.shop_products (id, category_id, title, description, size, color, price_cents, offer_price_cents, offer_starts_at, offer_ends_at, vip_price_cents, is_unique, fulfillment, status, is_featured, sort_order, published_at, sold_at, sold_visible_until) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Tanga rosa de encaje', 'Usado dos días. Te llega en bolsa sellada.', 'S', 'Rosa', 2500, 1900, now() - interval '1 day', now() + interval '2 days', null, true, 'physical', 'available', true, 10, now(), null, null),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Tanga rojo', 'Mi favorito del mes.', 'M', 'Rojo', 3000, null, null, null, 2400, true, 'physical', 'available', false, 20, now(), null, null),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002', 'Calcetines blancos de deporte', 'Tras una sesión de gimnasio.', 'Única', 'Blanco', 1800, null, null, null, null, true, 'physical', 'reserved', false, 30, now(), null, null),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000003', 'Pack 20 fotos', 'Te lo envío por privado al confirmar el pago.', null, null, 1500, null, null, null, null, false, 'digital', 'available', false, 40, now(), null, null),
  ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'Tanga negro', 'Vendido hace nada.', 'S', 'Negro', 2800, null, null, null, null, true, 'physical', 'available', false, 50, now() - interval '5 days', null, null),
  ('c1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000001', 'Borrador sin publicar', 'Todavía no se ve.', 'M', 'Azul', 2000, null, null, null, null, true, 'physical', 'draft', false, 60, null, null, null)
on conflict (id) do nothing;

update public.shop_products set reserved_at = now() - interval '1 day' where status = 'reserved' and reserved_at is null;

insert into public.customers (id, telegram_id, username, first_name, started_bot_at, tags) values
  ('d1000000-0000-4000-8000-000000000001', 700000001, 'demo_alba', 'Alba', now() - interval '40 days', array['top']),
  ('d1000000-0000-4000-8000-000000000002', 700000002, 'demo_beto', 'Beto', now() - interval '10 days', '{}'),
  ('d1000000-0000-4000-8000-000000000003', 700000003, null, 'Carla', now() - interval '2 days', '{}')
on conflict (id) do nothing;

do $$
begin
  perform public.vip_register_payment('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'bizum', null, 'Seed', now() - interval '20 days');
  perform public.vip_register_payment('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'paypal', null, 'Seed', now() - interval '29 days');
  perform public.shop_register_sale('c1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 2800, 'bizum', 450, null, 'Seed', now() - interval '1 day');
end
$$;
