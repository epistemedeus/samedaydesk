-- Owner-only checkout and fulfilment journal. Existing tasks and orders are unchanged.
create table if not exists public.care_orders (
  id uuid primary key,
  offer text not null check (offer in ('agent_front_door', 'keep_it_working')),
  amount_cents integer not null check ((offer = 'agent_front_door' and amount_cents = 24900) or (offer = 'keep_it_working' and amount_cents = 10000)),
  live_mode boolean not null,
  created_at timestamptz not null default now(),
  checkout_expires_at timestamptz not null,
  checkout_origin text not null,
  integration_id text not null,
  state text not null default 'created' check (state in ('created', 'paid', 'expired', 'refunded', 'review')),
  session_id text unique,
  customer_id text,
  payment_intent_id text unique,
  subscription_id text unique,
  stripe_email text,
  subscription_status text,
  cancel_at_period_end boolean not null default false,
  subscription_event_at timestamptz,
  intake jsonb,
  received_at timestamptz,
  refunded_cents integer not null default 0 check (refunded_cents >= 0)
);
alter table public.care_orders enable row level security;

create table if not exists public.care_periods (
  invoice_id text primary key,
  order_id uuid not null references public.care_orders(id),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  status text not null default 'ready' check (status in ('ready', 'assigned', 'reported', 'review')),
  lease uuid,
  package_spec text,
  task_ref text,
  dispatch_at timestamptz,
  run_id bigint unique,
  report jsonb,
  unique (order_id, period_start)
);
alter table public.care_periods enable row level security;

-- Preserves a refund or dispute even if its event comes before invoice.paid.
create table if not exists public.care_period_holds (
  invoice_id text primary key,
  order_id uuid not null references public.care_orders(id)
);
alter table public.care_period_holds enable row level security;

create table if not exists public.care_mail (
  mail_key text primary key,
  order_id uuid not null references public.care_orders(id),
  kind text not null check (kind in ('receipt', 'intake', 'report', 'cancellation')),
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claim_id uuid,
  accepted_at timestamptz,
  provider_id text,
  check ((accepted_at is null) = (provider_id is null))
);
alter table public.care_mail enable row level security;
