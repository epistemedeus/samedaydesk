-- Offer overhaul: the four answer-correction offers.
--
-- Purchases no longer require an account, so orders can exist with no user_id. This
-- migration relaxes that column, adds the columns the new flow writes, and creates the
-- intake, cache, and quota tables the free report needs.
--
-- Idempotent: safe to run twice. Apply from the SQL editor.

-- ───────────────────────── orders (extended, not replaced) ─────────────────────────
alter table public.orders alter column user_id drop not null;

alter table public.orders add column if not exists stripe_session_id  text;
alter table public.orders add column if not exists offer_slug         text;
alter table public.orders add column if not exists delivery_email     text;
alter table public.orders add column if not exists site_url           text;
alter table public.orders add column if not exists brand_name         text;
alter table public.orders add column if not exists intake_completed_at timestamptz;
alter table public.orders add column if not exists recovery_sent      boolean not null default false;

create unique index if not exists orders_stripe_session_id_key
  on public.orders(stripe_session_id) where stripe_session_id is not null;

-- status values in use: paid | intake_complete | delivered | refunded
--                       (legacy rows keep 'received')

-- ───────────────────────── intakes (the 11 fields) ─────────────────────────
create table if not exists public.intakes (
  id         uuid primary key default gen_random_uuid(),
  order_id   text not null references public.orders(id) on delete cascade,
  fields     jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.intakes enable row level security;
-- No client policy: service role only. An intake holds a buyer's business facts.
create index if not exists intakes_order_id_idx on public.intakes(order_id);

-- ───────────────────────── report_cache (24h TTL, enforced in code) ─────────────────────────
create table if not exists public.report_cache (
  registrable_domain text primary key,
  payload            jsonb not null,
  created_at         timestamptz not null default now()
);
alter table public.report_cache enable row level security;
create index if not exists report_cache_created_at_idx on public.report_cache(created_at);

-- ───────────────────────── report_quota (abuse bounds) ─────────────────────────
create table if not exists public.report_quota (
  day                date not null,
  registrable_domain text not null,
  ip_hash            text not null,
  count              integer not null default 1,
  primary key (day, registrable_domain, ip_hash)
);
alter table public.report_quota enable row level security;
create index if not exists report_quota_day_idx on public.report_quota(day);
create index if not exists report_quota_day_ip_idx on public.report_quota(day, ip_hash);
