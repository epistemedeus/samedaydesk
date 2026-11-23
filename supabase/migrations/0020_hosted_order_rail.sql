-- Admit new anonymous orders before either provider path. Historical Stripe rows
-- retain their original session, PaymentIntent, receipt id and refund lookup.
alter table public.hosted_orders
  alter column session_id drop not null, alter column payment_intent_id drop not null,
  add column if not exists checkout_rail text not null default 'stripe' check(checkout_rail in ('stripe','usdc')),
  add column if not exists order_key uuid unique,
  add column if not exists rail_id uuid unique,
  add column if not exists checkout_details jsonb not null default '{}',
  add column if not exists rail_state jsonb not null default '{}';
alter table public.hosted_orders drop constraint if exists hosted_orders_state_check;
alter table public.hosted_orders add constraint hosted_orders_state_check check(state in ('waiting','received','review','refunded'));
alter table public.hosted_orders drop constraint if exists hosted_rail_provider_identity;
alter table public.hosted_orders add constraint hosted_rail_provider_identity check (
  (checkout_rail='usdc' and order_key is not null and rail_id is not null and session_id is null and payment_intent_id is null)
  or (checkout_rail='stripe' and (state='waiting' and order_key is not null or session_id is not null and payment_intent_id is not null))
);
create unique index if not exists hosted_rail_effect on public.hosted_orders
  ((rail_state->'receipt'->>'transaction'),(rail_state->'receipt'->>'transferLogIndex')) where rail_state ? 'receipt';

alter table public.care_mail alter column order_id drop not null,
  add column if not exists hosted_order_id text references public.hosted_orders(id),
  add column if not exists quote_id uuid references public.task_quotes(id);
alter table public.care_mail drop constraint if exists care_mail_one_order;
alter table public.care_mail add constraint care_mail_one_order check(num_nonnulls(order_id,hosted_order_id,quote_id)=1);
alter table public.care_mail drop constraint if exists care_mail_kind_check;
alter table public.care_mail add constraint care_mail_kind_check
  check(kind in ('receipt','intake','report','cancellation','monthly_invoice','order_receipt'));
