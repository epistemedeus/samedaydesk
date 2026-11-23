-- Pre-existing Stripe links continue under their original single-use authority.
alter table public.task_quotes
  add column if not exists checkout_rail text not null default 'stripe' check(checkout_rail in ('choice','stripe','usdc')),
  add column if not exists checkout_key uuid unique,
  add column if not exists rail_id uuid unique,
  add column if not exists rail_opened_at timestamptz,
  add column if not exists rail_state jsonb not null default '{}';
alter table public.task_quotes drop constraint if exists task_quotes_check;
alter table public.task_quotes add constraint task_quotes_check check (
  (checkout_rail='usdc' and payment_intent is null and stripe_link is null) or
  (checkout_rail<>'usdc' and (paid_at is null)=(payment_intent is null))
);
create unique index if not exists quote_rail_effect on public.task_quotes
  ((rail_state->'receipt'->>'transaction'),(rail_state->'receipt'->>'transferLogIndex')) where rail_state ? 'receipt';
