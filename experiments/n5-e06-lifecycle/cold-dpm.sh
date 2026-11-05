#!/usr/bin/env bash
# PR363 cold D/P/M + refuse on enrolled model-free Terminal (OWNED_BY=RD).
# Invoke shape matches E06 npm consumer: cwd=node_modules/useful-jobs, samples/ relative.
set -u
ROOT="${1:-/tmp/n4-team/rd}"
OUT="$ROOT/cold-dpm-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
URL="https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"
SHA="e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec"
EXPECT="0ea6c814c944ec14"
run_job() {
  # $1 = consumer dir that has node_modules/useful-jobs
  local cons="$1" outf="$2" errf="$3"
  (
    cd "$cons/node_modules/useful-jobs" || exit 97
    node bin/useful-jobs.mjs run vendor-budget-impact \
      --before samples/pricing/caller-alpha/before.json \
      --after samples/pricing/caller-alpha/after.json
  ) >"$outf" 2>"$errf"
}
digest_from() {
  local f="$1"
  if command -v jq >/dev/null 2>&1; then
    local d
    d=$(jq -r 'if type=="object" and has("digest") then .digest else empty end' "$f" 2>/dev/null | head -1)
    if [ -n "$d" ] && [ "$d" != "null" ]; then echo "$d"; return; fi
  fi
  # JSON one-liner without jq
  sed -n 's/.*"digest":"\([0-9a-f]\{16\}\)".*/\1/p' "$f" | head -1
}
record() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" | tee -a "$OUT/summary.tsv"
}
echo -e "route\tstatus\tdetail" > "$OUT/summary.tsv"
echo "banner=$(cat "$ROOT/OWNED_BY" 2>/dev/null || echo missing)" | tee "$OUT/banner.txt"
echo "pwd=$(pwd); node=$(node -v 2>/dev/null); npm=$(npm -v 2>/dev/null); boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)" | tee "$OUT/host.txt"
whoami; hostname; ls -la "$ROOT" | tee "$OUT/ls-root.txt"

# --- Route D ---
D="$OUT/route-d"
rm -rf "$D" && mkdir -p "$D" && cd "$D"
npm init -y >/dev/null 2>&1
if npm install "$URL" >"$OUT/d-install.log" 2>&1; then
  if run_job "$D" "$OUT/d-run.out" "$OUT/d-run.err"; then
    DG=$(digest_from "$OUT/d-run.out"); echo "$DG" >"$OUT/d-digest.txt"
    if [ "$DG" = "$EXPECT" ]; then record D PASS "digest=$DG"; else record D FAIL "digest=$DG expected=$EXPECT"; fi
  else
    record D FAIL "run_exit=$?"; cat "$OUT/d-run.err" >>"$OUT/d-run.out"
  fi
else
  record D FAIL "install"; tail -20 "$OUT/d-install.log" >"$OUT/d-install.tail"
fi

# --- Route P ---
P="$OUT/route-p"
rm -rf "$P" && mkdir -p "$P" && cd "$P"
curl -fsSL -o useful-jobs-1.4.7.tar.gz "$URL" >"$OUT/p-curl.log" 2>&1
if echo "$SHA  useful-jobs-1.4.7.tar.gz" | sha256sum -c >"$OUT/p-sha.txt" 2>&1; then
  npm init -y >/dev/null 2>&1
  if npm install ./useful-jobs-1.4.7.tar.gz >"$OUT/p-install.log" 2>&1; then
    if run_job "$P" "$OUT/p-run.out" "$OUT/p-run.err"; then
      DG=$(digest_from "$OUT/p-run.out"); echo "$DG" >"$OUT/p-digest.txt"
      if [ "$DG" = "$EXPECT" ]; then record P PASS "digest=$DG"; else record P FAIL "digest=$DG expected=$EXPECT"; fi
    else
      record P FAIL "run_exit=$?"
    fi
  else
    record P FAIL "install"
  fi
else
  record P FAIL "sha256"
fi

# --- Route M ---
M="$OUT/route-m"
rm -rf "$M" && mkdir -p "$M" && cd "$M"
npm init -y >/dev/null 2>&1
if npm install "$URL" >"$OUT/m-install.log" 2>&1; then
  if run_job "$M" "$OUT/m-run.out" "$OUT/m-run.err"; then
    DG=$(digest_from "$OUT/m-run.out"); echo "$DG" >"$OUT/m-digest.txt"
    if [ "$DG" = "$EXPECT" ]; then record M PASS "digest=$DG"; else record M FAIL "digest=$DG expected=$EXPECT"; fi
  else
    record M FAIL "run_exit=$?"
  fi
else
  record M FAIL "install"
fi

# --- Refuse: unknown 1.4.6 ---
R1="$OUT/refuse-146"; rm -rf "$R1" && mkdir -p "$R1" && cd "$R1"
npm init -y >/dev/null 2>&1
if npm install "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.6.tar.gz" >"$OUT/r146.log" 2>&1; then
  record REFUSE_146 FAIL "install_should_fail"
else
  record REFUSE_146 PASS "install_nonzero"
fi

# --- Refuse: wrong sha256 ---
R2="$OUT/refuse-badsha"; rm -rf "$R2" && mkdir -p "$R2" && cd "$R2"
curl -fsSL -o useful-jobs-1.4.7.tar.gz "$URL" >/dev/null 2>&1
if echo "0000000000000000000000000000000000000000000000000000000000000000  useful-jobs-1.4.7.tar.gz" | sha256sum -c >"$OUT/rbadsha.txt" 2>&1; then
  record REFUSE_BADSHA FAIL "sha_should_fail"
else
  record REFUSE_BADSHA PASS "sha_nonzero"
fi

# --- Refuse: truncated ---
R3="$OUT/refuse-trunc"; rm -rf "$R3" && mkdir -p "$R3" && cd "$R3"
curl -fsSL -o useful-jobs-1.4.7.tar.gz "$URL" >/dev/null 2>&1
truncate -s 1024 useful-jobs-1.4.7.tar.gz
npm init -y >/dev/null 2>&1
if npm install ./useful-jobs-1.4.7.tar.gz >"$OUT/rtrunc.log" 2>&1; then
  record REFUSE_TRUNC FAIL "install_should_fail"
else
  record REFUSE_TRUNC PASS "install_nonzero"
fi

cd "$OUT"
{
  echo '{'
  echo '  "schema":"pilot.rd.pr363-cold-dpm.v1",'
  echo '  "pr":363,'
  echo '  "head":"PENDING",'
  echo '  "expectDigest":"'"$EXPECT"'",'
  echo '  "invoke":"cwd=node_modules/useful-jobs samples/ relative (E06 npm shape)",'
  echo '  "outDir":"'"$OUT"'",'
  echo '  "summaryTsv":"'"$OUT"'/summary.tsv"'
  echo '}'
} > "$OUT/RECEIPT.json"
echo "DONE out=$OUT"
cat "$OUT/summary.tsv"
