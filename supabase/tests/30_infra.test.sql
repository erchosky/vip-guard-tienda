-- Infraestructura: outbox, alertas, bloqueos, idempotencia, rate limit y panel.
begin;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if; end $$;

-- Outbox con deduplicación.
insert into public.message_outbox (kind, chat_id, payload, dedupe_key) values ('test', 1, '{"text":"a"}', 'k1');
insert into public.message_outbox (kind, chat_id, payload, dedupe_key) values ('test', 1, '{"text":"a"}', 'k1') on conflict (dedupe_key) do nothing;
select pg_temp.check((select count(*) from public.message_outbox where dedupe_key = 'k1') = 1, 'outbox deduplica');
do $$ begin
  insert into public.message_outbox (kind, chat_id, payload) values ('test', 1, '{"nope":"a"}');
  raise exception 'FALLO: payload sin text';
exception when check_violation then null; end $$;

create temp table c1 as select * from public.outbox_claim(10, 60, '2026-01-01 00:00+00' ::timestamptz + interval '100 years');
select pg_temp.check((select count(*) from c1 where dedupe_key = 'k1') = 1, 'claim toma el mensaje');
select pg_temp.check((select count(*) from public.outbox_claim(10, 60, now()) where dedupe_key = 'k1') = 0, 'no se toma dos veces durante el lease');
select pg_temp.check(public.outbox_complete((select id from c1 where dedupe_key = 'k1'), false, '429', 7, false, '2026-01-01 00:00+00') = 'pending', 'fallo temporal reintenta');
select pg_temp.check((select next_attempt_at from public.message_outbox where dedupe_key = 'k1') = '2026-01-01 00:00:07+00', 'respeta retry_after');
select pg_temp.check(public.outbox_complete((select id from c1 where dedupe_key = 'k1'), false, 'blocked', null, true) = 'failed', 'fallo permanente');
insert into public.message_outbox (kind, chat_id, payload, dedupe_key) values ('test', 1, '{"text":"b"}', 'k2');
select pg_temp.check(public.outbox_complete((select id from public.message_outbox where dedupe_key = 'k2'), true) = 'sent', 'enviado');

-- Alertas deduplicadas.
select public.raise_alert('test_alert', 'warning', 'Prueba');
select public.raise_alert('test_alert', 'critical', 'Prueba');
select pg_temp.check((select count(*) from public.alerts where code = 'test_alert') = 1, 'alerta deduplicada');
select pg_temp.check((select occurrences from public.alerts where code = 'test_alert') = 2, 'cuenta repeticiones');
update public.alerts set status = 'resolved', resolved_at = now() where code = 'test_alert';
select public.raise_alert('test_alert', 'warning', 'Prueba');
select pg_temp.check((select count(*) from public.alerts where code = 'test_alert') = 2, 'nueva alerta tras resolver');

-- Bloqueo de jobs.
create temp table l1 as select public.claim_job_lock('tick-test', 60) as token;
select pg_temp.check((select token from l1) is not null, 'toma el bloqueo');
select pg_temp.check(public.claim_job_lock('tick-test', 60) is null, 'no se solapa');
select pg_temp.check(public.release_job_lock('tick-test', (select token from l1), true, '{"ok":1}'), 'libera');
select pg_temp.check(public.claim_job_lock('tick-test', 60) is not null, 'se puede volver a tomar');

-- Idempotencia de Telegram.
create temp table u1 as select * from public.claim_telegram_update(424242, 60);
select pg_temp.check((select acquired from u1), 'reclama update');
select pg_temp.check((select in_progress from public.claim_telegram_update(424242, 60)), 'en curso');
select pg_temp.check(public.complete_telegram_update(424242, (select lease_token from u1)), 'completa');
select pg_temp.check((select already_processed from public.claim_telegram_update(424242, 60)), 'duplicado detectado');

-- Rate limit.
select pg_temp.check(public.check_rate_limit('rl-test', 2, 60000), '1º permitido');
select pg_temp.check(public.check_rate_limit('rl-test', 2, 60000), '2º permitido');
select pg_temp.check(not public.check_rate_limit('rl-test', 2, 60000), '3º bloqueado');

-- Listados y resúmenes del panel (usan el seed).
select pg_temp.check((select count(*) from public.admin_customers(null, 'active')) >= 1, 'filtro activos');
select pg_temp.check((select count(*) from public.admin_customers('alba')) = 1, 'búsqueda por nombre');
select pg_temp.check((select count(*) from public.admin_customers('700000002')) = 1, 'búsqueda por ID');
select pg_temp.check((select count(*) from public.admin_customers('top')) = 1, 'búsqueda por etiqueta');
select pg_temp.check((select username from public.admin_customers(null, 'all', 'spent') limit 1) = 'demo_alba', 'ranking por gasto');
select pg_temp.check((select total_count from public.admin_customers(null, 'all', 'recent', 1, 0) limit 1) >= 3, 'total para paginar');
select pg_temp.check((public.admin_overview() ->> 'activeMembers')::int >= 1, 'resumen');
select pg_temp.check((public.admin_period_report(now() - interval '60 days', now() + interval '1 day') -> 'vip' ->> 'revenueCents')::int > 0, 'informe');
select pg_temp.check(public.maintenance_cleanup() ? 'outbox', 'limpieza');
select pg_temp.check((public.scheduler_status() ->> 'available') is not null, 'estado del programador');
select pg_temp.check((public.scheduler_configure('https://x.test/api/cron/tick', 'short') ->> 'ok')::boolean is false, 'programador valida entrada');
rollback;
