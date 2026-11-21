#!/usr/bin/env bash
# The paid intake, invoice replay and cancellation test (server/scripts/test-care-preview.mjs) on a
# throwaway local PostgreSQL, with fixture Stripe values (no Stripe call) and the preview mail outbox.
set -euo pipefail
cd "$(dirname "$0")/../.."
pg_bin="$(pg_config --bindir)"
pg_root="$(mktemp -d)"
"$pg_bin/initdb" -A trust -D "$pg_root/data" > /dev/null
"$pg_bin/pg_ctl" -D "$pg_root/data" -l "$pg_root/log" -o "-F -p 55493 -k $pg_root -c listen_addresses=127.0.0.1" -w start > /dev/null
trap '"$pg_bin/pg_ctl" -D "$pg_root/data" -m immediate -w stop > /dev/null; rm -rf "$pg_root"' EXIT
dsn="postgresql://$(id -un)@127.0.0.1:55493/postgres"
psql -X -q -v ON_ERROR_STOP=1 "$dsn" -f supabase/migrations/0011_task_requests.sql -f supabase/migrations/0012_care_orders.sql -f supabase/migrations/0013_task_quotes.sql -f supabase/migrations/0014_commerce_journey.sql -f supabase/migrations/0015_mail_events.sql
env -i PATH="$PATH" HOME="$pg_root" NODE_ENV=production SDS_PRIVATE_PREVIEW=1 SDS_CARE_DATABASE_URL="$dsn" \
  SDS_PREVIEW_MAIL_OUTBOX="$pg_root/outbox.jsonl" STRIPE_SECRET_KEY=sk_test_private_fixture \
  STRIPE_WEBHOOK_SECRET=whsec_private_fixture node --test server/scripts/test-care-preview.mjs
