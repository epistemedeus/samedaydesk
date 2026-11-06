#!/usr/bin/env bash
# Ghost local runtime acceptance for workflow-owned-extensions.
# Env: ROOT OUT TIP BRANCH. Model-free. Does not print secrets.
set -uo pipefail
: "${ROOT:?}" "${OUT:?}" "${TIP:?}" "${BRANCH:?}"

GHOST_VERSION="${GHOST_VERSION:-6.75.0}"
GHOST_CLI_VERSION="${GHOST_CLI_VERSION:-1.34.1}"
GHOST_PORT="${GHOST_PORT:-2368}"
# Ghost 6.75.0 packageManager from npm view ghost@6.75.0 on registry.npmjs.org:
# pnpm@12.16.1+sha512.091d1dee7927575661b25dab3c2ae31cafc1c54d6b71ed6a6600cf0c1cb10434a447eae14015f1b23e2e6bedeed79df94a932e2164d2832280dce3fb32f656d1
# ghost-cli 1.34.1 requires bootstrap pnpm >= 11.10.0 (MINIMUM_PNPM_VERSION in
# lib/utils/pnpm.js) to install that pin. 11.28.11 is the latest pnpm 11.x
# >= 11.10.0 on registry.npmjs.org (confirmed present with dist.integrity).
PNPM_BOOTSTRAP_VERSION="${PNPM_BOOTSTRAP_VERSION:-11.28.11}"
PNPM_BOOTSTRAP_MIN="${PNPM_BOOTSTRAP_MIN:-11.10.0}"
PNPM_GHOST_PIN="${PNPM_GHOST_PIN:-12.16.1}"
REPO_URL="${REPO_URL:-https://github.com/epistemedeus/samedaydesk.git}"
export GHOST_VERSION GHOST_CLI_VERSION GHOST_PORT
export PNPM_BOOTSTRAP_VERSION PNPM_BOOTSTRAP_MIN PNPM_GHOST_PIN

mkdir -p "$OUT"
META="$OUT/batch.meta"
EXITS="$OUT/EXITS.txt"
TIMINGS="$OUT/runtime-timings.json"
PREFLIGHT="$OUT/runtime-preflight.json"
: > "$EXITS"
: > "$META"

now_ms() {
  # node -p colorizes numbers when FORCE_COLOR is set, and $(( )) then records 0.
  date +%s%3N | tr -cd '0-9'
}
record() { printf "%s %s\n" "$1" "$2" >> "$EXITS"; }
log() { printf "%s\n" "$*" | tee -a "$META"; }

write_timings() {
  node -e 'const fs=require("node:fs"); const o={runtime:"ghost",version:process.env.GHOST_VERSION||"6.75.0",installMs:Number(process.argv[1])||0,startMs:Number(process.argv[2])||0,acceptanceMs:Number(process.argv[3])||0,unitTestsMs:Number(process.argv[4])||0,cliManifestsMs:Number(process.argv[5])||0}; fs.writeFileSync(process.argv[6], JSON.stringify(o,null,2)+"\n");' \
    "$1" "$2" "$3" "$4" "$5" "$TIMINGS"
}

node_engines_ok() {
  node -e 'const p=process.versions.node.split(".").map(Number); const match=(p[0]===22 && (p[1]>23 || (p[1]===23 && p[2]>=1))) || (p[0]===24 && (p[1]>20 || (p[1]===20 && p[2]>=0))); if (!match) process.exit(1);'
}

collect_preflight_env() {
  PF_OUT="$PREFLIGHT"
  PF_ROOT="$ROOT"
  PF_NODE_RAW="$(node --version 2>/dev/null || true)"
  PF_PNPM_PATH="$(PATH="$INSTALL_PATH" command -v pnpm 2>/dev/null || true)"
  PF_PNPM_VERSION="$(PATH="$INSTALL_PATH" pnpm --version 2>/dev/null || true)"
  PF_PNPM_EXPECTED="$PNPM_BOOTSTRAP_VERSION"
  PF_PNPM_MIN="$PNPM_BOOTSTRAP_MIN"
  PF_PNPM_GHOST_PIN="$PNPM_GHOST_PIN"
  if [ -x "$GHOST_BIN" ]; then
    PF_GHOST_CLI_PATH="$GHOST_BIN"
    PF_GHOST_CLI_VERSION_RAW="$("$GHOST_BIN" --version 2>/dev/null || true)"
    if [ -z "$PF_GHOST_CLI_VERSION_RAW" ] && [ -n "${CLI_PREFIX:-}" ] && [ -f "$CLI_PREFIX/node_modules/ghost-cli/package.json" ]; then
      PF_GHOST_CLI_VERSION_RAW="$(node -e 'try { process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).version||"")); } catch { process.stdout.write(""); }' "$CLI_PREFIX/node_modules/ghost-cli/package.json")"
    fi
  else
    PF_GHOST_CLI_PATH=""
    PF_GHOST_CLI_VERSION_RAW=""
  fi
  PF_GHOST_CLI_EXPECTED="$GHOST_CLI_VERSION"
  PF_DISK_AVAIL_KB="$(df -Pk "$ROOT" 2>/dev/null | awk 'NR==2 {print $4}')"
  PF_DISK_MIN_KB="${PF_DISK_MIN_KB:-524288}"
  PF_GHOST_VERSION="$GHOST_VERSION"
  PF_BOOTSTRAP_OK="${PF_BOOTSTRAP_OK:-1}"
  PF_REASON="${PF_REASON:-}"
  export PF_OUT PF_ROOT PF_NODE_RAW PF_PNPM_PATH PF_PNPM_VERSION
  export PF_PNPM_EXPECTED PF_PNPM_MIN PF_PNPM_GHOST_PIN
  export PF_GHOST_CLI_PATH PF_GHOST_CLI_VERSION_RAW PF_GHOST_CLI_EXPECTED
  export PF_DISK_AVAIL_KB PF_DISK_MIN_KB PF_GHOST_VERSION PF_BOOTSTRAP_OK PF_REASON
}

write_preflight() {
  node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function parseVer(raw) {
  const m = String(raw || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function nodeMatches(raw) {
  const p = parseVer(raw);
  if (!p) return false;
  if (p[0] === 22 && cmp(p, [22, 23, 1]) >= 0) return true;
  if (p[0] === 24 && cmp(p, [24, 20, 0]) >= 0) return true;
  return false;
}

function isTaskLocal(pnpmPath, root) {
  if (!pnpmPath || !root) return false;
  const prefix = path.join(root, "toolchain");
  try {
    const realPnpm = fs.realpathSync(pnpmPath);
    const realPrefix = fs.realpathSync(prefix);
    return realPnpm === realPrefix || realPnpm.startsWith(realPrefix + path.sep);
  } catch {
    return String(pnpmPath) === prefix || String(pnpmPath).startsWith(prefix + path.sep);
  }
}

const nodeRaw = process.env.PF_NODE_RAW || "";
const nodeVersion = (parseVer(nodeRaw) || []).join(".") || String(nodeRaw).replace(/^v/, "");
const engines = "^22.23.1 || ^24.20.0";
const enginesMatch = nodeMatches(nodeRaw);
const pnpmPath = process.env.PF_PNPM_PATH || "";
const pnpmVersion = String(process.env.PF_PNPM_VERSION || "").trim();
const pnpmExpected = process.env.PF_PNPM_EXPECTED || "11.28.11";
const pnpmMin = process.env.PF_PNPM_MIN || "11.10.0";
const ghostPin = process.env.PF_PNPM_GHOST_PIN || "12.16.1";
const root = process.env.PF_ROOT || "";
const ghostCliRaw = process.env.PF_GHOST_CLI_VERSION_RAW || "";
const ghostCliExpected = process.env.PF_GHOST_CLI_EXPECTED || "1.34.1";
const ghostCliParsed = parseVer(ghostCliRaw);
const ghostCliVersion = ghostCliParsed ? ghostCliParsed.join(".") : "";
const ghostCliPath = process.env.PF_GHOST_CLI_PATH || "";
const diskKb = process.env.PF_DISK_AVAIL_KB || "";
const diskMinKb = Number(process.env.PF_DISK_MIN_KB || "524288");
const diskAvail = diskKb === "" ? null : Number(diskKb);
const bootstrapOk = process.env.PF_BOOTSTRAP_OK !== "0";
const pnpmParsed = parseVer(pnpmVersion);
const minParsed = parseVer(pnpmMin);

let reason = process.env.PF_REASON || "";
if (!reason) {
  if (!enginesMatch) reason = "node_engine_mismatch";
  else if (!bootstrapOk) reason = "pnpm_bootstrap_failed";
  else if (!pnpmPath) reason = "pnpm_missing";
  else if (!isTaskLocal(pnpmPath, root)) reason = "pnpm_path_not_task_local";
  else if (pnpmParsed && minParsed && cmp(pnpmParsed, minParsed) < 0) reason = "pnpm_version_too_old";
  else if (pnpmVersion !== pnpmExpected) reason = "pnpm_version_mismatch";
  else if (!ghostCliPath || !ghostCliVersion) reason = "ghost_cli_missing";
  else if (ghostCliVersion !== ghostCliExpected) reason = "ghost_cli_version_mismatch";
  else if (diskAvail !== null && Number.isFinite(diskAvail) && diskAvail < diskMinKb) reason = "disk_space_insufficient";
}

const ok = !reason;
const out = {
  ok,
  reason: reason || null,
  node: {
    version: nodeVersion,
    raw: nodeRaw,
    engines,
    enginesMatch
  },
  pnpm: {
    path: pnpmPath || null,
    version: pnpmVersion || null,
    commandWhich: pnpmPath || null,
    reportedVersion: pnpmVersion || null,
    expectedVersion: pnpmExpected,
    minimumVersion: pnpmMin,
    ghostPackageManager: "pnpm@" + ghostPin,
    taskLocal: isTaskLocal(pnpmPath, root)
  },
  ghostCli: {
    path: ghostCliPath || null,
    version: ghostCliVersion || null,
    raw: ghostCliRaw || null,
    expectedVersion: ghostCliExpected
  },
  disk: {
    target: root,
    availableKb: Number.isFinite(diskAvail) ? diskAvail : null,
    minimumKb: diskMinKb
  },
  ghostVersion: process.env.PF_GHOST_VERSION || "6.75.0",
  sources: {
    ghostPackageManager: "npm view ghost@6.75.0 packageManager on registry.npmjs.org",
    pnpmBootstrap: "latest pnpm 11.x >= 11.10.0 on registry.npmjs.org",
    minimumBootstrap: "ghost-cli 1.34.1 lib/utils/pnpm.js MINIMUM_PNPM_VERSION"
  }
};
fs.writeFileSync(process.env.PF_OUT, JSON.stringify(out, null, 2) + "\n");
process.exit(ok ? 0 : 1);
NODE
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
PF_BOOTSTRAP_OK="1"
PF_REASON=""
INSTALL_PATH="$PATH"

log "hostname=$(hostname 2>/dev/null || echo unknown)"
log "boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
log "tip_expected=$TIP"
log "branch=$BRANCH"
log "node=$(node --version 2>&1)"
log "ghost_version=$GHOST_VERSION"
log "ghost_cli_version=$GHOST_CLI_VERSION"
log "pnpm_bootstrap_version=$PNPM_BOOTSTRAP_VERSION"
log "pnpm_ghost_pin=$PNPM_GHOST_PIN"

if ! node_engines_ok 2>/dev/null; then
  log "node_engine=unsupported_for_ghost_${GHOST_VERSION}"
  GHOST_BIN=""
  PF_REASON="node_engine_mismatch"
  collect_preflight_env
  write_preflight >/dev/null 2>&1 || true
  record runtime_preflight 1
  record runtime_install 1
  record runtime_start 1
  record runtime_acceptance 1
  record unit_tests 1
  record cli_manifests 1
  echo "node >= 22.23.1 or >= 24.20.0 is required for Ghost ${GHOST_VERSION}" >> "$OUT/test.log"
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
TOOLCHAIN="$ROOT/toolchain"
TOOLCHAIN_BIN="$TOOLCHAIN/node_modules/.bin"
INSTALL_PATH="${TOOLCHAIN_BIN}:${PATH}"
mkdir -p "$RUNTIME_HOME" "$CLI_PREFIX" "$GHOST_DIR" "$TOOLCHAIN"

STARTED=0
cleanup() {
  if [ "${STARTED}" = "1" ] && [ -x "$GHOST_BIN" ] && [ -d "$GHOST_DIR" ]; then
    "$GHOST_BIN" stop --dir "$GHOST_DIR" --no-prompt >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -x "$TOOLCHAIN_BIN/pnpm" ] && [ "$("$TOOLCHAIN_BIN/pnpm" --version 2>/dev/null || true)" = "$PNPM_BOOTSTRAP_VERSION" ]; then
  log "pnpm_bootstrap=already_${PNPM_BOOTSTRAP_VERSION}"
  PF_BOOTSTRAP_OK="1"
else
  if ! npm install --prefix "$TOOLCHAIN" "pnpm@${PNPM_BOOTSTRAP_VERSION}" > "$OUT/runtime-toolchain.log" 2>&1; then
    PF_BOOTSTRAP_OK="0"
    log "pnpm_bootstrap=failed"
  else
    PF_BOOTSTRAP_OK="1"
    log "pnpm_bootstrap=${PNPM_BOOTSTRAP_VERSION}"
  fi
fi

install_t0="$(now_ms)"
install_code=0
if [ ! -x "$GHOST_BIN" ]; then
  if ! npm install --prefix "$CLI_PREFIX" "ghost-cli@${GHOST_CLI_VERSION}" > "$OUT/runtime-install.log" 2>&1; then
    install_code=1
  fi
fi

collect_preflight_env
if ! write_preflight; then
  record runtime_preflight 1
  preflight_reason="$(node -e 'try { const j=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.reason||"unknown")); } catch { process.stdout.write("unknown"); }' "$PREFLIGHT")"
  log "runtime_preflight=failed reason=${preflight_reason}"
  echo "runtime_preflight failed: ${preflight_reason}" >> "$OUT/runtime-install.log"
  install_code=1
else
  record runtime_preflight 0
  log "runtime_preflight=ok"
  log "pnpm_which=${PF_PNPM_PATH}"
  log "pnpm_version=${PF_PNPM_VERSION}"
fi

if [ "$install_code" -eq 0 ] && [ ! -f "$GHOST_DIR/config.development.json" ] && [ ! -f "$GHOST_DIR/.ghost-cli" ]; then
  if ! PATH="$INSTALL_PATH" "$GHOST_BIN" install "$GHOST_VERSION" --local --dir "$GHOST_DIR" --no-start --port "$GHOST_PORT" --ip 127.0.0.1 --url "http://127.0.0.1:${GHOST_PORT}" --db sqlite3 --no-prompt >> "$OUT/runtime-install.log" 2>&1; then
    if ! PATH="$INSTALL_PATH" "$GHOST_BIN" install "$GHOST_VERSION" --local --dir "$GHOST_DIR" --no-start --port "$GHOST_PORT" --ip 127.0.0.1 --no-prompt >> "$OUT/runtime-install.log" 2>&1; then
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
