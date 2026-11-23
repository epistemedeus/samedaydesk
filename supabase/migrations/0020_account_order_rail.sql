-- Account checkout stays in the existing account database under service-role RLS.
alter table public.payment_attempts
  add column if not exists rail_id uuid unique,
  add column if not exists checkout_rail text not null default 'stripe' check (checkout_rail in ('stripe','switching','usdc')),
  add column if not exists rail_revision bigint not null default 0,
  add column if not exists rail_state jsonb not null default '{}',
  add column if not exists rail_delivery jsonb not null default '{}';
create unique index if not exists account_rail_nonce on public.payment_attempts
  ((lower(rail_state->'attempt'->>'payer')), (lower(rail_state->'attempt'->>'nonce'))) where rail_state ? 'attempt';
create unique index if not exists account_rail_effect on public.payment_attempts
  ((rail_state->'receipt'->>'transaction'),(rail_state->'receipt'->>'transferLogIndex')) where rail_state ? 'receipt';

-- Caller is the server-side product adapter. Compare-and-set, fulfilment, profile and
-- durable receipt identity commit together. PostgREST browser roles cannot invoke it.
create or replace function public.account_usdc_transition(
  p_id uuid, p_revision bigint, p_next jsonb, p_state text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.payment_attempts%rowtype; previous text; order_key text;
begin
  select * into a from public.payment_attempts where rail_id=p_id and checkout_rail='usdc' for update;
  if not found or a.rail_revision <> p_revision then return false; end if;
  previous := coalesce(a.rail_state->>'state','waiting');
  if p_next is null or jsonb_typeof(p_next) <> 'object' or
     (a.rail_state ? 'attempt' and (
       ((a.rail_state->'attempt') - 'nextBlock') is distinct from ((p_next->'attempt') - 'nextBlock'))) or
     (a.rail_state ? 'receipt' and
       ((a.rail_state->'receipt') - 'refund') is distinct from ((p_next->'receipt') - 'refund')) then
    raise exception 'original payment identity changed';
  end if;
  if coalesce(p_next->>'state','waiting') is distinct from p_state or not (
    (p_state=previous) or (previous='waiting' and p_state='seen') or
    (previous='seen' and p_state in ('paid','held')) or (previous in ('paid','held') and p_state='refund_pending') or
    (previous='refund_pending' and p_state in ('refunded','held'))) then
    raise exception 'invalid payment transition';
  end if;
  order_key := 'order_' || a.id;
  if p_state='paid' and previous='seen' then
    if a.status <> 'open' or a.intake_snapshot is null or a.intake_hash is null or
       p_next->'receipt'->>'amount' is distinct from (a.amount::bigint*10000)::text or
       lower(p_next->'receipt'->>'payer') is distinct from lower(a.rail_state->'attempt'->>'payer') or
       p_next->'receipt'->>'nonce' is distinct from a.rail_state->'attempt'->>'nonce' then raise exception 'purchase facts changed'; end if;
    insert into public.orders(id,user_id,offer,label,amount,currency,status,upload_path,meta)
      values(order_key,a.user_id,a.offer,a.stripe_create_params->'metadata'->>'label',a.amount,a.currency,'received',
        nullif(a.intake_snapshot->>'uploadPath',''),jsonb_build_object('receipt_email',a.stripe_create_params->>'receipt_email',
          'payment_attempt_id',a.id,'payment_method','base_usdc','payment_receipt',p_next->'receipt',
          'intake',jsonb_build_object('details',a.intake_snapshot->>'details')));
    update public.profiles set payment_status='paid' where id=a.user_id;
  elsif p_state='refund_pending' and previous='paid' then
    update public.orders set status='review' where id=order_key;
  elsif p_state='refunded' and previous='refund_pending' then
    update public.orders set status='refunded',meta=meta||jsonb_build_object('refund_receipt',p_next->'refund'->'evidence') where id=order_key;
  end if;
  update public.payment_attempts set rail_state=p_next,rail_revision=rail_revision+1,
    status=case when p_state='paid' then 'succeeded' else status end, updated_at=now() where id=a.id;
  return true;
end $$;
revoke all on function public.account_usdc_transition(uuid,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.account_usdc_transition(uuid,bigint,jsonb,text) to service_role;

-- Reserve mail before contacting Resend. A stable idempotency key and a bounded
-- retry window cover loss of an acknowledgement across the two authorities.
create or replace function public.account_usdc_delivery(p_id uuid, p_key text, p_ack boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.payment_attempts%rowtype; target jsonb; started timestamptz;
begin
  select * into a from public.payment_attempts where rail_id=p_id and checkout_rail='usdc' for update;
  if not found or p_key not in ('checkout_started','receipt','payment_verified','payment_refunded') then return false; end if;
  if p_key in ('receipt','payment_verified') and a.status <> 'succeeded' then return false; end if;
  if p_key='payment_refunded' and a.rail_state->>'state' is distinct from 'refunded' then return false; end if;
  target := a.rail_delivery->p_key;
  if target->>'acknowledged' = 'true' then return false; end if;
  started := coalesce((target->>'started')::timestamptz,now());
  if p_key='receipt' and started < now()-interval '23 hours' then return false; end if;
  if p_ack and target is null then return false; end if;
  update public.payment_attempts set rail_delivery=rail_delivery||jsonb_build_object(p_key,
    jsonb_build_object('started',started,'acknowledged',p_ack)) where id=a.id;
  return true;
end $$;
revoke all on function public.account_usdc_delivery(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.account_usdc_delivery(uuid,text,boolean) to service_role;
