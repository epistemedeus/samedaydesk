#!/usr/bin/env bash
# SCALE-1158 B6 Recurring Decisions acceptance (model-free). Owner: ea22387e
# Amend tip d7b5fdda: provision merchant pin for recipes; do not mask suite failures.
set -euo pipefail
HOST_AGENT="${HOST_AGENT:-bc-f965c6ce-3db1-557c-a4a2-2f6b9b6d9d27}"
TIP="${TIP:-d7b5fdda0c6330038aa5118050973f87c9867b00}"
BRANCH="${BRANCH:-codex/n7-recurring-decisions-20261105}"
ROOT="${ROOT:-/tmp/n4-team/recurring}"
REPO_DIR="${ROOT}/samedaydesk"
MERCHANT_REPO="${MERCHANT_REPO:-https://github.com/epistemedeus/x402-url-extractor.git}"
MERCHANT_PIN="${MERCHANT_PIN:-f9dd59aeeb200881bc1313ed846ba002e7081258}"
MERCHANT_DIR="${MERCHANT_DIR:-/tmp/merchant-input/x402-url-extractor}"
OUT="${ROOT}/acceptance-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT" "$ROOT" "$(dirname "$MERCHANT_DIR")"
{
  echo "host_agent=$HOST_AGENT"
  echo "hostname=$(hostname)"
  echo "boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
  echo "started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "tip=$TIP"
  echo "branch=$BRANCH"
  echo "repo_dir=$REPO_DIR"
  echo "merchant_dir=$MERCHANT_DIR"
  echo "merchant_pin=$MERCHANT_PIN"
} | tee "$OUT/META.txt"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone --filter=blob:none https://github.com/epistemedeus/samedaydesk.git "$REPO_DIR" 2>&1 | tee "$OUT/clone.log"
fi
cd "$REPO_DIR"
git fetch origin "$BRANCH" "$TIP" 2>&1 | tee "$OUT/fetch.log" || true
git checkout --detach "$TIP" 2>&1 | tee "$OUT/checkout.log"
git rev-parse HEAD | tee "$OUT/HEAD.txt"

# Merchant checkout at pin (git only; never npm-install x402-merchant from registry).
echo "=== merchant provision ===" | tee -a "$OUT/COMMANDS.txt"
if [[ ! -d "$MERCHANT_DIR/.git" ]]; then
  echo "+ git clone --filter=blob:none $MERCHANT_REPO $MERCHANT_DIR" | tee -a "$OUT/COMMANDS.txt"
  git clone --filter=blob:none "$MERCHANT_REPO" "$MERCHANT_DIR" 2>&1 | tee "$OUT/merchant-clone.log"
fi
(
  cd "$MERCHANT_DIR"
  echo "+ git fetch origin $MERCHANT_PIN" | tee -a "$OUT/COMMANDS.txt"
  git fetch --depth 1 origin "$MERCHANT_PIN" 2>&1 | tee "$OUT/merchant-fetch.log" || \
    git fetch origin "$MERCHANT_PIN" 2>&1 | tee -a "$OUT/merchant-fetch.log"
  echo "+ git checkout --detach $MERCHANT_PIN" | tee -a "$OUT/COMMANDS.txt"
  git checkout --detach "$MERCHANT_PIN" 2>&1 | tee "$OUT/merchant-checkout.log"
  git rev-parse HEAD | tee "$OUT/MERCHANT_HEAD.txt"
  # Local tree deps only (express/ajv for mounted fixtures). Not registry package install.
  if [[ ! -d node_modules/express ]]; then
    echo "+ npm install --omit=dev (merchant local tree)" | tee -a "$OUT/COMMANDS.txt"
    npm install --omit=dev 2>&1 | tee "$OUT/merchant-npm.log"
  fi
  if [[ ! -d examples/customer-x402/node_modules/ajv ]]; then
    echo "+ npm install --omit=dev (customer-x402 local tree)" | tee -a "$OUT/COMMANDS.txt"
    (cd examples/customer-x402 && npm install --omit=dev) 2>&1 | tee "$OUT/merchant-customer-npm.log"
  fi
  node -e 'const p=require("./package.json"); if (p.name!=="x402-merchant") process.exit(2); console.log("merchant_package="+p.name)' | tee -a "$OUT/MERCHANT_HEAD.txt"
)
export MERCHANT_INPUT_ROOT="$MERCHANT_DIR"

set +e
echo "=== package tests ===" | tee -a "$OUT/COMMANDS.txt"
CMD1='node --test tools/recurring-decision-consumer/test/*.test.mjs'
echo "+ $CMD1" | tee -a "$OUT/COMMANDS.txt"
bash -lc "$CMD1" 2>&1 | tee "$OUT/package-tests.log"
EC1=$?
echo "exit_package=$EC1" | tee -a "$OUT/EXITS.txt"

echo "=== test:recurring-job-recipes ===" | tee -a "$OUT/COMMANDS.txt"
CMD2='npm run test:recurring-job-recipes'
echo "+ $CMD2" | tee -a "$OUT/COMMANDS.txt"
bash -lc "export MERCHANT_INPUT_ROOT='$MERCHANT_DIR'; $CMD2" 2>&1 | tee "$OUT/recurring-job-recipes.log"
EC2=$?
echo "exit_recurring_job_recipes=$EC2" | tee -a "$OUT/EXITS.txt"

echo "=== test:result-reuse ===" | tee -a "$OUT/COMMANDS.txt"
CMD3='npm run test:result-reuse'
echo "+ $CMD3" | tee -a "$OUT/COMMANDS.txt"
bash -lc "$CMD3" 2>&1 | tee "$OUT/result-reuse.log"
EC3=$?
echo "exit_result_reuse=$EC3" | tee -a "$OUT/EXITS.txt"

echo "finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$OUT/META.txt"
echo "OUT=$OUT"
echo "SUMMARY: package=$EC1 recipes=$EC2 reuse=$EC3" | tee "$OUT/SUMMARY.txt"
# overall: any suite failure must fail the wrapper (do not mask with EXIT0)
exit $(( EC1 != 0 || EC2 != 0 || EC3 != 0 ? 1 : 0 ))
