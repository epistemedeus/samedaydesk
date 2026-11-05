#!/usr/bin/env bash
# AGL VM batch v2 for samedaydesk PR364-PR367 remaining and changed stages.
# Model-free; test-only. Full writer-history fetches; no --depth=1; no fixed deepen.
set -u

BASE=/tmp/n4-team/agl
REPO=$BASE/samedaydesk
if [ -z "${OUT:-}" ]; then
  OUT=$BASE/out-v2-$(date -u +%Y%m%dT%H%M%SZ)
fi
case "$OUT" in
  /*) ;;
  *) echo "OUT must be an absolute path: $OUT" >&2; exit 9 ;;
esac
mkdir -p "$OUT"
exec > >(tee "$OUT/batch.log") 2>&1

echo "host $(hostname) user $(id -un) node $(node -v) npm $(npm -v) OUT $OUT"

BASE_SHA=9f6c0c4e396dd7677f334400eed93e3445fad600
declare -A WANT=(
  [364]=3a4a7538329292c11d94b148d58964fc0656dece
  [365]=9d1f3f9677ade404131fc62ee3e3ab99b10ec144
  [366]=95c8a84155d01d67c707170e94aa148ba6542c50
  [367]=c1d7fae74a4e10016c36d41b16f2d36ddc0737ca
)
MERCHANT_REPO=https://github.com/epistemedeus/x402-url-extractor
MERCHANT_PIN=f9dd59aeeb200881bc1313ed846ba002e7081258
MERCHANT_STORE=/tmp/merchant-input/x402-url-extractor
PG_BIN=${AE14_PG_BIN:-/usr/lib/postgresql/16/bin}

cd "$REPO" || { echo "missing clone $REPO"; exit 9; }

# Recover a shallow clone without a fixed deepen count.
if [ -f "$(git rev-parse --git-dir)/shallow" ]; then
  echo "unshallowing writer clone"
  git fetch --unshallow origin || echo "UNSHALLOW_WARN"
fi

echo "== fetch explicit PR refs (full history)"
git fetch origin \
  +refs/heads/codex/h136010-machine-release-20261103:refs/remotes/agl/base \
  +pull/364/head:refs/remotes/agl/pr364 \
  +pull/365/head:refs/remotes/agl/pr365 \
  +pull/366/head:refs/remotes/agl/pr366 \
  +pull/367/head:refs/remotes/agl/pr367 || { echo FETCH_FAIL; exit 9; }

verify_head() {
  local n=$1 ref=$2 want=${WANT[$1]}
  local h t
  h=$(git rev-parse "$ref")
  t=$(git rev-parse "$ref^{tree}")
  echo "PR$n head $h tree $t want $want" | tee -a "$OUT/SUMMARY.txt"
  if [ "$h" != "$want" ]; then
    echo "PR$n HEAD_MISMATCH" | tee -a "$OUT/SUMMARY.txt"
    return 1
  fi
  return 0
}

echo "== verify exact heads and ancestry"
heads_ok=1
for n in 364 365 366 367; do
  verify_head "$n" "agl/pr$n" || heads_ok=0
done
base_h=$(git rev-parse agl/base)
echo "BASE head $base_h want $BASE_SHA" | tee -a "$OUT/SUMMARY.txt"
if [ "$base_h" != "$BASE_SHA" ]; then
  echo "BASE HEAD_MISMATCH" | tee -a "$OUT/SUMMARY.txt"
  heads_ok=0
fi
ancestry_ok=1
for n in 364 365 367; do
  if git merge-base --is-ancestor "$BASE_SHA" "agl/pr$n"; then
    echo "ANCESTRY ok $BASE_SHA ancestor of PR$n" | tee -a "$OUT/SUMMARY.txt"
  else
    echo "ANCESTRY_FAIL $BASE_SHA not ancestor of PR$n" | tee -a "$OUT/SUMMARY.txt"
    ancestry_ok=0
  fi
done
if git merge-base --is-ancestor "${WANT[364]}" agl/pr366; then
  echo "ANCESTRY ok PR364 ancestor of PR366" | tee -a "$OUT/SUMMARY.txt"
else
  echo "ANCESTRY_FAIL PR364 not ancestor of PR366" | tee -a "$OUT/SUMMARY.txt"
  ancestry_ok=0
fi
if [ "$heads_ok" != 1 ] || [ "$ancestry_ok" != 1 ]; then
  echo "REFUSING tests: head or ancestry check failed" | tee -a "$OUT/SUMMARY.txt"
  echo AGL_BATCH_V2_DONE
  exit 8
fi

echo "== provision merchant input from real source $MERCHANT_REPO @$MERCHANT_PIN"
mkdir -p /tmp/merchant-input
if [ -d "$MERCHANT_STORE/.git" ]; then
  git -C "$MERCHANT_STORE" fetch origin
else
  git clone --no-tags "$MERCHANT_REPO" "$MERCHANT_STORE"
fi
git -C "$MERCHANT_STORE" checkout --detach "$MERCHANT_PIN"
merchant_h=$(git -C "$MERCHANT_STORE" rev-parse HEAD)
echo "MERCHANT_INPUT $MERCHANT_STORE $merchant_h want $MERCHANT_PIN" | tee -a "$OUT/SUMMARY.txt"
if [ "$merchant_h" != "$MERCHANT_PIN" ]; then
  echo "MERCHANT_PIN_MISMATCH" | tee -a "$OUT/SUMMARY.txt"
  echo AGL_BATCH_V2_DONE
  exit 8
fi
(
  cd "$MERCHANT_STORE"
  npm ci --no-audit --no-fund
  if [ -f examples/customer-x402/package.json ]; then
    cd examples/customer-x402
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  fi
) > "$OUT/merchant-input-ci.log" 2>&1
echo "merchant-input-ci rc=$?" | tee -a "$OUT/SUMMARY.txt"

run() {
  local name=$1
  shift
  echo "== $name: $*"
  ( "$@" ) > "$OUT/$name.log" 2>&1
  local rc=$?
  local sum
  sum=$(grep -E '^# (tests|pass|fail|skipped)' "$OUT/$name.log" | tr '\n' ' ')
  echo "RESULT $name rc=$rc $sum"
  echo "$name rc=$rc $sum" >> "$OUT/SUMMARY.txt"
}

add_wt() {
  local name=$1 ref=$2
  local wt=$BASE/$name
  git worktree remove -f "$wt" 2>/dev/null || true
  git worktree add -f -q --detach "$wt" "$ref"
}

add_wt wt-base agl/base
add_wt wt364 agl/pr364
add_wt wt365 agl/pr365
add_wt wt366 agl/pr366
add_wt wt367 agl/pr367

if [ ! -x "$PG_BIN/initdb" ]; then
  PG_BIN=""
  for d in /usr/lib/postgresql/*/bin; do
    [ -x "$d/initdb" ] && PG_BIN=$d
  done
fi
echo "PG_BIN=${PG_BIN:-none} AE14_PG_BIN requested /usr/lib/postgresql/16/bin" | tee -a "$OUT/SUMMARY.txt"

# Baseline on 9f6c0c4e: recipes (with real merchant input) and vendor npm test.
cd "$BASE/wt-base"
run base-npm-ci npm ci --no-audit --no-fund
run base-recipes npm run test:recurring-job-recipes
( cd vendor/hosted-wallet-market && npm ci --no-audit --no-fund ) > "$OUT/base-vendor-ci.log" 2>&1
echo "base-vendor-ci rc=$?" >> "$OUT/SUMMARY.txt"
run base-vendor-suite bash -c 'cd vendor/hosted-wallet-market && npm test'

# Recipes failed on 364/365/366 for missing merchant input; rerun with the real sibling store.
# result-reuse 41/43/51 already passed; 365 pin refresh does not change result-reuse source, so skip those.
for n in 364 365 366; do
  cd "$BASE/wt$n"
  run pr$n-npm-ci npm ci --no-audit --no-fund
  run pr$n-recipes npm run test:recurring-job-recipes
done

# PR365 remaining failures: contrib-delegation path and VM pg boot.
cd "$BASE/wt365"
run pr365-contrib-delegation node --test experiments/agl-contribution-delegation-20261104/test/*.test.mjs
if [ -n "$PG_BIN" ]; then
  run pr365-vm-pg env AE14_PG_BIN="$PG_BIN" npm run test:result-reuse:vm
else
  echo "pr365-vm-pg BLOCKED no_postgres" >> "$OUT/SUMMARY.txt"
fi

# PR367 vendor suite (amended historical assertion). Cold-client 13/13 already passed
# and its source files were not changed (GUIDE.md and capability-composition test only).
cd "$BASE/wt367"
run pr367-npm-ci npm ci --no-audit --no-fund
( cd vendor/hosted-wallet-market && npm ci --no-audit --no-fund ) > "$OUT/pr367-vendor-ci.log" 2>&1
echo "pr367-vendor-ci rc=$?" >> "$OUT/SUMMARY.txt"
run pr367-vendor-suite bash -c 'cd vendor/hosted-wallet-market && npm test'

echo "=== SUMMARY ($OUT)"
cat "$OUT/SUMMARY.txt"
echo AGL_BATCH_V2_DONE
