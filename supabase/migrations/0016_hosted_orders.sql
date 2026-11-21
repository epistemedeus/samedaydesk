-- Paid hosted checkouts without an account still require a durable delivery row.
create table if not exists public.hosted_orders (
  id text primary key,
  session_id text not null unique,
  payment_intent_id text not null unique,
  offer text not null,
  label text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'usd'),
  live_mode boolean not null,
  state text not null default 'received' check (state in ('received', 'refunded', 'review')),
  refunded_cents integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.hosted_orders enable row level security;
