-- Repeat-purchase correctness: explicit payment attempts + unique payment identity on orders.
-- Legacy order ids (order_{uid}_{offer}) remain valid rows; new fulfillment uses order_{pi_id}.

create table if not exists public.payment_attempts (
  id                    text primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  offer                 text not null,
  amount                integer not null,
  currency              text not null default 'usd',
  upload_path           text not null default '',
  status                text not null default 'open',
  stripe_payment_intent text,
  facts_hash            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint payment_attempts_status_check
    check (status in ('open', 'succeeded', 'canceled'))
);

alter table public.payment_attempts enable row level security;
-- No client policies: service-role only (Express owns attempt identity).

create index if not exists payment_attempts_user_offer_idx
  on public.payment_attempts (user_id, offer, updated_at desc);

create index if not exists payment_attempts_open_lookup_idx
  on public.payment_attempts (user_id, offer, status, facts_hash);

create unique index if not exists orders_stripe_payment_intent_uidx
  on public.orders (stripe_payment_intent)
  where stripe_payment_intent is not null;
