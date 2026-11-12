# SameDayDesk workflow kits (n12)

Importable Make and n8n kits, plus client adapters, for the SameDayDesk recurring
record-to-accepted-output journey. A workflow receives a permitted record, shapes its
fields, and posts its output with the record evidence to the SameDayDesk client
endpoint. The endpoint runs the frozen journey and returns `period.*`. The workflow
then routes on that result.

Status: source kits plus recorded import evidence. An n8n Cloud QA import of the
workflow was created, read back and deleted; nothing was executed. There is no
hosted Make import yet. The tests use synthetic fixtures. No buyer, payment or
live run is claimed. Import acceptance means the workflow was imported, read
back and deleted. It is not an executed hosted workflow, and it is not paid or
commercial acceptance.

## Contents

| Path | What it is |
| --- | --- |
| `make/record-to-accepted-output.blueprint.json` | Make scenario blueprint (free built-in modules only). |
| `n8n/record-to-accepted-output.workflow.json` | n8n workflow (Code, HTTP Request, If, Wait, Respond to Webhook; no Execute Command). |
| `src/make-adapter.mjs` | Make request body or per-module output bundles to a period input. |
| `src/n8n-adapter.mjs` | n8n request body or stored execution export (`runData`) to a period input. |
| `src/period-map.mjs` | Runs the vendored journey and returns `period.*` unchanged. |
| `src/schema-adapters.mjs` | Explicit, caller-declared adapters for a later-period schema change. |
| `src/flowassert-bridge.mjs` | Upstream FlowAssert, unchanged, kept separate from acceptance. |
| `src/client-endpoint.mjs`, `bin/serve.mjs` | The client endpoint both kits post to. |
| `vendor/` | Byte-exact copies of the job contract, the recurring journey and FlowAssert, listed with sha256 in `vendor/PINS.json`. |
| `src/artifacts.mjs` | Paths and sha256 of the packaged Make and n8n files. |
| `src/direct-journey.mjs`, `scripts/direct-baseline.mjs` | The direct route: the same periods posted straight to the client endpoint, with no workflow platform. |
| `bin/workflow-kits-n12.mjs` | Command line: `hashes`, `paths`, `direct`, `serve`. |
| `COMPARISON.json` | Make, n8n and direct rows for steps, failureHandling, recovery and duplicateEffects, computed from the artifacts and a local simulation. The native row is the vendored row, unchanged. |
| `install-check/` | Cold-consumer install test (`npm run test:install`); not shipped in the tarball. |
| `LICENSE-NOTES.md` | License notes for the kit and the vendored files. |
| `VM-RUN.md` | Model-free commands for the official VM run. |
| `IMPORTS.md` | Cloud import, readback and cleanup receipts, including the n8n Cloud QA import and the VM2 test receipt. |

## Install

Node 20 or later (tested on Node 22). The package has zero runtime dependencies.

Build the tarball from this folder, then install it into your project. No registry
access is needed:

```sh
cd integrations/workflow-kits-n12
npm pack                                   # writes samedaydesk-workflow-kits-n12-0.2.0.tgz
cd /path/to/your-project
npm install --no-audit --no-fund /path/to/samedaydesk-workflow-kits-n12-0.2.0.tgz
```

The package is marked `private`, so it is installed from the tarball and is not
published to a registry. See `LICENSE-NOTES.md`.

Import from the package entry only:

```js
import {
  createClientEndpoint, createKitEffects, fromMakeExecution, fromN8nExecution,
  runPeriod, artifactDigests, kitPath, runDirectJourney,
} from "@samedaydesk/workflow-kits-n12";

const blueprintPath = kitPath("make/record-to-accepted-output.blueprint.json");
const workflowPath = kitPath("n8n/record-to-accepted-output.workflow.json");
```

The Make and n8n files also resolve as package subpaths, for example
`import.meta.resolve("@samedaydesk/workflow-kits-n12/n8n/record-to-accepted-output.workflow.json")`.

Command line, after install:

```sh
npx workflow-kits-n12 hashes   # bytes and sha256 of the packaged Make and n8n files
npx workflow-kits-n12 paths    # absolute paths of those files, for import
npx workflow-kits-n12 direct   # the direct journey, synthetic and in process
npx workflow-kits-n12 serve    # the local client endpoint (127.0.0.1:8787)
```

Tests, from this folder:

```sh
npm test               # unit, adapter, artifact and doc tests; no install
npm run test:install   # cold consumer: npm pack, npm install of the tarball, then
                       # the public exports and the bin from a fresh project
```

## Import into Make

1. Scenarios, Create a new scenario, the three-dot menu, Import Blueprint, then choose
   `make/record-to-accepted-output.blueprint.json`.
2. Open module 1, "Receive Period Capture", and create or pick a webhook. The blueprint
   ships with `hook: null`, so no hook from another account is carried over.
3. Replace `https://client.example.invalid/samedaydesk/workflow-kits` in modules 4, 6
   and 9 with your client endpoint.
4. No connection or credential is embedded. Add one only if your endpoint needs it.

Module path: Receive Period Capture, Shape Capture Fields, Period Record JSON,
Evaluate Period, then a router with three routes: Accepted (Post Accepted Output with
`Idempotency-Key: period.idempotencyKey`, Respond Accepted), Retryable (Wait Before
Replay, Replay Same Key with `period.retry.sameIdempotencyKey`, Respond Replayed) and
Not retryable (Respond Exception, 422).

## Import into n8n

1. Workflows, Import from File, then choose `n8n/record-to-accepted-output.workflow.json`,
   or run `n8n import:workflow --input=n8n/record-to-accepted-output.workflow.json`.
2. Set `clientEndpoint` in the "Kit Settings" node.
3. POST the period body to the webhook path `samedaydesk-record-to-accepted-output`.

The "Shape Capture Fields" node name is the default node read by the vendored
`projectN8nEquivalentEnvelope`. Keep that name. The optional FlowAssert branch runs
when the body carries `flowassert.sourceCsv` and `flowassert.destinationCsv`.

## Request body sent to a kit webhook

```json
{
  "period": {
    "periodId": "period-N",
    "taskId": "<Work Exchange task id>",
    "contextId": "<Work Exchange context id>",
    "followsTaskId": null,
    "termsInput": { "caller": {}, "request": {}, "reward": {}, "contextId": "...", "preview": { "termsVersion": "sha256:..." } },
    "capture": { "schema": "samedaydesk.recurring-decision-permitted-capture.v1", "captureId": "...", "subject": "...", "capturedAt": "...", "payload": {}, "permission": { "permitted": true } },
    "caller": { "correlationId": "ae:corr:v1:...", "step": 0, "tool": "...", "measurement": { "v": 1, "kind": "measurement", "discovery": { "status": "declared", "source": "cli" } } },
    "schemaAdapter": null
  },
  "flowassert": { "sourceCsv": "...", "destinationCsv": "..." }
}
```

`termsInput.preview.termsVersion` (or `termsInput.readAccepted.termsVersion`) must come
from the Work Exchange preview or readAccepted result. The kits pass it through and
never compute a termsVersion. A caller-side local hash sent as `claimedTermsVersion`
that differs from the exchange value is `terms_changed`.

## Interface

Each evaluation returns the frozen `period` object from epistemedeus PR 684
(`tools/payment-rail/recurring-journey`, vendored at 175245e3):

| Field | Meaning |
| --- | --- |
| `period.idempotencyKey` | The job-contract request digest. |
| `period.recordEvidence` | `taskId`, `contextId`, `followsTaskId`, `termsVersion`, `captureId`, `ingestionDigest`, `capturedAt`, `correlationId`. |
| `period.completeness` | `{ complete, missingFields }`. False on `schema_changed` and `ingestion_incomplete`. |
| `period.exception` | `null` or `{ code, message }`. |
| `period.retry` | `{ retryable, sameIdempotencyKey, recovered, secondEffect }`. Retryable codes are exactly `ingestion_missing`, `capture_stale`, `ingestion_incomplete`, `uncommitted`. |
| `period.periodId`, `period.decision` | Period id and `accept` / `reject` / `null`. |

Exception codes seen through the kits include `ingestion_missing`,
`ingestion_not_permitted`, `ingestion_incomplete`, `capture_stale`, `schema_changed`,
`terms_changed`, `token_used_as_task_ref`, `follow_up_not_new_task`,
`continuation_file_missing` (not retryable) and `uncommitted`. Kit-level refusals of a
declared schema adapter are `schema_adapter_unknown`, `schema_adapter_not_applicable`
and `schema_adapter_conflict`.

## Changed schema in a later period

An undeclared change (the vendored fixture renames `payload.output` to
`payload.outputKeys`) reaches the journey unchanged and returns `schema_changed` with
`completeness.complete: false` and no effect. To recover, the caller re-sends the
period with `"schemaAdapter": { "payloadVersion": "later-period-output-keys.v1" }`. The
adapter renames only the declared key, refuses when the source key is absent or the
target already exists, and the adapted record is evaluated as a new request: one new
effect, the period N effect untouched, and a replay of the adapted request recovers
with no second effect. Nothing is migrated automatically.

## Recovery and duplicate effects

Replaying the same request returns the original committed result with
`period.retry.recovered: true` and `secondEffect: false`. The client endpoint rejects a
replay whose `Idempotency-Key` does not match the recomputed digest (409), and hands off
an accepted output once per key. An uncommitted first request (Make `incomplete`, n8n
`error`) returns no result and records no effect.

## FlowAssert

FlowAssert v1.0.0 (Apache-2.0, Sun-sh902/FlowAssert at 3960c04d) is consumed unchanged.
The n8n "FlowAssert check" node keeps the upstream configuration block and packaged
checker byte for byte (sha256 in `vendor/PINS.json`). Only the input wiring differs:
the CSV text comes from the webhook body, because n8n Cloud has no Read/Write Files
node. `src/flowassert-bridge.mjs` runs the upstream CLI when installed, or the same
packaged checker. Exit codes map 0 Verified, 1 Mismatch, 2 refused, 3 Unverified, 4
failed. The disposition never changes `period.*`.

## Re-pinning vendored sources

Edit a source `sha` in `vendor/PINS.json`, then:

```sh
node scripts/vendor-sync.mjs --sync    # needs the GitHub CLI signed in
node scripts/build-artifacts.mjs && node scripts/compute-comparison.mjs
node --test
```

## Limits

- No hosted Make import yet, and no executed hosted workflow. The n8n Cloud QA
  import was created, read back and deleted; see `IMPORTS.md`. The Make
  execution-export envelope is this kit's documented shape, built from
  per-module output bundles, and has not been compared with a live Make export.
- The blueprint ships with `hook: null` and placeholder endpoint URLs.
- Make filter operators and module versions follow published blueprint conventions;
  a live import is the confirmation.
- Duplicate-effect protection comes from the request-digest key enforced by the client
  endpoint, not from Make or n8n.
- Evidence in a delivery binds the workflow's posted record to the contract. It does
  not independently prove the workflow's computation.
- FlowAssert premises are the caller's statements and are never verified.
