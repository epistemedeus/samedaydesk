#!/usr/bin/env bash
# Fixture provenance: start disposable Postgres + HTTP kernel, run curl journey.
# Not production. Not settlement.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export EARNED_WORK_OWNER_TOKEN="${EARNED_WORK_OWNER_TOKEN:-dev-owner-token-s275}"
export EARNED_WORK_DATABASE_URL="${EARNED_WORK_DATABASE_URL:-postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test}"
export PORT="${PORT:-8791}"
export EARNED_WORK_BASE_URL="${EARNED_WORK_BASE_URL:-http://127.0.0.1:${PORT}}"

./scripts/pg-fixture.sh

if [[ ! -d node_modules ]]; then
  npm ci
fi
if [[ ! -d dist ]]; then
  npm run build
fi

server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

EARNED_WORK_OWNER_TOKEN="$EARNED_WORK_OWNER_TOKEN" \
EARNED_WORK_DATABASE_URL="$EARNED_WORK_DATABASE_URL" \
PORT="$PORT" \
  node dist/index.js &
server_pid=$!

./scripts/curl-journey.sh
