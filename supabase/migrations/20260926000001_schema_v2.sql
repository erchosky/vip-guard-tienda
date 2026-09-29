-- =============================================================================
-- VIP Guard + Tienda — esquema v2 consolidado.
--
-- Modelo de seguridad: todas las tablas tienen RLS activado, sin políticas, y
-- se revoca todo a anon/authenticated. Solo el servidor (service_role) accede.
-- El dinero se guarda siempre en céntimos (integer). Las fechas en timestamptz.
-- El historial (pagos, ventas, intereses) nunca se borra en cascada.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- pg_cron y pg_net solo existen en Supabase. En Postgres local se omiten.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
exception when others then
  raise notice 'pg_cron/pg_net no disponibles: %', sqlerrm;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clientes (cualquier persona que haya abierto el bot o la tienda)
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  language_code text,
  started_bot_at timestamptz,
  bot_blocked_at timestamptz,
  is_banned boolean not null default false,
  notes text,
  tags text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (
    lower(coalesce(username, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) stored,
  constraint customers_notes_length check (notes is null or length(notes) <= 4000),
  constraint customers_tags_count check (cardinality(tags) <= 20)
);

create index customers_search_trgm_idx on public.customers using gin (search_text extensions.gin_trgm_ops);
create index customers_created_idx on public.customers (created_at desc);
create index customers_tags_idx on public.customers using gin (tags);

-- -----------------------------------------------------------------------------
-- Canal VIP (fila única)
-- -----------------------------------------------------------------------------
create table public.vip_channel (
  id smallint primary key default 1,
  telegram_chat_id bigint unique,
  title text,
  invite_link text,
  auto_expel boolean not null default true,
  reminders_enabled boolean not null default true,
  last_check jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint vip_channel_singleton check (id = 1),
  constraint vip_channel_chat_id_negative check (telegram_chat_id is null or telegram_chat_id < 0)
);

insert into public.vip_channel (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Planes VIP
-- -----------------------------------------------------------------------------
create table public.vip_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_days integer not null,
  price_first_cents integer not null,
  price_renewal_cents integer not null,
  status text not null default 'active',
  is_featured boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_plans_name_length check (length(trim(name)) between 1 and 80),
  constraint vip_plans_duration check (duration_days between 1 and 3650),
  constraint vip_plans_prices check (price_first_cents >= 0 and price_renewal_cents >= 0),
  constraint vip_plans_status check (status in ('active', 'hidden', 'archived'))
);

create index vip_plans_public_idx on public.vip_plans (status, sort_order);

-- -----------------------------------------------------------------------------
-- Suscripciones: una por cliente. Las renovaciones amplían la misma fila y el
-- historial completo vive en vip_payments.
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers (id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  last_extended_at timestamptz not null default now(),
  ends_at timestamptz not null,
  last_plan_id uuid references public.vip_plans (id) on delete set null,
  expired_at timestamptz,
  expulsion_status text not null default 'none',
  expulsion_attempts integer not null default 0,
  next_expulsion_attempt_at timestamptz,
  last_expulsion_error text,
  expelled_at timestamptz,
  joined_channel_at timestamptz,
  left_channel_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status check (status in ('active', 'expired')),
  constraint subscriptions_expulsion_status check (expulsion_status in ('none', 'pending', 'done', 'failed')),
  constraint subscriptions_attempts check (expulsion_attempts between 0 and 100)
);

create index subscriptions_active_ends_idx on public.subscriptions (ends_at) where status = 'active';
create index subscriptions_expulsion_due_idx on public.subscriptions (next_expulsion_attempt_at)
  where expulsion_status = 'pending';

-- -----------------------------------------------------------------------------
-- Libro de movimientos VIP: pagos, regalos de días y ajustes de fecha.
-- -----------------------------------------------------------------------------
create table public.vip_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  plan_id uuid references public.vip_plans (id) on delete set null,
  plan_name text,
  kind text not null,
  amount_cents integer not null default 0,
  method text,
  days_added integer not null default 0,
  previous_ends_at timestamptz,
  new_ends_at timestamptz not null,
  note text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint vip_payments_kind check (kind in ('first', 'renewal', 'gift', 'adjustment')),
  constraint vip_payments_amount check (amount_cents >= 0),
  constraint vip_payments_method check (method is null or method in ('bizum', 'paypal', 'efectivo', 'transferencia', 'otro')),
  constraint vip_payments_paid_has_method check (kind not in ('first', 'renewal') or method is not null),
  constraint vip_payments_note_length check (note is null or length(note) <= 1000)
);

create index vip_payments_customer_idx on public.vip_payments (customer_id, created_at desc);
create index vip_payments_created_idx on public.vip_payments (created_at desc) where voided_at is null;

-- -----------------------------------------------------------------------------
-- Tienda
-- -----------------------------------------------------------------------------
create table public.shop_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_path text,
  image_url text,
  status text not null default 'visible',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_categories_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  constraint shop_categories_name check (length(trim(name)) between 1 and 60),
  constraint shop_categories_status check (status in ('visible', 'hidden', 'archived'))
);

create index shop_categories_public_idx on public.shop_categories (status, sort_order);

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.shop_categories (id) on delete set null,
  title text not null,
  description text,
  size text,
  color text,
  price_cents integer not null,
  offer_price_cents integer,
  offer_starts_at timestamptz,
  offer_ends_at timestamptz,
  vip_price_cents integer,
  is_unique boolean not null default true,
  fulfillment text not null default 'physical',
  status text not null default 'draft',
  is_featured boolean not null default false,
  sort_order integer not null default 100,
  reserved_at timestamptz,
  sold_at timestamptz,
  sold_visible_until timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_products_title check (length(trim(title)) between 1 and 120),
  constraint shop_products_price check (price_cents >= 0),
  constraint shop_products_offer_price check (offer_price_cents is null or (offer_price_cents >= 0 and offer_price_cents < price_cents)),
  constraint shop_products_offer_dates check (offer_starts_at is null or offer_ends_at is null or offer_ends_at > offer_starts_at),
  constraint shop_products_offer_complete check (offer_price_cents is not null or (offer_starts_at is null and offer_ends_at is null)),
  constraint shop_products_vip_price check (vip_price_cents is null or (vip_price_cents >= 0 and vip_price_cents <= price_cents)),
  constraint shop_products_fulfillment check (fulfillment in ('physical', 'digital')),
  constraint shop_products_status check (status in ('draft', 'available', 'reserved', 'sold', 'hidden', 'archived')),
  constraint shop_products_sold_dates check ((status = 'sold') = (sold_at is not null))
);

create index shop_products_public_idx on public.shop_products (is_featured desc, sort_order, created_at desc)
  where status in ('available', 'reserved', 'sold');
create index shop_products_category_idx on public.shop_products (category_id);
create index shop_products_admin_idx on public.shop_products (status, updated_at desc);
create index shop_products_title_trgm_idx on public.shop_products using gin (lower(title) extensions.gin_trgm_ops);

create table public.shop_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  width integer,
  height integer,
  is_primary boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint shop_product_images_path check (storage_path ~ '^shop/(products|categories|brand)/[a-f0-9-]+\.(jpg|png|webp)$'),
  constraint shop_product_images_url check (public_url ~* '^https?://'),
  constraint shop_product_images_dims check ((width is null and height is null) or (width between 32 and 4096 and height between 32 and 4096))
);

create index shop_product_images_product_idx on public.shop_product_images (product_id, is_primary desc, sort_order);
create unique index shop_product_images_one_primary_idx on public.shop_product_images (product_id) where is_primary;

create table public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.shop_products (id) on delete set null,
  product_title text not null,
  customer_id uuid references public.customers (id) on delete restrict,
  buyer_label text,
  amount_cents integer not null,
  shipping_cents integer not null default 0,
  method text not null,
  note text,
  sold_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint shop_sales_amounts check (amount_cents >= 0 and shipping_cents >= 0),
  constraint shop_sales_method check (method in ('bizum', 'paypal', 'efectivo', 'transferencia', 'otro')),
  constraint shop_sales_buyer check (customer_id is not null or length(trim(coalesce(buyer_label, ''))) > 0),
  constraint shop_sales_note_length check (note is null or length(note) <= 1000)
);

create index shop_sales_customer_idx on public.shop_sales (customer_id, sold_at desc);
create index shop_sales_sold_idx on public.shop_sales (sold_at desc) where voided_at is null;
create index shop_sales_product_idx on public.shop_sales (product_id);

create table public.shop_interests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.shop_products (id) on delete set null,
  product_title text not null,
  price_shown_cents integer,
  was_vip boolean not null default false,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status text not null default 'new',
  admin_note text,
  clicks integer not null default 1,
  last_clicked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_interests_status check (status in ('new', 'contacted', 'sold', 'discarded')),
  constraint shop_interests_note_length check (admin_note is null or length(admin_note) <= 1000)
);

create unique index shop_interests_one_open_idx on public.shop_interests (product_id, customer_id)
  where status in ('new', 'contacted');
create index shop_interests_queue_idx on public.shop_interests (status, last_clicked_at desc);
create index shop_interests_customer_idx on public.shop_interests (customer_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Textos editables, ajustes y difusiones
-- Los textos por defecto viven en el código; aquí solo se guardan los cambios.
-- -----------------------------------------------------------------------------
create table public.text_overrides (
  key text primary key,
  body text not null,
  updated_at timestamptz not null default now(),
  constraint text_overrides_key check (key ~ '^[a-z][a-z0-9_.]{1,80}$'),
  constraint text_overrides_body check (length(body) between 1 and 4000)
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint settings_key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint settings_value_object check (jsonb_typeof(value) = 'object')
);

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  segment text not null,
  recipients integer not null default 0,
  created_at timestamptz not null default now(),
  constraint broadcasts_segment check (segment in ('all', 'vip', 'ex_vip', 'buyers', 'no_vip')),
  constraint broadcasts_body check (length(body) between 1 and 4000)
);

-- -----------------------------------------------------------------------------
-- Cola de mensajes del bot (outbox)
-- -----------------------------------------------------------------------------
create table public.message_outbox (
  id bigint generated always as identity primary key,
  kind text not null,
  chat_id bigint not null,
  customer_id uuid references public.customers (id) on delete set null,
  payload jsonb not null,
  dedupe_key text unique,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_outbox_status check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  constraint message_outbox_payload check (jsonb_typeof(payload) = 'object' and payload ? 'text')
);

create index message_outbox_due_idx on public.message_outbox (next_attempt_at, id)
  where status in ('pending', 'sending');
create index message_outbox_customer_idx on public.message_outbox (customer_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Alertas e historial
-- -----------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  severity text not null default 'warning',
  title text not null,
  detail text,
  customer_id uuid references public.customers (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  occurrences integer not null default 1,
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alerts_severity check (severity in ('info', 'warning', 'critical')),
  constraint alerts_status check (status in ('open', 'resolved'))
);

create unique index alerts_one_open_idx on public.alerts (code, coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';
create index alerts_status_idx on public.alerts (status, last_seen_at desc);

create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  level text not null default 'info',
  customer_id uuid references public.customers (id) on delete set null,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  constraint activity_log_actor check (actor in ('admin', 'bot', 'sistema', 'cliente')),
  constraint activity_log_level check (level in ('info', 'warning', 'error'))
);

create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_customer_idx on public.activity_log (customer_id, at desc);
create index activity_log_problems_idx on public.activity_log (at desc) where level <> 'info';

-- -----------------------------------------------------------------------------
-- Infraestructura: sesiones admin, rate limit, idempotencia, bloqueos de jobs
-- -----------------------------------------------------------------------------
create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text
);

create index admin_sessions_expires_idx on public.admin_sessions (expires_at);

create table public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

create index rate_limit_buckets_reset_idx on public.rate_limit_buckets (reset_at);

create table public.telegram_updates (
  update_id bigint primary key,
  processed_at timestamptz,
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  constraint telegram_updates_state check (
    (processed_at is not null and lease_expires_at is null)
    or (processed_at is null and claim_token is not null and lease_expires_at is not null)
  )
);

create index telegram_updates_created_idx on public.telegram_updates (created_at);

create table public.job_locks (
  job_name text primary key,
  lock_token uuid,
  lock_expires_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'vip_channel', 'vip_plans', 'subscriptions', 'shop_categories',
    'shop_products', 'shop_interests', 'text_overrides', 'settings', 'job_locks'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Estadísticas por cliente (CRM)
-- -----------------------------------------------------------------------------
create view public.customer_stats
with (security_invoker = true)
as
select
  c.id as customer_id,
  coalesce(vp.vip_paid_cents, 0) as vip_paid_cents,
  coalesce(vp.vip_payments_count, 0) as vip_payments_count,
  coalesce(ss.shop_spent_cents, 0) as shop_spent_cents,
  coalesce(ss.purchases_count, 0) as purchases_count,
  ss.last_purchase_at,
  coalesce(vp.vip_paid_cents, 0) + coalesce(ss.shop_spent_cents, 0) as total_spent_cents
from public.customers c
left join lateral (
  select sum(p.amount_cents)::bigint as vip_paid_cents, count(*) filter (where p.kind in ('first', 'renewal'))::int as vip_payments_count
  from public.vip_payments p
  where p.customer_id = c.id and p.voided_at is null
) vp on true
left join lateral (
  select sum(s.amount_cents)::bigint as shop_spent_cents, count(*)::int as purchases_count, max(s.sold_at) as last_purchase_at
  from public.shop_sales s
  where s.customer_id = c.id and s.voided_at is null
) ss on true;

-- =============================================================================
-- Funciones de dominio (atómicas)
-- =============================================================================

-- Resultado común de cualquier cambio en una suscripción.
create type public.vip_change as (
  payment_id uuid,
  kind text,
  previous_ends_at timestamptz,
  new_ends_at timestamptz,
  was_active boolean,
  is_active boolean,
  days_added integer,
  amount_cents integer
);

-- Registra un pago de un plan: suma los días a lo que le quede (o desde ahora
-- si estaba caducado), guarda el movimiento y reactiva la suscripción.
create or replace function public.vip_register_payment(
  p_customer_id uuid,
  p_plan_id uuid,
  p_method text,
  p_amount_cents integer default null,
  p_note text default null,
  p_now timestamptz default now()
)
returns public.vip_change
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.vip_plans;
  v_sub public.subscriptions;
  v_kind text;
  v_was_active boolean;
  v_base timestamptz;
  v_new_end timestamptz;
  v_amount integer;
  v_payment_id uuid;
begin
  select * into v_plan from public.vip_plans where id = p_plan_id and status <> 'archived';
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  select * into v_sub from public.subscriptions where customer_id = p_customer_id for update;
  v_was_active := found and v_sub.status = 'active' and v_sub.ends_at > p_now;
  v_kind := case when exists (
    select 1 from public.vip_payments
    where customer_id = p_customer_id and kind in ('first', 'renewal') and voided_at is null
  ) then 'renewal' else 'first' end;
  v_base := case when v_was_active then v_sub.ends_at else p_now end;
  v_new_end := v_base + make_interval(days => v_plan.duration_days);
  v_amount := coalesce(p_amount_cents, case when v_kind = 'first' then v_plan.price_first_cents else v_plan.price_renewal_cents end);

  if v_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  insert into public.subscriptions as s (customer_id, status, started_at, last_extended_at, ends_at, last_plan_id)
  values (p_customer_id, 'active', p_now, p_now, v_new_end, v_plan.id)
  on conflict (customer_id) do update set
    status = 'active',
    last_extended_at = p_now,
    ends_at = v_new_end,
    last_plan_id = v_plan.id,
    expired_at = null,
    expulsion_status = 'none',
    expulsion_attempts = 0,
    next_expulsion_attempt_at = null,
    last_expulsion_error = null;

  insert into public.vip_payments (customer_id, plan_id, plan_name, kind, amount_cents, method, days_added, previous_ends_at, new_ends_at, note, created_at)
  values (p_customer_id, v_plan.id, v_plan.name, v_kind, v_amount, p_method, v_plan.duration_days, v_sub.ends_at, v_new_end, nullif(trim(p_note), ''), p_now)
  returning id into v_payment_id;

  return (v_payment_id, v_kind, v_sub.ends_at, v_new_end, v_was_active, true, v_plan.duration_days, v_amount)::public.vip_change;
end;
$$;

-- Regala o quita días, o fija una fecha exacta de fin. Si la nueva fecha ya
-- ha pasado, la suscripción queda caducada y pendiente de expulsión.
create or replace function public.vip_adjust(
  p_customer_id uuid,
  p_days integer default null,
  p_ends_at timestamptz default null,
  p_note text default null,
  p_now timestamptz default now()
)
returns public.vip_change
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions;
  v_has_sub boolean;
  v_was_active boolean;
  v_new_end timestamptz;
  v_is_active boolean;
  v_kind text;
  v_days integer;
  v_payment_id uuid;
  v_auto_expel boolean;
begin
  if (p_days is null) = (p_ends_at is null) then
    raise exception 'use_days_or_date' using errcode = '22023';
  end if;
  if p_days is not null and (p_days = 0 or abs(p_days) > 3650) then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  select * into v_sub from public.subscriptions where customer_id = p_customer_id for update;
  v_has_sub := found;
  v_was_active := v_has_sub and v_sub.status = 'active' and v_sub.ends_at > p_now;

  if p_days is not null then
    if not v_has_sub and p_days < 0 then
      raise exception 'no_subscription' using errcode = 'P0002';
    end if;
    v_new_end := (case when v_was_active then v_sub.ends_at when p_days > 0 then p_now else coalesce(v_sub.ends_at, p_now) end)
      + make_interval(days => p_days);
    v_kind := case when p_days > 0 then 'gift' else 'adjustment' end;
  else
    v_new_end := p_ends_at;
    v_kind := 'adjustment';
  end if;

  v_is_active := v_new_end > p_now;
  v_days := round(extract(epoch from (v_new_end - coalesce(case when v_was_active then v_sub.ends_at end, p_now))) / 86400)::integer;
  select auto_expel into v_auto_expel from public.vip_channel where id = 1;

  insert into public.subscriptions as s (customer_id, status, started_at, last_extended_at, ends_at, expired_at, expulsion_status, next_expulsion_attempt_at)
  values (
    p_customer_id,
    case when v_is_active then 'active' else 'expired' end,
    p_now, p_now, v_new_end,
    case when v_is_active then null else p_now end,
    'none', null
  )
  on conflict (customer_id) do update set
    status = case when v_is_active then 'active' else 'expired' end,
    last_extended_at = p_now,
    ends_at = v_new_end,
    expired_at = case when v_is_active then null else coalesce(s.expired_at, p_now) end,
    expulsion_status = case
      when v_is_active then 'none'
      when v_was_active and coalesce(v_auto_expel, true) then 'pending'
      else s.expulsion_status
    end,
    expulsion_attempts = case when v_is_active then 0 else s.expulsion_attempts end,
    next_expulsion_attempt_at = case
      when v_is_active then null
      when v_was_active and coalesce(v_auto_expel, true) then p_now
      else s.next_expulsion_attempt_at
    end,
    last_expulsion_error = case when v_is_active then null else s.last_expulsion_error end;

  insert into public.vip_payments (customer_id, kind, amount_cents, days_added, previous_ends_at, new_ends_at, note, created_at)
  values (p_customer_id, v_kind, 0, v_days, v_sub.ends_at, v_new_end, nullif(trim(p_note), ''), p_now)
  returning id into v_payment_id;

  return (v_payment_id, v_kind, v_sub.ends_at, v_new_end, v_was_active, v_is_active, v_days, 0)::public.vip_change;
end;
$$;

-- Echar ahora: corta el acceso y deja la expulsión pendiente para el bot,
-- aunque la autoexpulsión esté desactivada (es una orden manual).
create or replace function public.vip_revoke(
  p_customer_id uuid,
  p_note text default null,
  p_now timestamptz default now()
)
returns public.vip_change
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions;
  v_payment_id uuid;
  v_was_active boolean;
  v_days integer;
begin
  select * into v_sub from public.subscriptions where customer_id = p_customer_id for update;
  if not found then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;
  v_was_active := v_sub.status = 'active' and v_sub.ends_at > p_now;
  v_days := case when v_was_active then -ceil(extract(epoch from (v_sub.ends_at - p_now)) / 86400)::integer else 0 end;

  update public.subscriptions set
    status = 'expired',
    ends_at = least(ends_at, p_now),
    expired_at = coalesce(expired_at, p_now),
    expulsion_status = 'pending',
    expulsion_attempts = 0,
    next_expulsion_attempt_at = p_now,
    last_expulsion_error = null
  where id = v_sub.id;

  insert into public.vip_payments (customer_id, kind, amount_cents, days_added, previous_ends_at, new_ends_at, note, created_at)
  values (p_customer_id, 'adjustment', 0, v_days, v_sub.ends_at, least(v_sub.ends_at, p_now), coalesce(nullif(trim(p_note), ''), 'Expulsión manual'), p_now)
  returning id into v_payment_id;

  return (v_payment_id, 'adjustment', v_sub.ends_at, least(v_sub.ends_at, p_now), v_was_active, false, v_days, 0)::public.vip_change;
end;
$$;

-- Anula un pago registrado por error (no se borra: queda anulado).
-- No toca la fecha: si hay que quitar días se hace con un ajuste.
create or replace function public.vip_void_payment(p_payment_id uuid, p_reason text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with voided as (
    update public.vip_payments
    set voided_at = now(), void_reason = nullif(trim(p_reason), '')
    where id = p_payment_id and voided_at is null and kind in ('first', 'renewal')
    returning 1
  )
  select exists (select 1 from voided);
$$;

-- Marca como caducadas las suscripciones vencidas. Devuelve las afectadas.
create or replace function public.vip_expire_due(p_now timestamptz default now(), p_limit integer default 100)
returns table (subscription_id uuid, customer_id uuid, telegram_id bigint, ends_at timestamptz, expel boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_auto_expel boolean;
begin
  select coalesce(auto_expel, true) into v_auto_expel from public.vip_channel where id = 1;
  return query
  with due as (
    select s.id
    from public.subscriptions s
    where s.status = 'active' and s.ends_at <= p_now
    order by s.ends_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ),
  updated as (
    update public.subscriptions s set
      status = 'expired',
      expired_at = p_now,
      expulsion_status = case when coalesce(v_auto_expel, true) then 'pending' else 'none' end,
      expulsion_attempts = 0,
      next_expulsion_attempt_at = case when coalesce(v_auto_expel, true) then p_now else null end
    from due
    where s.id = due.id
    returning s.id, s.customer_id, s.ends_at, s.expulsion_status = 'pending' as expel
  )
  select u.id, u.customer_id, c.telegram_id, u.ends_at, u.expel
  from updated u
  join public.customers c on c.id = u.customer_id;
end;
$$;

-- Reclama expulsiones pendientes (con bloqueo) para que solo un worker las haga.
create or replace function public.vip_claim_expulsions(p_now timestamptz default now(), p_limit integer default 50)
returns table (subscription_id uuid, customer_id uuid, telegram_id bigint, attempts integer)
language sql
security definer
set search_path = public
as $$
  with due as (
    select s.id
    from public.subscriptions s
    where s.expulsion_status = 'pending' and s.next_expulsion_attempt_at <= p_now
    order by s.next_expulsion_attempt_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ),
  claimed as (
    update public.subscriptions s
    set next_expulsion_attempt_at = p_now + interval '2 minutes'
    from due
    where s.id = due.id
    returning s.id, s.customer_id, s.expulsion_attempts
  )
  select cl.id, cl.customer_id, c.telegram_id, cl.expulsion_attempts
  from claimed cl
  join public.customers c on c.id = cl.customer_id;
$$;

-- Guarda el resultado de un intento de expulsión con reintentos exponenciales.
create or replace function public.vip_expulsion_result(
  p_subscription_id uuid,
  p_ok boolean,
  p_error text default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.subscriptions set
    expulsion_status = case
      when status = 'active' then 'none'
      when p_ok then 'done'
      when expulsion_attempts + 1 >= 6 then 'failed'
      else 'pending'
    end,
    expulsion_attempts = case when p_ok then expulsion_attempts else expulsion_attempts + 1 end,
    expelled_at = case when p_ok then p_now else expelled_at end,
    last_expulsion_error = case when p_ok then null else left(p_error, 500) end,
    next_expulsion_attempt_at = case
      when p_ok or status = 'active' then null
      else p_now + make_interval(mins => least(power(2, expulsion_attempts + 1)::integer, 60))
    end,
    left_channel_at = case when p_ok then p_now else left_channel_at end
  where id = p_subscription_id
  returning expulsion_status into v_status;
  return v_status;
end;
$$;

-- Avisos de caducidad pendientes. Para cada suscripción devuelve solo el aviso
-- más cercano que toque y que no se haya encolado ya (dedupe en el outbox).
create or replace function public.vip_due_reminders(p_hours integer[], p_now timestamptz default now(), p_limit integer default 200)
returns table (subscription_id uuid, customer_id uuid, telegram_id bigint, first_name text, ends_at timestamptz, hours integer, dedupe_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (s.id)
    s.id, s.customer_id, c.telegram_id, c.first_name, s.ends_at, h.hours,
    'reminder:' || s.id || ':' || floor(extract(epoch from s.ends_at))::bigint || ':' || h.hours
  from public.subscriptions s
  join public.customers c on c.id = s.customer_id
  cross join lateral unnest(coalesce(p_hours, '{}')) as h(hours)
  where s.status = 'active'
    and h.hours between 1 and 720
    and s.ends_at > p_now
    and s.ends_at <= p_now + make_interval(hours => h.hours)
    and s.last_extended_at <= s.ends_at - make_interval(hours => h.hours)
    and c.bot_blocked_at is null
    and not exists (
      select 1 from public.message_outbox m
      where m.dedupe_key = 'reminder:' || s.id || ':' || floor(extract(epoch from s.ends_at))::bigint || ':' || h.hours
    )
  order by s.id, h.hours asc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

-- Registra una venta. Si el producto es pieza única pasa a vendido y se cierra
-- el interés abierto de ese cliente.
create or replace function public.shop_register_sale(
  p_product_id uuid,
  p_customer_id uuid,
  p_amount_cents integer,
  p_method text,
  p_shipping_cents integer default 0,
  p_buyer_label text default null,
  p_note text default null,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.shop_products;
  v_sale_id uuid;
  v_visible_days integer;
begin
  select * into v_product from public.shop_products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if v_product.is_unique and v_product.status = 'sold' then
    raise exception 'product_already_sold' using errcode = 'P0001';
  end if;

  insert into public.shop_sales (product_id, product_title, customer_id, buyer_label, amount_cents, shipping_cents, method, note, sold_at)
  values (p_product_id, v_product.title, p_customer_id, nullif(trim(p_buyer_label), ''), p_amount_cents, coalesce(p_shipping_cents, 0), p_method, nullif(trim(p_note), ''), p_now)
  returning id into v_sale_id;

  if v_product.is_unique then
    select greatest(0, least(coalesce((value ->> 'soldVisibleDays')::integer, 3), 60))
      into v_visible_days from public.settings where key = 'shop';
    update public.shop_products set
      status = 'sold',
      sold_at = p_now,
      reserved_at = null,
      sold_visible_until = p_now + make_interval(days => coalesce(v_visible_days, 3))
    where id = p_product_id;
  end if;

  if p_customer_id is not null then
    update public.shop_interests set status = 'sold'
    where product_id = p_product_id and customer_id = p_customer_id and status in ('new', 'contacted');
  end if;

  return v_sale_id;
end;
$$;

-- Anula una venta. Si dejó el producto vendido y no hay otra venta válida,
-- el producto vuelve a estar disponible.
create or replace function public.shop_void_sale(p_sale_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.shop_sales;
begin
  update public.shop_sales set voided_at = now(), void_reason = nullif(trim(p_reason), '')
  where id = p_sale_id and voided_at is null
  returning * into v_sale;
  if not found then
    return false;
  end if;
  if v_sale.product_id is not null and not exists (
    select 1 from public.shop_sales where product_id = v_sale.product_id and voided_at is null
  ) then
    update public.shop_products
    set status = 'available', sold_at = null, sold_visible_until = null
    where id = v_sale.product_id and status = 'sold';
  end if;
  return true;
end;
$$;

-- Registra un clic en "Me interesa". Un solo interés abierto por cliente y
-- producto: los clics repetidos solo actualizan el contador.
create or replace function public.shop_register_interest(
  p_product_id uuid,
  p_customer_id uuid,
  p_price_shown_cents integer,
  p_was_vip boolean,
  p_now timestamptz default now()
)
returns table (interest_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.shop_products;
  v_id uuid;
begin
  select p.* into v_product
  from public.shop_products p
  left join public.shop_categories c on c.id = p.category_id
  where p.id = p_product_id
    and p.status in ('available', 'reserved')
    and (p.category_id is null or c.status = 'visible');
  if not found then
    raise exception 'product_not_available' using errcode = 'P0002';
  end if;

  insert into public.shop_interests (product_id, product_title, price_shown_cents, was_vip, customer_id, last_clicked_at, created_at)
  values (p_product_id, v_product.title, p_price_shown_cents, coalesce(p_was_vip, false), p_customer_id, p_now, p_now)
  on conflict (product_id, customer_id) where status in ('new', 'contacted') do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  update public.shop_interests set
    clicks = clicks + 1,
    last_clicked_at = p_now,
    price_shown_cents = p_price_shown_cents,
    was_vip = coalesce(p_was_vip, false)
  where product_id = p_product_id and customer_id = p_customer_id and status in ('new', 'contacted')
  returning id into v_id;

  return query select v_id, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Outbox
-- -----------------------------------------------------------------------------
create or replace function public.outbox_claim(p_limit integer default 25, p_lease_seconds integer default 60, p_now timestamptz default now())
returns setof public.message_outbox
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.message_outbox
    where status in ('pending', 'sending') and next_attempt_at <= p_now
    order by next_attempt_at, id
    limit greatest(1, least(coalesce(p_limit, 25), 200))
    for update skip locked
  )
  update public.message_outbox m set
    status = 'sending',
    attempts = m.attempts + 1,
    next_attempt_at = p_now + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 60), 600)))
  from due
  where m.id = due.id
  returning m.*;
$$;

create or replace function public.outbox_complete(
  p_id bigint,
  p_ok boolean,
  p_error text default null,
  p_retry_after_seconds integer default null,
  p_permanent boolean default false,
  p_now timestamptz default now()
)
returns text
language sql
security definer
set search_path = public
as $$
  update public.message_outbox set
    status = case
      when p_ok then 'sent'
      when p_permanent or attempts >= 8 then 'failed'
      else 'pending'
    end,
    sent_at = case when p_ok then p_now else sent_at end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = case
      when p_ok or p_permanent or attempts >= 8 then next_attempt_at
      else p_now + make_interval(secs => coalesce(p_retry_after_seconds, least(30 * power(2, attempts - 1)::integer, 3600)))
    end
  where id = p_id
  returning status;
$$;

-- -----------------------------------------------------------------------------
-- Alertas deduplicadas
-- -----------------------------------------------------------------------------
create or replace function public.raise_alert(
  p_code text,
  p_severity text,
  p_title text,
  p_detail text default null,
  p_customer_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.alerts set
    occurrences = occurrences + 1,
    last_seen_at = now(),
    detail = coalesce(p_detail, detail),
    data = coalesce(p_data, data),
    severity = p_severity
  where code = p_code
    and coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_customer_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and status = 'open'
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.alerts (code, severity, title, detail, customer_id, data)
  values (p_code, p_severity, p_title, p_detail, p_customer_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  return public.raise_alert(p_code, p_severity, p_title, p_detail, p_customer_id, p_data);
end;
$$;

-- -----------------------------------------------------------------------------
-- Listado de clientes para el panel (CRM + miembros)
-- -----------------------------------------------------------------------------
create or replace function public.admin_customers(
  p_search text default null,
  p_filter text default 'all',
  p_sort text default 'recent',
  p_limit integer default 25,
  p_offset integer default 0,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  telegram_id bigint,
  username text,
  first_name text,
  last_name text,
  tags text[],
  is_banned boolean,
  bot_blocked_at timestamptz,
  created_at timestamptz,
  last_seen_at timestamptz,
  sub_status text,
  ends_at timestamptz,
  started_at timestamptz,
  expulsion_status text,
  joined_channel_at timestamptz,
  total_spent_cents bigint,
  purchases_count integer,
  vip_payments_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      c.id, c.telegram_id, c.username, c.first_name, c.last_name, c.tags, c.is_banned,
      c.bot_blocked_at, c.created_at, c.last_seen_at,
      case
        when s.id is null then 'none'
        when s.status = 'active' and s.ends_at > p_now then 'active'
        else 'expired'
      end as sub_status,
      s.ends_at, s.started_at, s.expulsion_status, s.joined_channel_at,
      st.total_spent_cents, st.purchases_count, st.vip_payments_count
    from public.customers c
    left join public.subscriptions s on s.customer_id = c.id
    join public.customer_stats st on st.customer_id = c.id
    where
      coalesce(trim(p_search), '') = ''
      or c.search_text like '%' || lower(trim(p_search)) || '%'
      or (trim(p_search) ~ '^[0-9]{3,20}$' and c.telegram_id = trim(p_search)::bigint)
      or lower(trim(p_search)) = any (c.tags)
  ),
  filtered as (
    select * from base
    where case coalesce(p_filter, 'all')
      when 'members' then sub_status <> 'none'
      when 'active' then sub_status = 'active'
      when 'expiring' then sub_status = 'active' and ends_at <= p_now + interval '3 days'
      when 'expired' then sub_status = 'expired'
      when 'buyers' then purchases_count > 0
      when 'no_vip' then sub_status = 'none'
      when 'problems' then expulsion_status = 'failed' or is_banned or bot_blocked_at is not null
      else true
    end
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'spent' then f.total_spent_cents end desc nulls last,
    case when p_sort = 'ends' then f.ends_at end asc nulls last,
    case when p_sort = 'purchases' then f.purchases_count end desc nulls last,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- Resumen para las portadas del panel.
create or replace function public.admin_overview(p_now timestamptz default now(), p_tz text default 'Europe/Madrid')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (date_trunc('month', p_now at time zone p_tz)) at time zone p_tz as month_start
  )
  select jsonb_build_object(
    'activeMembers', (select count(*) from public.subscriptions where status = 'active' and ends_at > p_now),
    'expiringSoon', (select count(*) from public.subscriptions where status = 'active' and ends_at > p_now and ends_at <= p_now + interval '3 days'),
    'expiredLast30', (select count(*) from public.subscriptions where status = 'expired' and expired_at >= p_now - interval '30 days'),
    'newMembersMonth', (select count(*) from public.vip_payments, bounds where kind = 'first' and voided_at is null and created_at >= bounds.month_start),
    'renewalsMonth', (select count(*) from public.vip_payments, bounds where kind = 'renewal' and voided_at is null and created_at >= bounds.month_start),
    'vipRevenueMonthCents', (select coalesce(sum(amount_cents), 0) from public.vip_payments, bounds where voided_at is null and created_at >= bounds.month_start),
    'shopRevenueMonthCents', (select coalesce(sum(amount_cents), 0) from public.shop_sales, bounds where voided_at is null and sold_at >= bounds.month_start),
    'salesMonth', (select count(*) from public.shop_sales, bounds where voided_at is null and sold_at >= bounds.month_start),
    'openInterests', (select count(*) from public.shop_interests where status = 'new'),
    'openAlerts', (select count(*) from public.alerts where status = 'open'),
    'customers', (select count(*) from public.customers),
    'productsAvailable', (select count(*) from public.shop_products where status = 'available'),
    'productsOnOffer', (select count(*) from public.shop_products where status in ('available', 'reserved') and offer_price_cents is not null
      and (offer_starts_at is null or offer_starts_at <= p_now) and (offer_ends_at is null or offer_ends_at > p_now)),
    'pendingMessages', (select count(*) from public.message_outbox where status in ('pending', 'sending')),
    'failedMessages24h', (select count(*) from public.message_outbox where status = 'failed' and created_at >= p_now - interval '24 hours')
  );
$$;

-- Informe de un periodo (para el PDF mensual).
create or replace function public.admin_period_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'vip', (
      select jsonb_build_object(
        'revenueCents', coalesce(sum(amount_cents), 0),
        'payments', count(*) filter (where kind in ('first', 'renewal')),
        'newMembers', count(*) filter (where kind = 'first'),
        'renewals', count(*) filter (where kind = 'renewal'),
        'byMethod', coalesce((
          select jsonb_object_agg(method, total) from (
            select method, sum(amount_cents) as total from public.vip_payments
            where voided_at is null and kind in ('first', 'renewal') and created_at >= p_from and created_at < p_to
            group by method
          ) m
        ), '{}'::jsonb)
      )
      from public.vip_payments
      where voided_at is null and created_at >= p_from and created_at < p_to
    ),
    'shop', (
      select jsonb_build_object(
        'revenueCents', coalesce(sum(amount_cents), 0),
        'shippingCents', coalesce(sum(shipping_cents), 0),
        'sales', count(*),
        'byMethod', coalesce((
          select jsonb_object_agg(method, total) from (
            select method, sum(amount_cents) as total from public.shop_sales
            where voided_at is null and sold_at >= p_from and sold_at < p_to
            group by method
          ) m
        ), '{}'::jsonb)
      )
      from public.shop_sales
      where voided_at is null and sold_at >= p_from and sold_at < p_to
    ),
    'interests', (select count(*) from public.shop_interests where created_at >= p_from and created_at < p_to),
    'topCustomers', coalesce((
      select jsonb_agg(t) from (
        select c.id, c.username, c.first_name, sum(x.amount) as spent_cents
        from (
          select customer_id, amount_cents as amount from public.vip_payments
          where voided_at is null and created_at >= p_from and created_at < p_to
          union all
          select customer_id, amount_cents from public.shop_sales
          where voided_at is null and customer_id is not null and sold_at >= p_from and sold_at < p_to
        ) x
        join public.customers c on c.id = x.customer_id
        group by c.id, c.username, c.first_name
        having sum(x.amount) > 0
        order by spent_cents desc
        limit 10
      ) t
    ), '[]'::jsonb),
    'topProducts', coalesce((
      select jsonb_agg(t) from (
        select product_title, count(*) as sales, sum(amount_cents) as revenue_cents
        from public.shop_sales
        where voided_at is null and sold_at >= p_from and sold_at < p_to
        group by product_title
        order by revenue_cents desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Infraestructura: rate limit, idempotencia de Telegram y bloqueos de jobs
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reset timestamptz := v_now + make_interval(secs => greatest(p_window_ms, 1000) / 1000.0);
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 or p_limit < 1 then
    return false;
  end if;
  insert into public.rate_limit_buckets as b (key, count, reset_at)
  values (p_key, 1, v_reset)
  on conflict (key) do update set
    count = case when b.reset_at <= v_now then 1 else b.count + 1 end,
    reset_at = case when b.reset_at <= v_now then v_reset else b.reset_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.claim_telegram_update(p_update_id bigint, p_lease_seconds integer default 120)
returns table (acquired boolean, already_processed boolean, in_progress boolean, lease_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'invalid_update_id' using errcode = '22023';
  end if;
  return query
  insert into public.telegram_updates as u (update_id, claim_token, lease_expires_at, attempts)
  values (p_update_id, v_token, v_now + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))), 1)
  on conflict (update_id) do update set
    claim_token = excluded.claim_token,
    lease_expires_at = excluded.lease_expires_at,
    attempts = u.attempts + 1
  where u.processed_at is null and u.lease_expires_at <= v_now
  returning true, false, false, u.claim_token;
  if found then
    return;
  end if;
  return query
  select false, e.processed_at is not null, e.processed_at is null, null::uuid
  from public.telegram_updates e
  where e.update_id = p_update_id;
end;
$$;

create or replace function public.complete_telegram_update(p_update_id bigint, p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.telegram_updates
  set processed_at = clock_timestamp(), lease_expires_at = null
  where update_id = p_update_id and claim_token = p_lease_token and processed_at is null;
  if found then
    return true;
  end if;
  return exists (
    select 1 from public.telegram_updates
    where update_id = p_update_id and claim_token = p_lease_token and processed_at is not null
  );
end;
$$;

create or replace function public.release_telegram_update(p_update_id bigint, p_lease_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    delete from public.telegram_updates
    where update_id = p_update_id and claim_token = p_lease_token and processed_at is null
    returning 1
  )
  select exists (select 1 from released);
$$;

create or replace function public.claim_job_lock(p_job_name text, p_lease_seconds integer default 60)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_result uuid;
begin
  insert into public.job_locks as j (job_name, lock_token, lock_expires_at, last_started_at)
  values (p_job_name, v_token, v_now + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 60), 900))), v_now)
  on conflict (job_name) do update set
    lock_token = excluded.lock_token,
    lock_expires_at = excluded.lock_expires_at,
    last_started_at = excluded.last_started_at
  where j.lock_expires_at is null or j.lock_expires_at <= v_now
  returning j.lock_token into v_result;
  return v_result;
end;
$$;

create or replace function public.release_job_lock(p_job_name text, p_lease_token uuid, p_ok boolean, p_result jsonb default null, p_error text default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.job_locks set
      lock_token = null,
      lock_expires_at = null,
      last_finished_at = clock_timestamp(),
      last_ok_at = case when p_ok then clock_timestamp() else last_ok_at end,
      last_error = case when p_ok then null else left(p_error, 1000) end,
      last_result = coalesce(p_result, last_result)
    where job_name = p_job_name and lock_token = p_lease_token
    returning 1
  )
  select exists (select 1 from released);
$$;

-- Limpieza de datos técnicos antiguos. El historial de negocio no se toca.
create or replace function public.maintenance_cleanup(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updates integer;
  v_buckets integer;
  v_sessions integer;
  v_outbox integer;
  v_logs integer;
begin
  delete from public.telegram_updates where created_at < p_now - interval '7 days';
  get diagnostics v_updates = row_count;
  delete from public.rate_limit_buckets where reset_at < p_now - interval '1 hour';
  get diagnostics v_buckets = row_count;
  delete from public.admin_sessions where expires_at < p_now - interval '30 days';
  get diagnostics v_sessions = row_count;
  delete from public.message_outbox where status in ('sent', 'cancelled') and created_at < p_now - interval '60 days';
  get diagnostics v_outbox = row_count;
  delete from public.activity_log where level = 'info' and actor in ('bot', 'sistema') and at < p_now - interval '180 days';
  get diagnostics v_logs = row_count;
  return jsonb_build_object('telegramUpdates', v_updates, 'rateLimitBuckets', v_buckets, 'adminSessions', v_sessions, 'outbox', v_outbox, 'activityLog', v_logs);
end;
$$;

-- -----------------------------------------------------------------------------
-- Programador cada minuto (pg_cron + pg_net). Se activa desde el panel con un
-- botón, que llama a esta función con la URL de la app y el secreto del cron.
-- -----------------------------------------------------------------------------
create or replace function public.scheduler_configure(p_url text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return jsonb_build_object('ok', false, 'error', 'pg_cron_missing');
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return jsonb_build_object('ok', false, 'error', 'pg_net_missing');
  end if;
  if p_url !~ '^https://[^\s]+/api/cron/tick$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_url');
  end if;
  if length(coalesce(p_secret, '')) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_secret');
  end if;

  v_command := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 55000)',
    p_url, 'Authorization', 'Bearer ' || p_secret, 'Content-Type', 'application/json', '{}'
  );
  execute 'select cron.schedule($1, $2, $3)' using 'vip-tick', '* * * * *', v_command;
  execute 'select cron.schedule($1, $2, $3)' using 'vip-cleanup', '17 * * * *', 'select public.maintenance_cleanup()';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.scheduler_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb;
  v_last jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return jsonb_build_object('available', false);
  end if;
  execute $q$select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)), '[]'::jsonb) from cron.job where jobname in ('vip-tick', 'vip-cleanup')$q$
    into v_jobs;
  execute $q$select to_jsonb(d) from (
      select r.status, r.start_time, r.end_time, left(r.return_message, 300) as message
      from cron.job_run_details r join cron.job j on j.jobid = r.jobid
      where j.jobname = 'vip-tick' order by r.start_time desc limit 1
    ) d$q$
    into v_last;
  return jsonb_build_object('available', true, 'jobs', v_jobs, 'lastRun', v_last);
end;
$$;

-- =============================================================================
-- Storage: bucket público solo para imágenes de la tienda (nunca contenido VIP).
-- =============================================================================
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- =============================================================================
-- Seguridad: RLS sin políticas + solo service_role.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'vip_channel', 'vip_plans', 'subscriptions', 'vip_payments',
    'shop_categories', 'shop_products', 'shop_product_images', 'shop_sales', 'shop_interests',
    'text_overrides', 'settings', 'broadcasts', 'message_outbox', 'alerts', 'activity_log',
    'admin_sessions', 'rate_limit_buckets', 'telegram_updates', 'job_locks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    end if;
  end loop;
end
$$;

revoke all on public.customer_stats from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.set_updated_at()',
    'public.vip_register_payment(uuid, uuid, text, integer, text, timestamptz)',
    'public.vip_adjust(uuid, integer, timestamptz, text, timestamptz)',
    'public.vip_revoke(uuid, text, timestamptz)',
    'public.vip_void_payment(uuid, text)',
    'public.vip_expire_due(timestamptz, integer)',
    'public.vip_claim_expulsions(timestamptz, integer)',
    'public.vip_expulsion_result(uuid, boolean, text, timestamptz)',
    'public.vip_due_reminders(integer[], timestamptz, integer)',
    'public.shop_register_sale(uuid, uuid, integer, text, integer, text, text, timestamptz)',
    'public.shop_void_sale(uuid, text)',
    'public.shop_register_interest(uuid, uuid, integer, boolean, timestamptz)',
    'public.outbox_claim(integer, integer, timestamptz)',
    'public.outbox_complete(bigint, boolean, text, integer, boolean, timestamptz)',
    'public.raise_alert(text, text, text, text, uuid, jsonb)',
    'public.admin_customers(text, text, text, integer, integer, timestamptz)',
    'public.admin_overview(timestamptz, text)',
    'public.admin_period_report(timestamptz, timestamptz)',
    'public.check_rate_limit(text, integer, integer)',
    'public.claim_telegram_update(bigint, integer)',
    'public.complete_telegram_update(bigint, uuid)',
    'public.release_telegram_update(bigint, uuid)',
    'public.claim_job_lock(text, integer)',
    'public.release_job_lock(text, uuid, boolean, jsonb, text)',
    'public.maintenance_cleanup(timestamptz)',
    'public.scheduler_configure(text, text)',
    'public.scheduler_status()'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select on public.customer_stats to service_role;
    grant usage on type public.vip_change to service_role;
  end if;
end
$$;

comment on table public.customers is 'Personas que han abierto el bot o la tienda. La identidad es telegram_id, nunca el username.';
comment on table public.subscriptions is 'Una suscripción por cliente. Renovar amplía ends_at; el historial está en vip_payments.';
comment on table public.vip_payments is 'Libro de movimientos VIP: pagos (con importe y método), regalos de días y ajustes. No se borra, se anula.';
comment on table public.shop_sales is 'Ventas de la tienda registradas a mano. No se borran, se anulan.';
comment on table public.shop_interests is 'Clics en "Me interesa" con snapshot del producto y del precio mostrado.';
comment on table public.text_overrides is 'Textos editados desde el panel. Si no hay fila se usa el texto por defecto del código.';
comment on table public.message_outbox is 'Cola de mensajes del bot con deduplicación y reintentos.';
