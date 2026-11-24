#!/usr/bin/env bash
# The paid intake, invoice replay and cancellation test (server/scripts/test-care-preview.mjs), then the
# non-card invoice route (test-care-invoice.mjs), one after the other on one throwaway local PostgreSQL,
# with fixture Stripe values (no Stripe call) and the preview mail outbox.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ $# -gt 1 || ( $# -eq 1 && $1 != --watch-only ) ]]; then
  printf '%s\n' 'Usage: care-preview-test.sh [--watch-only]' >&2
  exit 2
fi
files=(server/scripts/test-skill-watch-tick.mjs server/scripts/test-skill-watch-order.mjs)
if [[ $# -eq 0 ]]; then
  files=(server/scripts/test-care-preview.mjs server/scripts/test-care-invoice.mjs server/scripts/test-care-usdc.mjs server/scripts/test-legacy-order.mjs "${files[@]}")
fi
pg_bin="$(pg_config --bindir)"
pg_root="$(mktemp -d)"
"$pg_bin/initdb" -A trust -D "$pg_root/data" > /dev/null
"$pg_bin/pg_ctl" -D "$pg_root/data" -l "$pg_root/log" -o "-F -p 55493 -k $pg_root -c listen_addresses=''" -w start > /dev/null
trap '"$pg_bin/pg_ctl" -D "$pg_root/data" -m immediate -w stop > /dev/null; rm -rf "$pg_root"' EXIT
dsn="postgresql://$(id -un)@127.0.0.1/postgres?host=$pg_root&port=55493"
node server/scripts/care-enrollment.mjs sds_care_fixture sds_care_fixture_app > "$pg_root/enrollment.sql"
psql -X -q -v ON_ERROR_STOP=1 "$dsn" -f "$pg_root/enrollment.sql"
app_dsn="postgresql://sds_care_fixture_app@127.0.0.1/postgres?host=$pg_root&port=55493"
for file in "${files[@]}"; do
  env -i PATH="$PATH" HOME="$pg_root" TMPDIR="$pg_root" NODE_ENV=production SDS_PRIVATE_PREVIEW=1 SDS_CARE_DATABASE_URL="$app_dsn" SDS_CARE_SCHEMA=sds_care_fixture \
    SKILLGUARD_SOURCE="${SKILLGUARD_SOURCE:-}" SDS_PREVIEW_MAIL_OUTBOX="$pg_root/outbox.jsonl" STRIPE_SECRET_KEY=sk_test_private_fixture \
    SDS_CARE_CHECKOUT=1 SDS_CARE_ACCESS_SECRET=synthetic-preview-watch-access-secret-only SDS_TEST_WATCH_PUBLIC_RELEASE="${SDS_TEST_WATCH_PUBLIC_RELEASE:-}" \
    STRIPE_WEBHOOK_SECRET=whsec_private_fixture node --test "$file"
done
