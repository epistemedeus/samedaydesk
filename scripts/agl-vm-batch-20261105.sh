#!/usr/bin/env bash
# AGL VM batch for samedaydesk PR364-PR367 (BOT-PRIMARY-1104). Model-free; test-only.
set -u
BASE=/tmp/n4-team/agl
REPO=$BASE/samedaydesk
OUT=$BASE/out-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT"
exec > >(tee "$OUT/batch.log") 2>&1
echo "host $(hostname) user $(id -un) node $(node -v) npm $(npm -v)"
cd "$REPO" || exit 9
git fetch -q origin pull/364/head:agl-pr364 pull/365/head:agl-pr365 pull/366/head:agl-pr366 pull/367/head:agl-pr367 -f || echo FETCH_FAIL
declare -A WANT=([364]=3a4a7538 [365]=dd47ebae [366]=95c8a841 [367]=97fba4ca)
run() { local name=$1; shift; echo "== $name: $*"; ( "$@" ) > "$OUT/$name.log" 2>&1; local rc=$?; local sum; sum=$(grep -E '^# (tests|pass|fail|skipped)' "$OUT/$name.log" | tr '\n' ' '); echo "RESULT $name rc=$rc $sum"; echo "$name rc=$rc $sum" >> "$OUT/SUMMARY.txt"; }
for n in 364 365 366 367; do
  wt=$BASE/wt$n; git worktree remove -f "$wt" 2>/dev/null; git worktree add -f -q "$wt" agl-pr$n
  h=$(git -C "$wt" rev-parse HEAD); t=$(git -C "$wt" rev-parse HEAD^{tree})
  echo "PR$n head $h tree $t want ${WANT[$n]}" | tee -a "$OUT/SUMMARY.txt"
  case $h in ${WANT[$n]}*) ;; *) echo "PR$n HEAD_MISMATCH" | tee -a "$OUT/SUMMARY.txt";; esac
done
# Postgres for PR365 VM suite
PGB=""
for d in /usr/lib/postgresql/*/bin; do [ -x "$d/initdb" ] && PGB=$d; done
if [ -z "$PGB" ] && command -v sudo >/dev/null; then sudo -n apt-get -qq update >/dev/null 2>&1 && sudo -n DEBIAN_FRONTEND=noninteractive apt-get -qq install -y postgresql >/dev/null 2>&1; for d in /usr/lib/postgresql/*/bin; do [ -x "$d/initdb" ] && PGB=$d; done; fi
echo "PG_BIN=${PGB:-none}" | tee -a "$OUT/SUMMARY.txt"
for n in 364 365 366 367; do
  wt=$BASE/wt$n; cd "$wt"
  run pr$n-npm-ci npm ci --no-audit --no-fund
  case $n in
    364|366) run pr$n-result-reuse npm run test:result-reuse; run pr$n-recipes npm run test:recurring-job-recipes ;;
    365) run pr365-result-reuse npm run test:result-reuse; run pr365-recipes npm run test:recurring-job-recipes
         run pr365-contrib-delegation node --test experiments/agl-contribution-delegation-20261104/test
         if [ -n "$PGB" ]; then run pr365-vm-pg env AE14_PG_BIN="$PGB" npm run test:result-reuse:vm; else echo "pr365-vm-pg BLOCKED no_postgres" >> "$OUT/SUMMARY.txt"; fi ;;
    367) ( cd vendor/hosted-wallet-market && npm ci --no-audit --no-fund ) > "$OUT/pr367-vendor-ci.log" 2>&1; echo "pr367-vendor-ci rc=$?" >> "$OUT/SUMMARY.txt"
         run pr367-cold-client bash -c 'cd vendor/hosted-wallet-market && node --test test/cold-client-participation.test.mjs'
         run pr367-vendor-suite bash -c 'cd vendor/hosted-wallet-market && npm test' ;;
  esac
done
cd "$BASE/wt366" && run pr366-full-npm-test npm test
echo "=== SUMMARY ($OUT)"; cat "$OUT/SUMMARY.txt"; echo AGL_BATCH_DONE
