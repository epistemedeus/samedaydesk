#!/usr/bin/env bash
# PR363 cold D/P/M + refuse on enrolled model-free Terminal (OWNED_BY=RD).
# Invoke shape matches E06 npm consumer: cwd=node_modules/useful-jobs, samples/ relative.
#
# RECEIPT fields:
#   executed.*     = actual source identity of THIS run (unknown if unproven)
#   qualifiedHistorical.* = declared cold-received qualification pins (not this run's head)
# Exit nonzero if any required summary row is FAIL.
set -u
ROOT="${1:-/tmp/n4-team/rd}"
MODE="${COLD_DPM_MODE:-full}"   # full | receipt-gate (reuse existing OUT; no reinstall)
OUT="${COLD_DPM_OUT:-$ROOT/cold-dpm-$(date -u +%Y%m%dT%H%M%SZ)}"
URL="https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"
SHA="e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec"
EXPECT="0ea6c814c944ec14"
# Historical qualification (original cold receive). Not a future-run default head.
QUAL_RUNNER="a3efc2c40a246456c7909806a986442a862adfe8"
QUAL_TREE="ed26a99c82d6bd376de34b4d0768ab0435df5971"
QUAL_E06="a35510157235ddf9ecb32c843790756fbc30e8b7"
QUAL_SCRIPT_SHA="2b6a7230e49000513c410f4dc1813717368c8434c62cdab965a4c3269123df5e"

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

resolve_executed_source() {
  # Prefer explicit override only when set by the operator of this run.
  if [ -n "${RUNNER_HEAD:-}" ]; then
    EXEC_HEAD="$RUNNER_HEAD"
    EXEC_TREE="${RUNNER_TREE:-unknown}"
    if [ "$EXEC_TREE" = "unknown" ] && command -v git >/dev/null 2>&1; then
      if git cat-file -e "${EXEC_HEAD}^{tree}" 2>/dev/null; then
        EXEC_TREE=$(git rev-parse "${EXEC_HEAD}^{tree}" 2>/dev/null || echo unknown)
      fi
    fi
    EXEC_PROOF="RUNNER_HEAD-override"
    return
  fi
  EXEC_HEAD="unknown"
  EXEC_TREE="unknown"
  EXEC_PROOF="unproven-detached-copy"
  if ! command -v git >/dev/null 2>&1; then
    return
  fi
  local script_dir
  script_dir=$(dirname "$SCRIPT_PATH")
  # Must be inside a git work tree that tracks this script path.
  if ! git -C "$script_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return
  fi
  local top rel tracked
  top=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null) || return
  rel=${SCRIPT_PATH#"$top"/}
  if [ "$rel" = "$SCRIPT_PATH" ]; then
    return
  fi
  tracked=$(git -C "$top" ls-files --error-unmatch "$rel" 2>/dev/null) || {
    EXEC_PROOF="unproven-detached-copy"
    return
  }
  # Prove bytes match HEAD (or note dirty). Still bind HEAD as executed checkout identity.
  local head tree blob_head blob_work
  head=$(git -C "$top" rev-parse HEAD 2>/dev/null) || return
  tree=$(git -C "$top" rev-parse HEAD^{tree} 2>/dev/null) || return
  blob_head=$(git -C "$top" rev-parse "HEAD:$rel" 2>/dev/null || true)
  blob_work=$(git -C "$top" hash-object "$SCRIPT_PATH" 2>/dev/null || true)
  EXEC_HEAD="$head"
  EXEC_TREE="$tree"
  if [ -n "$blob_head" ] && [ -n "$blob_work" ] && [ "$blob_head" = "$blob_work" ]; then
    EXEC_PROOF="git-rev-parse+blob-match"
  else
    EXEC_PROOF="git-rev-parse+script-dirty-or-copied"
  fi
}

write_receipt() {
  resolve_executed_source
  local script_sha
  script_sha=$(sha256sum "$SCRIPT_PATH" 2>/dev/null | awk '{print $1}')
  {
    echo '{'
    echo '  "schema":"pilot.rd.pr363-cold-dpm.v2",'
    echo '  "pr":363,'
    echo '  "executed":{'
    echo '    "head":"'"$EXEC_HEAD"'",'
    echo '    "tree":"'"$EXEC_TREE"'",'
    echo '    "proof":"'"$EXEC_PROOF"'",'
    echo '    "scriptPath":"'"$SCRIPT_PATH"'",'
    echo '    "scriptSha256":"'"${script_sha:-unknown}"'"'
    echo '  },'
    echo '  "qualifiedHistorical":{'
    echo '    "coldRunner":"'"$QUAL_RUNNER"'",'
    echo '    "coldTree":"'"$QUAL_TREE"'",'
    echo '    "e06Base":"'"$QUAL_E06"'",'
    echo '    "scriptSha256AtCold":"'"$QUAL_SCRIPT_SHA"'",'
    echo '    "expectDigest":"'"$EXPECT"'",'
    echo '    "note":"Historical cold receive pins only. Do not treat as this run head."'
    echo '  },'
    echo '  "expectDigest":"'"$EXPECT"'",'
    echo '  "invoke":"cwd=node_modules/useful-jobs samples/ relative (E06 npm shape)",'
    echo '  "package":"useful-jobs@1.4.7",'
    echo '  "packageSha256":"'"$SHA"'",'
    echo '  "outDir":"'"$OUT"'",'
    echo '  "summaryTsv":"'"$OUT"'/summary.tsv"'
    echo '}'
  } > "$OUT/RECEIPT.json"
}

gate_exit() {
  # Nonzero if any required stage recorded FAIL.
  local fails
  fails=$(awk -F'\t' 'NR>1 && $2=="FAIL" {c++} END{print c+0}' "$OUT/summary.tsv" 2>/dev/null || echo 1)
  echo "DONE out=$OUT fails=$fails"
  cat "$OUT/summary.tsv"
  if [ "${fails:-1}" -gt 0 ]; then
    return 1
  fi
  return 0
}

run_job() {
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
  sed -n 's/.*"digest":"\([0-9a-f]\{16\}\)".*/\1/p' "$f" | head -1
}
record() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" | tee -a "$OUT/summary.tsv"
}

if [ "$MODE" = "receipt-gate" ]; then
  if [ ! -f "$OUT/summary.tsv" ]; then
    echo "receipt-gate requires COLD_DPM_OUT with summary.tsv" >&2
    exit 2
  fi
  write_receipt
  gate_exit
  exit $?
fi

mkdir -p "$OUT"
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
    record D FAIL "run_exit=$?"
  fi
else
  record D FAIL "install"
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
write_receipt
gate_exit
exit $?
