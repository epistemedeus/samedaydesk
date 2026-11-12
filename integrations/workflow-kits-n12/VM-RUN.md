# VM run (model-free)

Run on the Cursor VM assigned by VM Console. No model calls are needed. Source:
`epistemedeus/samedaydesk`, branch `codex/n12-workflow-kits-20261112`, path
`integrations/workflow-kits-n12/`.

## Required

```sh
set -eu
node --version                      # expect v22.x (tested locally on v22.23.2)
git clone --filter=blob:none --no-checkout https://github.com/epistemedeus/samedaydesk.git sds-wk-n12
cd sds-wk-n12
git fetch origin codex/n12-workflow-kits-20261112
git checkout <HEAD_SHA>             # the exact head reported with this branch
git sparse-checkout set integrations/workflow-kits-n12
cd integrations/workflow-kits-n12
node scripts/vendor-sync.mjs --check
node scripts/build-artifacts.mjs --check
node scripts/compute-comparison.mjs --check
node --test 2>&1 | tee ../../wk-n12-node-test.txt
```

`node --test` also runs the vendored PR 682 and PR 684 suites.

## Optional: upstream FlowAssert CLI, pinned

```sh
python3 -m venv .venv-flowassert
. .venv-flowassert/bin/activate
pip install "git+https://github.com/Sun-sh902/FlowAssert@3960c04dc3ee39138ed918c2226194638e13422a#subdirectory=offline"
flowassert-verify --source vendor/flowassert/offline/examples/source.csv \
  --destination vendor/flowassert/offline/examples/destination.csv \
  --key external_id --field phone --field email:hs_email; echo "exit=$?"   # expect exit=1 (Mismatch)
flowassert-verify --source vendor/flowassert/offline/examples/source.csv \
  --destination fixtures/flowassert/destination-complete.csv \
  --key external_id --field phone --field email:hs_email \
  --source-complete --destination-complete; echo "exit=$?"                # expect exit=0 (Verified)
deactivate
```

## Optional: self-hosted n8n import and execution, pinned

Uses n8n 2.46.4, the version upstream FlowAssert's Code-node example was tested on.
Local only; this is not n8n Cloud.

```sh
export N8N_USER_FOLDER="$PWD/.n8n-wk-n12"
PORT=8787 node bin/serve.mjs > serve.log 2>&1 &
node -e '
const fs = require("fs");
const w = JSON.parse(fs.readFileSync("n8n/record-to-accepted-output.workflow.json", "utf8"));
w.id = "sdsWkN12Rta00001";
w.nodes.find((n) => n.name === "Kit Settings").parameters.assignments.assignments[0].value = "http://127.0.0.1:8787";
fs.writeFileSync("/tmp/wk-n12-local.workflow.json", JSON.stringify(w));
'
npx --yes n8n@2.46.4 import:workflow --input=/tmp/wk-n12-local.workflow.json
npx --yes n8n@2.46.4 update:workflow --id=sdsWkN12Rta00001 --active=true
npx --yes n8n@2.46.4 start > n8n.log 2>&1 &
sleep 20
node --input-type=module -e '
import { periodNWebhookBody } from "./scripts/build-artifacts.mjs";
const res = await fetch("http://127.0.0.1:5678/webhook/samedaydesk-record-to-accepted-output", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(periodNWebhookBody()) });
console.log(res.status, await res.text());
'
```

Expected: HTTP 200 with `period.decision` `accept` and a `delivery` with
`duplicate: false`. Posting the same body again should return `period.retry.recovered`
`true`, `secondEffect` `false` and `duplicate: true`. If `update:workflow --active` is
not available in that n8n version, activate the workflow in the editor at
http://127.0.0.1:5678 and repeat the POST. Export the execution with
`npx n8n@2.46.4 export:workflow --id=sdsWkN12Rta00001` and the execution JSON from the
public API if enabled, and keep `serve.log` and `n8n.log`.

## Not run here

No Make or n8n Cloud import. That needs the operator's explicit go-ahead.
