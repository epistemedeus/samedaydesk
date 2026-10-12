#!/usr/bin/env bash
# Fixture/test provenance: disposable Postgres for services/earned-work.
# Not production. Not a hosted exchange.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

URL="${EARNED_WORK_DATABASE_URL:-postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test}"

echo "earned-work pg-fixture provenance=fixture"

psql_ok() {
  command -v psql >/dev/null 2>&1 && psql "$URL" -c 'SELECT 1' >/dev/null 2>&1
}

if psql_ok; then
  echo "using existing disposable Postgres at $URL"
  echo "EARNED_WORK_DATABASE_URL=$URL"
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  docker compose up -d --wait
  echo "started docker-compose Postgres (tmpfs, fixture)"
  echo "EARNED_WORK_DATABASE_URL=$URL"
  exit 0
fi

PG_BIN=""
for cand in /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin /usr/pgsql-16/bin; do
  if [[ -x "$cand/initdb" && -x "$cand/pg_ctl" ]]; then
    PG_BIN="$cand"
    break
  fi
done
if [[ -z "$PG_BIN" ]] && command -v initdb >/dev/null 2>&1; then
  PG_BIN="$(dirname "$(command -v initdb)")"
fi
if [[ -z "$PG_BIN" ]]; then
  echo "no reachable Postgres at $URL, docker is not available, and no local initdb" >&2
  exit 1
fi

DATA="${EARNED_WORK_PGDATA:-/tmp/earned-work-pgdata}"
LOG="${EARNED_WORK_PGLOG:-/tmp/earned-work-pg.log}"
mkdir -p "$DATA"

if [[ ! -f "$DATA/PG_VERSION" ]]; then
  "$PG_BIN/initdb" -D "$DATA" --auth=trust --username=earned_work --encoding=UTF8 --no-locale
  cat >> "$DATA/postgresql.conf" <<CONF
port = 55432
listen_addresses = '127.0.0.1'
unix_socket_directories = '$DATA'
CONF
fi

if ! "$PG_BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$DATA" -l "$LOG" -w start
fi

if ! "$PG_BIN/psql" -h 127.0.0.1 -p 55432 -U earned_work -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='earned_work_test'" | grep -q 1; then
  "$PG_BIN/createdb" -h 127.0.0.1 -p 55432 -U earned_work earned_work_test
fi

if ! psql_ok; then
  echo "local Postgres started but $URL is not reachable" >&2
  exit 1
fi

echo "started local disposable Postgres at $URL"
echo "EARNED_WORK_DATABASE_URL=$URL"
