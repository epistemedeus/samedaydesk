-- Server-observed release funnel. Test traffic is explicitly excluded from live rates.
create table if not exists public.journey_events (
  event_key text primary key,
  brand text not null check (brand = 'samedaydesk'),
  event text not null check (event in ('visit','checkout_started','payment_verified','receipt_sent','return')),
  session_id uuid not null,
  test boolean not null,
  order_id text,
  is_agent boolean not null default false,
  referrer text,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.journey_events enable row level security;
create index if not exists journey_events_live_funnel on public.journey_events (brand,event,created_at) where not test;
alter table public.care_orders add column if not exists journey_session uuid;
