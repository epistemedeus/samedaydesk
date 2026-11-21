#!/usr/bin/env bash
# The managed route installs the unchanged client lock itself. Five explicitly
# empty frontend service inputs are identical for both exact source copies.
set -euo pipefail
cd "$1"
export NODE_OPTIONS=--max-old-space-size=512
export RAYON_NUM_THREADS=1 CARGO_BUILD_JOBS=1 UV_THREADPOOL_SIZE=1
export VITE_SUPABASE_URL='' VITE_SUPABASE_ANON_KEY='' VITE_STRIPE_PUBLISHABLE_KEY='' VITE_POSTHOG_KEY='' VITE_POSTHOG_HOST=''
export CONTRIBUTOR_JOURNEY_SOURCE_COMMIT=a0c97a594cebe73236e95caa6c4028bb36a60be9
export npm_config_audit=false npm_config_fund=false
npm run build:managed-contributor
