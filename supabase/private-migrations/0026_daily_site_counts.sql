begin;

-- The existing owner manages these verified exclusions. No new account identity
-- is copied here, and the demand reader receives no table privilege.
create table if not exists samedaydesk_care.daily_account_exclusions (
  profile_digest bytea primary key check (octet_length(profile_digest)=32),
  scope text not null check (scope in ('owner','test','sponsored'))
);
alter table samedaydesk_care.daily_account_exclusions owner to postgres;
alter table samedaydesk_care.daily_account_exclusions enable row level security;
alter table samedaydesk_care.daily_account_exclusions force row level security;
revoke all on table samedaydesk_care.daily_account_exclusions from public, anon, authenticated, service_role, samedaydesk_demand_reader;

-- The installed Care tables use FORCE RLS and their preexisting owner is postgres.
-- Install through that existing owner, without adding a table grant or RLS policy.
create function samedaydesk_care.daily_site_counts(p_day date)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $count$
declare
  start_at timestamptz;
  end_at timestamptz;
  coverage_from date;
  enrollment text;
  accounts bigint;
  starts bigint;
  paid bigint;
begin
  if p_day is null or not isfinite(p_day) or p_day < date '2000-01-01'
     or p_day >= (statement_timestamp() at time zone 'UTC')::date then
    raise exception 'A closed UTC calendar day is required' using errcode = '22023';
  end if;
  start_at := p_day::timestamp at time zone 'UTC';
  end_at := (p_day + 1)::timestamp at time zone 'UTC';
  enrollment := obj_description('samedaydesk_care.daily_site_counts(date)'::regprocedure, 'pg_proc');
  if enrollment ~ '^coverage-from:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    coverage_from := substring(enrollment from 15)::date;
  end if;

  with recursive journey as (
    select session_id::text as session, order_id, test or
      coalesce(utm->>'observation_scope' in ('owner','preview','synthetic','test','sponsored'),false) as excluded,
      event, created_at, utm
    from samedaydesk_care.journey_events where brand='samedaydesk'
  ),
  edges(a,b) as (
    select 'session:'||session,'order:'||order_id from journey where order_id is not null
    union
    select 'account:'||user_id,'order:'||id from public.payment_attempts
    union
    select 'account:'||user_id,'order:'||id from public.orders
    union
    select 'order:'||id,'order:'||(meta->>'payment_attempt_id') from public.orders where meta->>'payment_attempt_id' is not null
    union
    select 'session:'||journey_session,'order:'||id from samedaydesk_care.care_orders where journey_session is not null
    union
    select 'order:'||rail_parent,'order:'||id from samedaydesk_care.care_orders where rail_parent is not null
    union
    select 'session:'||order_key,'order:'||id from samedaydesk_care.hosted_orders where order_key is not null
    union
    select 'session:'||request_id,'order:'||id from samedaydesk_care.task_quotes
  ),
  neighbors(a,b) as (select a,b from edges union all select b,a from edges),
  seeds(key) as (
    select 'session:'||session from journey where excluded
    union select 'account:'||p.id from public.profiles p join samedaydesk_care.daily_account_exclusions e
      on e.profile_digest=sha256(convert_to('samedaydesk/daily-account-exclusion/v1/'||p.id,'UTF8'))
    union select 'order:'||id from public.orders where meta->>'test'='true'
    union select 'order:'||id from samedaydesk_care.care_orders where not live_mode or rail_qa_cents is not null
    union select 'order:'||id from samedaydesk_care.hosted_orders where not live_mode
    union select 'order:'||id from samedaydesk_care.task_quotes where not live_mode
  ),
  excluded(key) as (
    select key from seeds union select n.b from neighbors n join excluded e on n.a=e.key
  ),
  -- An accepted payment attempt, Care reservation or hosted election is one
  -- start. Scheduled renewals and sent-but-unopened task quotes are separate.
  started(key,at) as (
    select id,created_at from public.payment_attempts
    union all select id::text,created_at from samedaydesk_care.care_orders where rail_parent is null
    union all select id,created_at from samedaydesk_care.hosted_orders where order_key is not null
    union all select id::text,rail_opened_at from samedaydesk_care.task_quotes where rail_opened_at is not null
    union all select order_id,min(created_at) from journey where order_id is not null and event='checkout_started'
      and utm->>'checkout_family'='one_route_report' group by order_id
  ),
  verified(key,at) as (
    select coalesce(meta->>'payment_attempt_id',id),created_at from public.orders
      where stripe_payment_intent is not null or meta->>'payment_method'='base_usdc' and meta ? 'payment_receipt'
    union all select id::text,received_at from samedaydesk_care.care_orders where rail_parent is null and received_at is not null
    union all select id::text,paid_at from samedaydesk_care.task_quotes where paid_at is not null
    union all select id,created_at from samedaydesk_care.hosted_orders where order_key is null
      and payment_intent_id is not null and offer='seller_contract_repair'
    union all select j.order_id,min(j.created_at) from journey j
      join samedaydesk_care.hosted_orders h on h.id=j.order_id and h.order_key is not null
      where j.event='payment_verified' group by j.order_id
  ),
  first_paid as (select key,min(at) as at from verified where at is not null group by key)
  select
    (select count(*) from public.profiles p where p.created_at>=start_at and p.created_at<end_at
      and not exists (select 1 from excluded e where e.key='account:'||p.id)),
    (select count(distinct s.key) from started s where s.at>=start_at and s.at<end_at
      and not exists (select 1 from excluded e where e.key='order:'||s.key)),
    (select count(*) from first_paid p where p.at>=start_at and p.at<end_at
      and not exists (select 1 from excluded e where e.key='order:'||p.key))
  into accounts, starts, paid;

  return jsonb_build_object('schema','pilot.daily-site-counts.v1','site','samedaydesk.com','day',p_day,
    'accountsCreated',case when p_day>=coverage_from then accounts end,
    'ordersStarted',case when p_day>=coverage_from then starts end,
    'ordersPaid',case when p_day>=coverage_from then paid end,
    'lettersSigned',null,'letterChecks',null,
    'coverage',jsonb_build_object('coverageFrom',coverage_from,
      'accountsCreated',jsonb_build_object('status',case when p_day>=coverage_from then 'retained' else 'UNKNOWN' end,
        'retainedCount',accounts,'basis','retained authoritative profiles; private verified exclusions and linked marked exclusions'),
      'ordersStarted',jsonb_build_object('status',case when p_day>=coverage_from then 'retained' else 'UNKNOWN' end,
        'retainedCount',starts,'basis','local admitted elections and confirmed SDS Report handoffs; bare external links have no local order start'),
      'ordersPaid',jsonb_build_object('status',case when p_day>=coverage_from then 'retained' else 'UNKNOWN' end,
        'retainedCount',paid,'basis','distinct site-recorded paid orders; House-owned Report payments and unattributed shared links are outside this projection'),
      'lettersSigned',jsonb_build_object('status','NOT_APPLICABLE','basis','SameDayDesk has no authority-letter signing flow'),
      'letterChecks',jsonb_build_object('status','NOT_APPLICABLE','basis','SameDayDesk has no authority-letter check flow')));
end;
$count$;

alter function samedaydesk_care.daily_site_counts(date) owner to postgres;
revoke all on function samedaydesk_care.daily_site_counts(date) from public;
revoke all on function samedaydesk_care.daily_site_counts(date) from anon, authenticated, service_role;
grant execute on function samedaydesk_care.daily_site_counts(date) to samedaydesk_demand_reader;

-- Existing function defaults may have drifted. Refuse any unexpected ACL rather
-- than changing a reader's unrelated grants or accepting another callable role.
do $guard$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid='samedaydesk_care.daily_account_exclusions'::pg_catalog.regclass
      and a.grantee<>'postgres'::pg_catalog.regrole
  ) then raise exception 'Unexpected daily exclusion table grant'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(p.proacl) a
    where p.oid='samedaydesk_care.daily_site_counts(date)'::pg_catalog.regprocedure
      and (a.grantee not in ('postgres'::pg_catalog.regrole,'samedaydesk_demand_reader'::pg_catalog.regrole) or
           a.grantee='samedaydesk_demand_reader'::pg_catalog.regrole and a.is_grantable)
  ) then raise exception 'Unexpected daily count execute grant'; end if;
end;
$guard$;
comment on function samedaydesk_care.daily_site_counts(date) is 'coverage-pending';
commit;
