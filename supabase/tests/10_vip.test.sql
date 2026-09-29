-- Ciclo de vida VIP: alta, renovación, regalos, ajustes, caducidad y expulsión.
begin;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if; end $$;

insert into public.customers (id, telegram_id, first_name) values
  ('e0000000-0000-4000-8000-000000000001', 800000001, 'Test A'),
  ('e0000000-0000-4000-8000-000000000002', 800000002, 'Test B');
insert into public.vip_plans (id, name, duration_days, price_first_cents, price_renewal_cents) values
  ('e1000000-0000-4000-8000-000000000001', 'Test 30', 30, 2500, 2000);

-- Alta: 30 días desde ahora, precio de alta por defecto.
create temp table r1 as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'bizum', null, null, '2026-01-01 10:00+00');
select pg_temp.check((select kind from r1) = 'first', 'primer pago es alta');
select pg_temp.check((select amount_cents from r1) = 2500, 'importe alta por defecto');
select pg_temp.check((select new_ends_at from r1) = '2026-01-31 10:00+00', 'alta suma 30 días desde ahora');
select pg_temp.check((select not was_active from r1), 'no estaba activo');

-- Renovación antes de caducar: suma a lo que queda, precio de renovación.
create temp table r2 as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'paypal', null, 'renueva', '2026-01-20 10:00+00');
select pg_temp.check((select kind from r2) = 'renewal', 'segundo pago es renovación');
select pg_temp.check((select amount_cents from r2) = 2000, 'importe renovación por defecto');
select pg_temp.check((select new_ends_at from r2) = '2026-03-02 10:00+00', 'renovación suma a lo que quedaba');

-- Importe personalizado.
create temp table r2b as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'bizum', 1500, 'descuento', '2026-01-01 10:00+00');
select pg_temp.check((select amount_cents from r2b) = 1500, 'importe manual respetado');

-- Método obligatorio en pagos.
do $$ begin
  perform public.vip_register_payment('e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', null);
  raise exception 'FALLO: pago sin método aceptado';
exception when check_violation then null; end $$;

-- Método inválido.
do $$ begin
  perform public.vip_register_payment('e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'bitcoin');
  raise exception 'FALLO: método inválido aceptado';
exception when check_violation then null; end $$;

-- Caducidad exacta.
create temp table exp1 as select * from public.vip_expire_due('2026-01-31 10:00+00', 100);
select pg_temp.check((select count(*) from exp1) = 1 and (select customer_id from exp1) = 'e0000000-0000-4000-8000-000000000002', 'caduca solo el vencido (B)');
select pg_temp.check((select expel from exp1), 'autoexpulsión activa por defecto');
select pg_temp.check((select status from public.subscriptions where customer_id = 'e0000000-0000-4000-8000-000000000002') = 'expired', 'B queda caducado');
select pg_temp.check((select count(*) from public.vip_expire_due('2026-01-31 10:00+00', 100)) = 0, 'expire_due es idempotente');

-- Expulsiones: reclamar, fallo con reintento, éxito.
create temp table cl1 as select * from public.vip_claim_expulsions('2026-01-31 10:00+00', 10);
select pg_temp.check((select count(*) from cl1) = 1 and (select telegram_id from cl1) = 800000002, 'reclama la expulsión de B');
select pg_temp.check((select count(*) from public.vip_claim_expulsions('2026-01-31 10:00+00', 10)) = 0, 'no se reclama dos veces');
select pg_temp.check(public.vip_expulsion_result((select subscription_id from cl1), false, 'boom', '2026-01-31 10:00+00') = 'pending', 'fallo deja pendiente');
select pg_temp.check((select next_expulsion_attempt_at from public.subscriptions where id = (select subscription_id from cl1)) = '2026-01-31 10:02+00', 'reintento exponencial (2 min)');
select pg_temp.check(public.vip_expulsion_result((select subscription_id from cl1), true, null, '2026-01-31 10:05+00') = 'done', 'éxito marca done');
select pg_temp.check((select expelled_at from public.subscriptions where id = (select subscription_id from cl1)) = '2026-01-31 10:05+00', 'guarda hora de expulsión');

-- Tras 6 fallos queda en failed.
update public.subscriptions set expulsion_status = 'pending', expulsion_attempts = 5 where id = (select subscription_id from cl1);
select pg_temp.check(public.vip_expulsion_result((select subscription_id from cl1), false, 'boom') = 'failed', '6º fallo marca failed');

-- Renovar tras caducar: cuenta desde ahora y limpia la expulsión.
create temp table r3 as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'bizum', null, null, '2026-02-10 12:00+00');
select pg_temp.check((select new_ends_at from r3) = '2026-03-12 12:00+00', 'renovación tras caducar cuenta desde ahora');
select pg_temp.check((select expulsion_status from public.subscriptions where customer_id = 'e0000000-0000-4000-8000-000000000002') = 'none', 'expulsión reiniciada');

-- Regalo de días.
create temp table g1 as select * from public.vip_adjust('e0000000-0000-4000-8000-000000000001', 7, null, 'regalo', '2026-02-01 00:00+00');
select pg_temp.check((select kind from g1) = 'gift' and (select new_ends_at from g1) = '2026-03-09 10:00+00', 'regalo suma 7 días');

-- Quitar días.
create temp table g2 as select * from public.vip_adjust('e0000000-0000-4000-8000-000000000001', -2, null, null, '2026-02-01 00:00+00');
select pg_temp.check((select kind from g2) = 'adjustment' and (select new_ends_at from g2) = '2026-03-07 10:00+00', 'quitar 2 días');

-- Fecha exacta en el pasado: caduca y queda pendiente de expulsión.
create temp table g3 as select * from public.vip_adjust('e0000000-0000-4000-8000-000000000001', null, '2026-01-15 00:00+00', 'fin', '2026-02-01 00:00+00');
select pg_temp.check((select not is_active from g3), 'fecha pasada desactiva');
select pg_temp.check((select expulsion_status from public.subscriptions where customer_id = 'e0000000-0000-4000-8000-000000000001') = 'pending', 'queda pendiente de expulsión');

-- Parámetros inválidos.
do $$ begin
  perform public.vip_adjust('e0000000-0000-4000-8000-000000000001', 5, now());
  raise exception 'FALLO: días y fecha a la vez';
exception when invalid_parameter_value then null; end $$;

-- Echar ahora.
create temp table rv as select * from public.vip_revoke('e0000000-0000-4000-8000-000000000002', null, '2026-02-11 00:00+00');
select pg_temp.check((select status from public.subscriptions where customer_id = 'e0000000-0000-4000-8000-000000000002') = 'expired', 'revoke caduca');
select pg_temp.check((select expulsion_status from public.subscriptions where customer_id = 'e0000000-0000-4000-8000-000000000002') = 'pending', 'revoke deja expulsión pendiente');

-- Con autoexpulsión desactivada, la caducidad no expulsa.
update public.vip_channel set auto_expel = false where id = 1;
create temp table r4 as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'bizum', null, null, '2026-02-12 00:00+00');
select pg_temp.check((select not expel from public.vip_expire_due('2026-04-01 00:00+00', 100) where customer_id = 'e0000000-0000-4000-8000-000000000002'), 'sin autoexpulsión no expulsa');
update public.vip_channel set auto_expel = true where id = 1;

-- Anular pago: no se borra y sale del total.
select pg_temp.check(public.vip_void_payment((select payment_id from r2), 'error'), 'anula pago');
select pg_temp.check(not public.vip_void_payment((select payment_id from r2), 'error'), 'no se anula dos veces');
select pg_temp.check((select vip_paid_cents from public.customer_stats where customer_id = 'e0000000-0000-4000-8000-000000000001') = 2500, 'total excluye anulados');

-- El historial no se borra en cascada.
do $$ begin
  delete from public.customers where id = 'e0000000-0000-4000-8000-000000000001';
  raise exception 'FALLO: se pudo borrar un cliente con pagos';
exception when foreign_key_violation then null; end $$;
-- Avisos: solo el más cercano, una vez, y no si la compra fue dentro de la ventana.
insert into public.customers (id, telegram_id) values ('e0000000-0000-4000-8000-000000000003', 800000003);
create temp table r5 as select * from public.vip_register_payment(
  'e0000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'bizum', null, null, '2026-05-01 00:00+00');
select pg_temp.check((select count(*) from public.vip_due_reminders(array[24, 72], '2026-05-20 00:00+00')) = 0, 'sin avisos lejos del fin');
create temp table d1 as select * from public.vip_due_reminders(array[24, 72], '2026-05-29 12:00+00') where customer_id = 'e0000000-0000-4000-8000-000000000003';
select pg_temp.check((select hours from d1) = 72, 'aviso de 72h');
create temp table d2 as select * from public.vip_due_reminders(array[24, 72], '2026-05-30 12:00+00') where customer_id = 'e0000000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) from d2) = 1 and (select hours from d2) = 24, 'solo el aviso más cercano');
insert into public.message_outbox (kind, chat_id, payload, dedupe_key) select 'reminder', 800000003, '{"text":"x"}', dedupe_key from d2;
select pg_temp.check((select count(*) from public.vip_due_reminders(array[24], '2026-05-30 13:00+00') where customer_id = 'e0000000-0000-4000-8000-000000000003') = 0, 'no se repite');
create temp table r6 as select * from public.vip_adjust('e0000000-0000-4000-8000-000000000003', null, '2026-06-01 00:00+00', 'corta', '2026-05-31 12:00+00');
select pg_temp.check((select count(*) from public.vip_due_reminders(array[24], '2026-05-31 12:01+00') where customer_id = 'e0000000-0000-4000-8000-000000000003') = 0, 'sin aviso si se amplió dentro de la ventana');
rollback;
