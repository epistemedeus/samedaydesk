-- Controller only. Select the existing SameDayDesk owner project first.
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '3s';

do $$
declare
  owner_order constant uuid := '505a0b26-a89a-4f45-8d2a-a3e1780ef6c6';
  owner_window constant text := 'official-watch-owner-window-v1';
  config constant jsonb := '{"officialPages":["delaware-annual","delaware-fee-index","delaware-fees","wyoming-fees","new-mexico-fee-index","new-mexico-fees","irs-ss4","irs-ein","irs-5472","play-locations","play-account","apple-enrollment","stripe-locations","paypal-locations","duns","fincen"]}';
begin
  if current_user <> 'postgres' or not exists (
    select 1 from pg_catalog.pg_namespace
    where nspname='samedaydesk_care' and nspowner='postgres'::regrole
  ) then
    raise exception 'SameDayDesk Care owner enrollment required';
  end if;

  insert into samedaydesk_care.care_orders
    (id, offer, amount_cents, live_mode, checkout_expires_at, checkout_origin, integration_id, state, rail_email, intake)
  values (owner_order, 'legacy_skill_watch', 1200, false, now(), 'https://samedaydesk.com',
    'official-watch-owner-v1', 'review', 'contact@samedaydesk.com', config)
  on conflict (id) do nothing;

  insert into samedaydesk_care.care_periods (invoice_id, order_id, period_start, period_end, status)
  values (owner_window, owner_order, now(), 'infinity', 'review')
  on conflict (invoice_id) do nothing;

  if not exists (
    select 1 from samedaydesk_care.care_orders o
    join samedaydesk_care.care_periods p on p.order_id=o.id
    where o.id=owner_order and o.offer='legacy_skill_watch' and o.amount_cents=1200 and not o.live_mode
      and o.state='review' and o.integration_id='official-watch-owner-v1' and o.rail_email='contact@samedaydesk.com'
      and o.session_id is null and o.subscription_id is null and o.rail_id is null and o.received_at is null
      and o.intake=config and p.invoice_id=owner_window and p.status='review'
      and p.period_start<=now() and p.period_end='infinity'
  ) then
    raise exception 'Existing owner Watch enrollment differs or is disabled';
  end if;
end $$;
select 'owner_watch_enrolled' as outcome, 16 as target_count, false as paid_period;
commit;
