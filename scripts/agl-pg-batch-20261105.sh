#!/usr/bin/env bash
# AGL PG16 rerun. Model-free; test-only. Full-history clone; no --depth; no fixed deepen.
# Runs only stages that need PG16, plus the PR365 delegation stage for a full log.
# Required env: W (fresh absolute workdir), OUT (fresh absolute result dir).
set -u
PG_BIN=${AE14_PG_BIN:-/usr/lib/postgresql/16/bin}
BASE_SHA=9f6c0c4e396dd7677f334400eed93e3445fad600
declare -A WANT=([365]=9d1f3f9677ade404131fc62ee3e3ab99b10ec144 [367]=c1d7fae74a4e10016c36d41b16f2d36ddc0737ca)
case "$W" in /*) ;; *) echo "W must be absolute"; exit 7;; esac
case "$OUT" in /*) ;; *) echo "OUT must be absolute"; exit 7;; esac
[ -e "$W" ] && { echo "W exists: $W"; exit 7; }
[ -e "$OUT" ] && { echo "OUT exists: $OUT"; exit 7; }
mkdir -p "$OUT"
S="$OUT/SUMMARY.txt"
echo "host $(hostname) node $(node -v) W $W OUT $OUT PG_BIN $PG_BIN" | tee -a "$S"
[ -x "$PG_BIN/initdb" ] || { echo "PG_BIN missing initdb" | tee -a "$S"; echo AGL_PG_DONE; exit 6; }
"$PG_BIN/initdb" --version | tee -a "$S"
run() { local name=$1; shift; "$@" > "$OUT/$name.log" 2>&1; local rc=$?; local t; t=$(grep -E '^# (tests|pass|fail|skipped) ' "$OUT/$name.log" | tr '\n' ' '); echo "$name rc=$rc $t" | tee -a "$S"; }
git clone --no-tags https://github.com/epistemedeus/samedaydesk.git "$W/samedaydesk" > "$OUT/clone.log" 2>&1 || { echo CLONE_FAIL | tee -a "$S"; echo AGL_PG_DONE; exit 9; }
cd "$W/samedaydesk"
[ "$(git rev-parse --is-shallow-repository)" = false ] || { echo SHALLOW_REFUSED | tee -a "$S"; echo AGL_PG_DONE; exit 9; }
git fetch origin +pull/365/head:refs/remotes/agl/pr365 +pull/367/head:refs/remotes/agl/pr367 >> "$OUT/clone.log" 2>&1 || { echo FETCH_FAIL | tee -a "$S"; echo AGL_PG_DONE; exit 9; }
ok=1
for n in 365 367; do h=$(git rev-parse agl/pr$n); echo "PR$n head $h tree $(git rev-parse agl/pr$n^{tree}) want ${WANT[$n]}" | tee -a "$S"; [ "$h" = "${WANT[$n]}" ] || ok=0; git merge-base --is-ancestor $BASE_SHA agl/pr$n || { echo "ANCESTRY_FAIL PR$n" | tee -a "$S"; ok=0; }; done
git cat-file -e $BASE_SHA^{commit} || ok=0
[ $ok = 1 ] || { echo "REFUSING head/ancestry" | tee -a "$S"; echo AGL_PG_DONE; exit 8; }
git worktree add -f -q --detach "$W/wt-base" $BASE_SHA
git worktree add -f -q --detach "$W/wt365" agl/pr365
git worktree add -f -q --detach "$W/wt367" agl/pr367
cd "$W/wt365"
run pr365-npm-ci npm ci --no-audit --no-fund
run pr365-vm-pg env AE14_PG_BIN="$PG_BIN" npm run test:result-reuse:vm
run pr365-contrib-delegation node --test experiments/agl-contribution-delegation-20261104/test/*.test.mjs
for t in base 367; do
  cd "$W/wt$( [ $t = base ] && echo -base || echo $t )"
  run pr$t-npm-ci npm ci --no-audit --no-fund
  run pr$t-vendor-ci bash -c 'cd vendor/hosted-wallet-market && npm ci --no-audit --no-fund'
  run pr$t-vendor-suite env AE14_PG_BIN="$PG_BIN" bash -c 'cd vendor/hosted-wallet-market && npm test'
  grep -n -E '^[[:space:]]*not ok' "$OUT/pr$t-vendor-suite.log" | sed "s/^/pr$t NOTOK /" | tee -a "$S"
done
grep -n -E '^[[:space:]]*not ok' "$OUT/pr365-vm-pg.log" "$OUT/pr365-contrib-delegation.log" | sed 's/^/NOTOK /' | tee -a "$S"
echo "=== SUMMARY ($OUT)"; cat "$S"
echo AGL_PG_DONE
