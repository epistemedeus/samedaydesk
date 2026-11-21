-- One locked scope and one link per task. Payment evidence stays attached for reconciliation.
create table if not exists public.task_quotes (
  id uuid primary key,
  request_id uuid not null unique references public.task_requests(id),
  created_at timestamptz not null default now(),
  amount_cents integer not null check (amount_cents between 100 and 99999999),
  scope text not null check (char_length(scope) between 12 and 4000),
  acceptance text not null check (char_length(acceptance) between 12 and 2000),
  live_mode boolean not null,
  stripe_price text unique,
  stripe_link text unique,
  stripe_url text,
  stripe_session text unique,
  payment_intent text unique,
  paid_at timestamptz,
  payer_email text,
  needs_review boolean not null default false,
  check ((paid_at is null) = (payment_intent is null)),
  check ((stripe_link is null) = (stripe_url is null))
);
alter table public.task_quotes enable row level security;
