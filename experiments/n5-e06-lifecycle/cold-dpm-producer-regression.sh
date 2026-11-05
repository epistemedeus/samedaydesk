#!/usr/bin/env bash
# Focused producer/gate regressions for cold-dpm.sh (no successful D/P/M reinstall).
# Cases: positive all-PASS gate exit 0; failure FAIL nonzero; copied-source executed=unknown.
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SRC="$SCRIPT_DIR/cold-dpm.sh"
ROOT=$(mktemp -d /tmp/cold-dpm-reg-XXXXXX)
PASS=0
FAIL=0
ok() { echo "PASS $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL $1: $2"; FAIL=$((FAIL+1)); }

# --- 1) positive gate ---
O1="$ROOT/pos"
mkdir -p "$O1"
cat > "$O1/summary.tsv" <<'TSV'
route	status	detail
D	PASS	digest=0ea6c814c944ec14
P	PASS	digest=0ea6c814c944ec14
M	PASS	digest=0ea6c814c944ec14
REFUSE_146	PASS	install_nonzero
REFUSE_BADSHA	PASS	sha_nonzero
REFUSE_TRUNC	PASS	install_nonzero
TSV
set +e
COLD_DPM_MODE=receipt-gate COLD_DPM_OUT="$O1" bash "$SRC" "$ROOT" >"$O1/run.log" 2>&1
EC1=$?
set -e
HEAD1=$(sed -n 's/.*"head":"\([^"]*\)".*/\1/p' "$O1/RECEIPT.json" | head -1)
# From tracked checkout, head should not be the hardcoded historical runner unless HEAD is that.
PROOF1=$(sed -n 's/.*"proof":"\([^"]*\)".*/\1/p' "$O1/RECEIPT.json" | head -1)
QUAL1=$(grep -c 'qualifiedHistorical' "$O1/RECEIPT.json" || true)
if [ "$EC1" -eq 0 ] && [ "$QUAL1" -ge 1 ] && [ "$PROOF1" != "" ]; then ok "positive-gate ec=0 proof=$PROOF1"; else bad "positive-gate" "ec=$EC1 proof=$PROOF1"; fi
# executed head must not silently default to a3ef when RUNNER_HEAD unset and we are in git
if grep -q '"head":"a3efc2c40a246456c7909806a986442a862adfe8"' "$O1/RECEIPT.json" && [ "$PROOF1" = "unproven-detached-copy" ]; then
  bad "positive-gate" "historical runner used as executed head on unproven copy"
elif [ "$PROOF1" = "git-rev-parse+blob-match" ] || [ "$PROOF1" = "git-rev-parse+script-dirty-or-copied" ] || [ "$PROOF1" = "unproven-detached-copy" ]; then
  ok "executed-separate-from-default-hardcode proof=$PROOF1 head=$HEAD1"
else
  bad "executed-proof" "unexpected proof=$PROOF1"
fi

# --- 2) failure gate nonzero ---
O2="$ROOT/fail"
mkdir -p "$O2"
cat > "$O2/summary.tsv" <<'TSV'
route	status	detail
D	FAIL	digest=bad
P	PASS	digest=0ea6c814c944ec14
M	PASS	digest=0ea6c814c944ec14
REFUSE_146	PASS	install_nonzero
REFUSE_BADSHA	PASS	sha_nonzero
REFUSE_TRUNC	PASS	install_nonzero
TSV
set +e
COLD_DPM_MODE=receipt-gate COLD_DPM_OUT="$O2" bash "$SRC" "$ROOT" >"$O2/run.log" 2>&1
EC2=$?
set -e
if [ "$EC2" -ne 0 ]; then ok "failure-gate ec=$EC2"; else bad "failure-gate" "expected nonzero"; fi

# --- 3) copied source unknown ---
O3="$ROOT/copy"
mkdir -p "$O3/bin" "$O3/out"
cp "$SRC" "$O3/bin/cold-dpm.sh"
chmod +x "$O3/bin/cold-dpm.sh"
cat > "$O3/out/summary.tsv" <<'TSV'
route	status	detail
D	PASS	digest=0ea6c814c944ec14
P	PASS	digest=0ea6c814c944ec14
M	PASS	digest=0ea6c814c944ec14
REFUSE_146	PASS	install_nonzero
REFUSE_BADSHA	PASS	sha_nonzero
REFUSE_TRUNC	PASS	install_nonzero
TSV
set +e
COLD_DPM_MODE=receipt-gate COLD_DPM_OUT="$O3/out" bash "$O3/bin/cold-dpm.sh" "$ROOT" >"$O3/run.log" 2>&1
EC3=$?
set -e
HEAD3=$(python3 -c 'import json;print(json.load(open("'"$O3/out/RECEIPT.json"'"))["executed"]["head"])')
PROOF3=$(python3 -c 'import json;print(json.load(open("'"$O3/out/RECEIPT.json"'"))["executed"]["proof"])')
if [ "$EC3" -eq 0 ] && [ "$HEAD3" = "unknown" ] && [ "$PROOF3" = "unproven-detached-copy" ]; then
  ok "copied-source head=unknown"
else
  bad "copied-source" "ec=$EC3 head=$HEAD3 proof=$PROOF3"
fi

# --- 4) RUNNER_HEAD override is explicit proof ---
O4="$ROOT/over"
mkdir -p "$O4"
cp "$O1/summary.tsv" "$O4/summary.tsv"
set +e
RUNNER_HEAD=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef COLD_DPM_MODE=receipt-gate COLD_DPM_OUT="$O4" bash "$SRC" "$ROOT" >"$O4/run.log" 2>&1
EC4=$?
set -e
PROOF4=$(python3 -c 'import json;print(json.load(open("'"$O4/RECEIPT.json"'"))["executed"]["proof"])')
HEAD4=$(python3 -c 'import json;print(json.load(open("'"$O4/RECEIPT.json"'"))["executed"]["head"])')
if [ "$EC4" -eq 0 ] && [ "$PROOF4" = "RUNNER_HEAD-override" ] && [ "$HEAD4" = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" ]; then
  ok "override-explicit"
else
  bad "override" "ec=$EC4 proof=$PROOF4 head=$HEAD4"
fi

echo "ROOT=$ROOT PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
