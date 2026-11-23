-- Existing and in-flight provider checkouts remain on their original rail.
alter table public.care_orders
  add column if not exists checkout_rail text not null default 'stripe' check (checkout_rail in ('stripe','usdc')),
  add column if not exists rail_id uuid unique,
  add column if not exists rail_email text,
  add column if not exists rail_start_block bigint,
  add column if not exists rail_attempt jsonb,
  add column if not exists rail_provider jsonb,
  add column if not exists rail_observation jsonb,
  add column if not exists rail_refund jsonb,
  add column if not exists rail_qa_cents integer check (rail_qa_cents between 1 and 100);
create unique index if not exists care_admitted_usdc on public.care_orders
  ((lower(rail_attempt->>'payer')), (lower(rail_attempt->>'nonce'))) where rail_attempt is not null;
create unique index if not exists care_usdc_effect on public.care_orders
  ((rail_observation->'evidence'->>'transaction'), (rail_observation->'evidence'->>'logIndex'))
  where rail_observation->'evidence'->>'logIndex' is not null;
alter table public.journey_events drop constraint if exists journey_events_event_check;
alter table public.journey_events add constraint journey_events_event_check
  check(event in ('visit','checkout_started','payment_verified','receipt_sent','return','payment_refunded'));
alter table public.care_orders add column if not exists rail_parent uuid references public.care_orders(id),
  add column if not exists rail_period_start timestamptz;
create unique index if not exists care_usdc_one_invoice_per_period on public.care_orders(rail_parent,rail_period_start)
  where rail_parent is not null;
alter table public.care_mail drop constraint if exists care_mail_kind_check;
alter table public.care_mail add constraint care_mail_kind_check
  check(kind in ('receipt','intake','report','cancellation','monthly_invoice'));
