-- A Watch month is an existing Care service period. Keep its repository selection
-- on the original order and its alert in the original mail queue.
alter table public.care_orders drop constraint if exists care_orders_check;
alter table public.care_orders drop constraint if exists care_orders_amount_cents_check;
alter table public.care_orders add constraint care_orders_amount_cents_check check ((offer,amount_cents) in
  (('agent_front_door',24900),('keep_it_working',10000),('machine_payment_route',49900),('agent_storefront',99900),('legacy_skill_watch',1200)));
alter table public.care_mail drop constraint if exists care_mail_kind_check;
alter table public.care_mail add constraint care_mail_kind_check
  check(kind in ('receipt','intake','report','cancellation','monthly_invoice','order_receipt','skill_watch_alert'));
