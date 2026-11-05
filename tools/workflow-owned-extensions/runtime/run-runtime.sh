#!/usr/bin/env bash
# Ghost local runtime acceptance for workflow-owned-extensions.
# Env: ROOT OUT TIP BRANCH. Model-free. Does not print secrets.
set -uo pipefail
: "${ROOT:?}" "${OUT:?}" "${TIP:?}" "${BRANCH:?}"

GHOST_VERSION="${GHOST_VERSION:-6.75.0}"
GHOST_CLI_VERSION="${GHOST_CLI_VERSION:-1.34.1}"
GHOST_PORT="${GHOST_PORT:-2368}"
REPO_URL="${REPO_URL:-https://github.com/epistemedeus/samedaydesk.git}"
export GHOST_VERSION GHOST_CLI_VERSION GHOST_PORT

mkdir -p "$OUT"
META="$OUT/batch.meta"
EXITS="$OUT/EXITS.txt"
TIMINGS="$OUT/runtime-timings.json"
: > "$EXITS"
: > "$META"

now_ms() { node -p "Date.now()"; }
record() { printf "%s %s\n" "$1" "$2" >> "$EXITS"; }
log() { printf "%s\n" "$*" | tee -a "$META"; }

write_timings() {
  node -e 'const fs=require("node:fs"); const o={runtime:"ghost",version:process.env.GHOST_VERSION||"6.75.0",installMs:Number(process.argv[1])||0,startMs:Number(process.argv[2])||0,acceptanceMs:Number(process.argv[3])||0,unitTestsMs:Number(process.argv[4])||0,cliManifestsMs:Number(process.argv[5])||0}; fs.writeFileSync(process.argv[6], JSON.stringify(o,null,2)+"\n");' \
    "$1" "$2" "$3" "$4" "$5" "$TIMINGS"
}

finish() {
  local code="$1"
  write_timings "${INSTALL_MS:-0}" "${START_MS:-0}" "${ACCEPT_MS:-0}" "${UNIT_MS:-0}" "${CLI_MS:-0}"
  sha256sum "$OUT"/* > "$OUT/SHA256SUMS" 2>/dev/null || true
  if [ -f "$EXITS" ]; then cat "$EXITS"; fi
  exit "$code"
}

wait_for_ghost() {
  local deadline=$((SECONDS + 180))
  local candidate
  while [ "$SECONDS" -lt "$deadline" ]; do
    for candidate in "http://127.0.0.1:${GHOST_PORT}" "http://localhost:${GHOST_PORT}"; do
      if node --input-type=module -e 'try { await fetch(process.argv[1]+"/ghost/",{signal:AbortSignal.timeout(2000),redirect:"manual"}); process.exit(0); } catch { process.exit(1); }' "$candidate"; then
        return 0
      fi
    done
    sleep 2
  done
  return 1
}

read_ghost_url() {
  if [ -f "$GHOST_DIR/config.development.json" ]; then
    local configured
    configured="$(node -e 'try { const c=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(String(c.url||"").replace(/\/+$/,"")); } catch { process.stdout.write(""); }' "$GHOST_DIR/config.development.json")"
    if [ -n "$configured" ]; then
      printf "%s" "$configured"
      return
    fi
  fi
  printf "http://127.0.0.1:%s" "$GHOST_PORT"
}

INSTALL_MS=0
START_MS=0
ACCEPT_MS=0
UNIT_MS=0
CLI_MS=0

log "hostname=$(hostname 2>/dev/null || echo unknown)"
log "boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
log "tip_expected=$TIP"
log "branch=$BRANCH"
log "node=$(node --version 2>&1)"
log "ghost_version=$GHOST_VERSION"
log "ghost_cli_version=$GHOST_CLI_VERSION"

if ! node -e 'const p=process.versions.node.split(".").map(Number); if (p[0]!==22 || p[1]<23 || (p[1]===23 && p[2]<1)) process.exit(1)' 2>/dev/null; then
  log "node_engine=unsupported_for_ghost_${GHOST_VERSION}"
  record runtime_install 1
  record runtime_start 1
  record runtime_acceptance 1
  record unit_tests 1
  record cli_manifests 1
  echo "node >= 22.23.1 is required for Ghost ${GHOST_VERSION}" >> "$OUT/test.log"
  finish 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_FROM_SCRIPT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO=""
if [ -d "$ROOT/repo/.git" ]; then
  REPO="$ROOT/repo"
elif [ -d "$PACKAGE_FROM_SCRIPT/../../.git" ] && [ -f "$PACKAGE_FROM_SCRIPT/runtime/run-runtime.sh" ]; then
  REPO="$(cd "$PACKAGE_FROM_SCRIPT/../.." && pwd)"
elif [ -d "$PWD/.git" ] && [ -f "$PWD/tools/workflow-owned-extensions/runtime/run-runtime.sh" ]; then
  REPO="$PWD"
fi
if [ -z "$REPO" ]; then
  mkdir -p "$ROOT"
  if ! git clone --filter=blob:none --no-checkout "$REPO_URL" "$ROOT/repo" >> "$OUT/clone.log" 2>&1; then
    record clone 1
    finish 2
  fi
  REPO="$ROOT/repo"
fi

cd "$REPO"
if ! git fetch --no-tags origin "$BRANCH" >> "$OUT/fetch.log" 2>&1; then
  record fetch 1
  finish 3
fi
if ! git checkout -B "$BRANCH" "$TIP" >> "$OUT/checkout.log" 2>&1; then
  record checkout 1
  finish 4
fi
HEAD="$(git rev-parse HEAD)"
log "head=$HEAD"
git log -1 --oneline | tee -a "$META"
if [ "$HEAD" != "$TIP" ]; then
  record tip_mismatch 1
  finish 5
fi

PACKAGE="$REPO/tools/workflow-owned-extensions"
RUNTIME_HOME="$ROOT/runtime-home"
CLI_PREFIX="$RUNTIME_HOME/cli"
GHOST_DIR="$RUNTIME_HOME/ghost"
GHOST_BIN="$CLI_PREFIX/node_modules/.bin/ghost"
mkdir -p "$RUNTIME_HOME" "$CLI_PREFIX" "$GHOST_DIR"

STARTED=0
cleanup() {
  if [ "${STARTED}" = "1" ] && [ -x "$GHOST_BIN" ] && [ -d "$GHOST_DIR" ]; then
    "$GHOST_BIN" stop --dir "$GHOST_DIR" --no-prompt >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

install_t0="$(now_ms)"
install_code=0
if [ ! -x "$GHOST_BIN" ]; then
  if ! npm install --prefix "$CLI_PREFIX" "ghost-cli@${GHOST_CLI_VERSION}" > "$OUT/runtime-install.log" 2>&1; then
    install_code=1
  fi
fi
if [ "$install_code" -eq 0 ] && [ ! -f "$GHOST_DIR/config.development.json" ] && [ ! -f "$GHOST_DIR/.ghost-cli" ]; then
  if ! "$GHOST_BIN" install "$GHOST_VERSION" --local --dir "$GHOST_DIR" --no-start --port "$GHOST_PORT" --url "http://127.0.0.1:${GHOST_PORT}" --db sqlite3 --no-prompt >> "$OUT/runtime-install.log" 2>&1; then
    if ! "$GHOST_BIN" install "$GHOST_VERSION" --local --dir "$GHOST_DIR" --no-start --port "$GHOST_PORT" --no-prompt >> "$OUT/runtime-install.log" 2>&1; then
      install_code=1
    fi
  fi
fi
INSTALL_MS=$(( $(now_ms) - install_t0 ))
record runtime_install "$install_code"

start_code=1
if [ "$install_code" -eq 0 ]; then
  start_t0="$(now_ms)"
  if "$GHOST_BIN" status --dir "$GHOST_DIR" --no-prompt 2>/dev/null | grep -qi running; then
    start_code=0
    STARTED=1
  elif "$GHOST_BIN" start --dir "$GHOST_DIR" --no-prompt >> "$OUT/runtime-start.log" 2>&1; then
    start_code=0
    STARTED=1
  else
    start_code=1
  fi
  if [ "$start_code" -eq 0 ]; then
    if wait_for_ghost; then
      GHOST_URL="$(read_ghost_url)"
      if ! node "$PACKAGE/runtime/provision-ghost.mjs" --url "$GHOST_URL" --home "$RUNTIME_HOME" > "$OUT/runtime-provision.out" 2> "$OUT/runtime-provision.err"; then
        start_code=1
      fi
    else
      start_code=1
      echo "ghost did not become reachable within 180s" >> "$OUT/runtime-start.log"
    fi
  fi
  START_MS=$(( $(now_ms) - start_t0 ))
fi
record runtime_start "$start_code"

accept_code=1
if [ "$start_code" -eq 0 ]; then
  accept_t0="$(now_ms)"
  GHOST_URL="$(read_ghost_url)"
  export GHOST_URL
  export GHOST_ADMIN_API_KEY_FILE="$RUNTIME_HOME/admin-api-key"
  if [ -f "$RUNTIME_HOME/content-api-key" ]; then
    export GHOST_CONTENT_API_KEY_FILE="$RUNTIME_HOME/content-api-key"
  fi
  export OUT
  if node "$PACKAGE/test/runtime/acceptance.mjs" > "$OUT/runtime-acceptance.out" 2> "$OUT/runtime-acceptance.err"; then
    accept_code=0
  else
    accept_code=1
  fi
  ACCEPT_MS=$(( $(now_ms) - accept_t0 ))
fi
record runtime_acceptance "$accept_code"

unit_t0="$(now_ms)"
node --test --test-concurrency=1 "$PACKAGE/test/"*.test.mjs > "$OUT/test.log" 2>&1
unit_code=$?
UNIT_MS=$(( $(now_ms) - unit_t0 ))
record unit_tests "$unit_code"

cli_t0="$(now_ms)"
node "$PACKAGE/cli.mjs" manifests > "$OUT/manifests.out" 2> "$OUT/manifests.err"
cli_code=$?
CLI_MS=$(( $(now_ms) - cli_t0 ))
record cli_manifests "$cli_code"

write_timings "$INSTALL_MS" "$START_MS" "$ACCEPT_MS" "$UNIT_MS" "$CLI_MS"
sha256sum "$OUT"/* > "$OUT/SHA256SUMS" 2>/dev/null || true
cat "$EXITS"
! grep -qv ' 0$' "$EXITS"
