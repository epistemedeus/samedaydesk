#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
pg_bin="$(pg_config --bindir)"
fixture="$(mktemp -d)"
"$pg_bin/initdb" -U postgres -A trust -D "$fixture/data" >/dev/null
"$pg_bin/pg_ctl" -D "$fixture/data" -l "$fixture/log" -o "-F -p 55493 -k $fixture -c listen_addresses=''" -w start >/dev/null
trap '"$pg_bin/pg_ctl" -D "$fixture/data" -m immediate -w stop >/dev/null' EXIT
sql=(psql -X -qAt -v ON_ERROR_STOP=1 -h "$fixture" -p 55493 -d postgres)
"${sql[@]}" -U postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role samedaydesk_demand_reader login;
create role unrelated login;
create table public.profiles (id uuid primary key, email text, created_at timestamptz not null);
create table public.orders (id text primary key, user_id uuid not null, stripe_payment_intent text, meta jsonb, created_at timestamptz not null);
create table public.payment_attempts (id text primary key, user_id uuid not null, created_at timestamptz not null);
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.payment_attempts enable row level security;
SQL
node server/scripts/care-enrollment.mjs samedaydesk_care samedaydesk_care_app | "${sql[@]}" -U postgres
"${sql[@]}" -U postgres <<'SQL'
grant usage on schema samedaydesk_care to samedaydesk_demand_reader, unrelated;
grant select (event, created_at) on samedaydesk_care.journey_events to samedaydesk_demand_reader;
create policy demand_journey_read on samedaydesk_care.journey_events for select to samedaydesk_demand_reader using (true);
insert into public.profiles values
 ('10000000-0000-4000-8000-000000000001','positive@example.test','2026-01-02T00:00:00Z'),
 ('10000000-0000-4000-8000-000000000002','excluded@example.test','2026-01-02T05:00:00Z'),
 ('10000000-0000-4000-8000-000000000003','next-day@example.test','2026-01-03T00:00:00Z'),
 ('10000000-0000-4000-8000-000000000004','unlinked-owner@example.test','2026-01-02T02:00:00Z');
insert into public.payment_attempts values
 ('attempt_a','10000000-0000-4000-8000-000000000001','2026-01-02T00:00:00Z'),
 ('attempt_qa','10000000-0000-4000-8000-000000000002','2026-01-02T02:00:00Z');
insert into public.orders values
 ('order_paid','10000000-0000-4000-8000-000000000001','pi_x','{"payment_attempt_id":"attempt_a"}','2026-01-02T01:00:00Z'),
 ('order_replay','10000000-0000-4000-8000-000000000001','pi_y','{"payment_attempt_id":"attempt_a"}','2026-01-03T00:00:00Z'),
 ('order_meta','10000000-0000-4000-8000-000000000002','pi_z','{"test":true,"payment_attempt_id":"attempt_qa"}','2026-01-02T01:00:00Z');
insert into samedaydesk_care.hosted_orders (id,offer,label,amount_cents,currency,live_mode,order_key,state,session_id,payment_intent_id,created_at) values
 ('hosted_real','legacy_fix_pack','Fixture',3900,'usd',true,'20000000-0000-4000-8000-000000000001','refunded','cs_fixture_real','pi_fixture_real','2026-01-02T00:00:00Z'),
 ('hosted_qa','legacy_fix_pack','Fixture',3900,'usd',true,'20000000-0000-4000-8000-000000000002','received','cs_fixture_qa','pi_fixture_qa','2026-01-02T00:00:00Z');
insert into samedaydesk_care.journey_events(event_key,brand,event,session_id,test,order_id,utm,created_at) values
 ('h-one','samedaydesk','payment_verified','20000000-0000-4000-8000-000000000001',false,'hosted_real','{}','2026-01-02T23:59:59.999Z'),
 ('h-replay','samedaydesk','payment_verified','20000000-0000-4000-8000-000000000001',false,'hosted_real','{}','2026-01-03T00:00:00Z'),
 ('h-qa','samedaydesk','payment_verified','20000000-0000-4000-8000-000000000002',false,'hosted_qa','{}','2026-01-02T01:00:00Z'),
 ('h-link','samedaydesk','visit','20000000-0000-4000-8000-000000000002',false,'order_meta','{}','2026-01-01T01:00:00Z'),
 ('r-start','samedaydesk','checkout_started','30000000-0000-4000-8000-000000000001',false,'report','{"checkout_family":"one_route_report"}','2026-01-02T00:00:00Z'),
 ('r-replay','samedaydesk','checkout_started','30000000-0000-4000-8000-000000000001',false,'report','{"checkout_family":"one_route_report"}','2026-01-03T00:00:00Z'),
 ('r-qa','samedaydesk','checkout_started','30000000-0000-4000-8000-000000000003',false,'report-qa','{"checkout_family":"one_route_report"}','2026-01-02T00:00:00Z'),
 ('r-owner','samedaydesk','visit','30000000-0000-4000-8000-000000000003',true,null,'{}','2026-01-01T00:00:00Z');
SQL
"${sql[@]}" -U postgres -f supabase/private-migrations/0026_daily_site_counts.sql
"${sql[@]}" -U postgres -c "insert into samedaydesk_care.daily_account_exclusions values (
  sha256(convert_to('samedaydesk/daily-account-exclusion/v1/10000000-0000-4000-8000-000000000004','UTF8')),'owner');"
query() { "${sql[@]}" -U samedaydesk_demand_reader -c "$1"; }
counts() { query "begin read only; select samedaydesk_care.daily_site_counts('$1'::date); commit;"; }
counts 2026-01-02 | jq -e '.accountsCreated==null and .ordersStarted==null and .ordersPaid==null and .coverage.ordersPaid.retainedCount==2' >/dev/null
"${sql[@]}" -U postgres -c "comment on function samedaydesk_care.daily_site_counts(date) is 'coverage-from:2026-01-02'"
counts 2026-01-02 | jq -e '.accountsCreated==1 and .ordersStarted==3 and .ordersPaid==2 and .lettersSigned==null and .letterChecks==null' >/dev/null
counts 2026-01-03 | jq -e '.accountsCreated==1 and .ordersStarted==0 and .ordersPaid==0' >/dev/null
counts 2026-01-04 | jq -e '.accountsCreated==0 and .ordersStarted==0 and .ordersPaid==0' >/dev/null
query "set timezone to 'Pacific/Auckland'; select samedaydesk_care.daily_site_counts('2026-01-02');" | jq -e '.ordersPaid==2' >/dev/null
query 'create temp table orders (id text); select samedaydesk_care.daily_site_counts('\''2026-01-02'\'');' | jq -e '.ordersPaid==2' >/dev/null
query "select count(event) from samedaydesk_care.journey_events" | grep -qx 8
refused() {
  local role="$1" statement="$2" reason="$3"
  if "${sql[@]}" -U "$role" -c "$statement" > "$fixture/refusal.log" 2>&1; then
    printf 'Unexpected access or invalid day accepted.\n' >&2
    exit 1
  fi
  grep -Fq "$reason" "$fixture/refusal.log"
}
refused unrelated "select samedaydesk_care.daily_site_counts('2026-01-02');" 'permission denied'
refused samedaydesk_demand_reader 'select * from public.profiles;' 'permission denied'
refused samedaydesk_demand_reader 'select * from public.orders;' 'permission denied'
refused samedaydesk_demand_reader 'select * from samedaydesk_care.hosted_orders;' 'permission denied'
refused samedaydesk_demand_reader 'select * from samedaydesk_care.daily_account_exclusions;' 'permission denied'
refused samedaydesk_care_app 'select * from samedaydesk_care.daily_account_exclusions;' 'permission denied'
refused samedaydesk_demand_reader "select samedaydesk_care.daily_site_counts('not-a-day');" 'invalid input syntax'
refused samedaydesk_demand_reader 'select samedaydesk_care.daily_site_counts(current_date);' 'closed UTC calendar day'
refused samedaydesk_demand_reader 'select samedaydesk_care.daily_site_counts(current_date+1);' 'closed UTC calendar day'
refused samedaydesk_demand_reader 'select samedaydesk_care.daily_site_counts(null);' 'closed UTC calendar day'
identity=$(query "select pg_get_userbyid(proowner)||'|'||prosecdef from pg_proc where oid='samedaydesk_care.daily_site_counts(date)'::regprocedure")
test "$identity" = 'postgres|true'
"${sql[@]}" -U postgres -c 'drop function samedaydesk_care.daily_site_counts(date);'
query 'select count(event) from samedaydesk_care.journey_events' | grep -qx 8
refused samedaydesk_demand_reader "select samedaydesk_care.daily_site_counts('2026-01-02');" 'does not exist'
"${sql[@]}" -U postgres -f supabase/private-migrations/0026_daily_site_counts.sql
"${sql[@]}" -U postgres -c "comment on function samedaydesk_care.daily_site_counts(date) is 'coverage-from:2026-01-02'"
counts 2026-01-02 | jq -e '.accountsCreated==1 and .ordersStarted==3 and .ordersPaid==2' >/dev/null
printf '%s\n' 'PASS: installed role boundaries, historical unknown, positive and zero days, exclusive midnight, QA joins, retry dedupe, rollback, unchanged reader.'
env -i PATH="$PATH" NODE_ENV=production HOME="$fixture" SDS_PRIVATE_PREVIEW=1 SDS_CARE_SCHEMA=samedaydesk_care \
  SDS_CARE_DATABASE_URL="postgresql://samedaydesk_care_app@127.0.0.1/postgres?host=$fixture&port=55493" \
  node --test server/scripts/test-daily-site-counts.mjs
