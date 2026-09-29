-- Seguridad: RLS en todas las tablas, nada para anon/authenticated.
begin;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FALLO: %', msg; end if; end $$;

select pg_temp.check(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  'todas las tablas public tienen RLS'
);

select pg_temp.check(
  not exists (select 1 from pg_policies where schemaname = 'public'),
  'no hay políticas: nadie salvo service_role puede leer'
);

select pg_temp.check(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'anon/authenticated sin permisos de tabla'
);

select pg_temp.check(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  ),
  'anon/authenticated no pueden ejecutar funciones'
);

select pg_temp.check(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  ),
  'todas las funciones fijan search_path'
);

select pg_temp.check(has_table_privilege('service_role', 'public.customers', 'select,insert,update'), 'service_role puede operar');
select pg_temp.check(has_function_privilege('service_role', 'public.vip_register_payment(uuid, uuid, text, integer, text, timestamptz)', 'execute'), 'service_role ejecuta RPC');

set local role anon;
do $$
begin
  perform 1 from public.customers limit 1;
  raise exception 'FALLO: anon pudo leer customers';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
