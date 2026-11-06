# Recurring decision consumer

Caller-owned, run-once CLI that turns **saved permitted captures**, a **decision intent**, **freshness bounds**, and an optional **retained previous result** into a useful decision.

It returns:

| Outcome | Meaning |
| --- | --- |
| `useful_change` | Compared fields (or digests) differ inside the freshness horizon |
| `useful_no_change` | Compared fields (or digests) match inside the freshness horizon |
| `stale` | Prior or capture sits outside the caller-supplied horizon |
| `unavailable` | Capture/prior missing or not permitted |
| `unsupported` | Intent/capture schema or subject not supported |
| `unknown` | Invalid input, or requested fields absent on both sides |

This is not a global resident monitor, not a claim of live recurrence, and not a newly funded offer. Later voluntary paid choice stays an outside experiment.

## Consume, do not duplicate

R05/R06 shared capture and portable-decision producers stay with Agent Growth Loops. See [IMPORT_MAP.md](./IMPORT_MAP.md).

- Direct baseline: permitted captures (`samedaydesk.recurring-decision-permitted-capture.v1`) and optional `samedaydesk.portable-decision-capture.v1`.
- AGL bridge (`src/agl-bridge.mjs`): vendor-free dynamic import of `tools/result-reuse/src/export.mjs` (`decideOrReuse`) and `portable.mjs` (`samedaydesk.portable-decision.v1`). No copies of those modules.
- Candidate heads: PR364 `3a4a7538`, PR366 `95c8a841` (stacked). Prefer checkout `95c8a841` for full bridge tests.

## Run

```bash
node tools/recurring-decision-consumer/cli.mjs evaluate \
  --intent tools/recurring-decision-consumer/fixtures/intents/watch-title.json \
  --prior tools/recurring-decision-consumer/fixtures/captures/prior.json \
  --capture tools/recurring-decision-consumer/fixtures/captures/same.json \
  --clock 2026-11-05T12:00:00.000Z --horizon 24 \
  --reference tools/recurring-decision-consumer/fixtures/reference/expect-no-change.json

node --test tools/recurring-decision-consumer/test/*.test.mjs
```

## Saved n8n execution

`receive-stored-n8n` reads one already saved execution response and evaluates it with `evaluateDecision`. It does not call n8n, store credentials, or execute, update, or create a workflow.

Supported envelopes are explicit. The received shape keeps execution metadata beside `data.resultData.runData`. A nested execution document, and data nested only inside `execution`, are accepted when that is the only data location. Both locations, or any other wrapper, are rejected. The selected node is exact. A missing node is unavailable and is not replaced by another node.

The capture time is that node's `startTime`. The `--clock` value stays the evaluation time. A missing or invalid `startTime` is not replaced with the clock. Field comparison, absence, freshness, and reference controls are the maintained evaluator.

`fixtures/n8n-stored/derived-sibling-execution-2.json` and `derived-nested-execution-2.json` are derived fixtures: metadata, node startTime, and title/status only. They are not a second observation of the stored execution.

```bash
node tools/recurring-decision-consumer/cli.mjs receive-stored-n8n \
  --saved tools/recurring-decision-consumer/fixtures/n8n-stored/derived-sibling-execution-2.json \
  --workflow-id eFUkVKYk8xXbM7LV \
  --execution-id 2 \
  --node "Shape Capture Fields" \
  --intent tools/recurring-decision-consumer/fixtures/intents/watch-title.json \
  --prior tools/recurring-decision-consumer/fixtures/captures/prior.json \
  --clock 2026-11-05T23:21:56.441Z \
  --horizon 168 \
  --reference tools/recurring-decision-consumer/fixtures/reference/expect-no-change.json
```

Useful change and useful no-change exit 0. Fields absent on both sides exit 0 with `unknown`. A stale node startTime exits 0 with `stale`. Wrong workflow or execution id, unsuccessful status, and ambiguous wrappers exit 1. A missing node or missing items exits 0 with `unavailable`. Malformed or oversized JSON exits 1 before evaluation. `--state` still records only a useful result.

## Customer recurring result

`recur` compares one permitted capture with every intent in an explicit schedule. The schedule names its subject, intent ids, horizon, and source. It is caller-invoked, cancellable, and prepared. It does not install a resident watcher, add an n8n charge, or request a new execution.

The maintained path reads the saved execution once through `readStoredCapture`, then compares each intent with `evaluateDecision`. `--adapt` rewrites a useful changed field into a retained prior and stores that adapted result. `--cancel`, or a schedule whose status is already `cancelled`, removes the portable state for those intents and does not compare again.

Priors in `fixtures/recurring/priors.json` are owner QA. The stored execution fixtures are derived from execution 2 of workflow `eFUkVKYk8xXbM7LV`: decision fields only, not a new observation and not a live n8n call. A useful no-change result is valid.

```bash
node tools/recurring-decision-consumer/cli.mjs recur \
  --saved tools/recurring-decision-consumer/fixtures/n8n-stored/derived-sibling-execution-2.json \
  --workflow-id eFUkVKYk8xXbM7LV \
  --execution-id 2 \
  --node "Shape Capture Fields" \
  --intents tools/recurring-decision-consumer/fixtures/recurring/intents.json \
  --priors tools/recurring-decision-consumer/fixtures/recurring/priors.json \
  --schedule tools/recurring-decision-consumer/fixtures/recurring/schedule.json \
  --clock 2026-11-05T23:21:56.441Z \
  --horizon 168 \
  --adapt \
  --state /tmp/rdc-recur

node tools/recurring-decision-consumer/cli.mjs recur \
  --saved tools/recurring-decision-consumer/fixtures/n8n-stored/derived-sibling-execution-2.json \
  --workflow-id eFUkVKYk8xXbM7LV \
  --execution-id 2 \
  --node "Shape Capture Fields" \
  --intents tools/recurring-decision-consumer/fixtures/recurring/intents.json \
  --priors tools/recurring-decision-consumer/fixtures/recurring/priors.json \
  --schedule tools/recurring-decision-consumer/fixtures/recurring/schedule.json \
  --clock 2026-11-05T23:21:56.441Z \
  --horizon 168 \
  --cancel \
  --state /tmp/rdc-recur
```

`effort` runs that same stored execution, including the nested envelope, through the maintained caller and a competent direct baseline. The baseline reimplements envelope selection, freshness, field comparison, controls, adaptation, and cancellation. It does not import the maintained evaluator. The report records build bytes, review surface bytes, and in-process operating time. It is not a change score. Field-equality is the compared customer case.

```bash
node tools/recurring-decision-consumer/cli.mjs effort \
  --saved tools/recurring-decision-consumer/fixtures/n8n-stored/derived-sibling-execution-2.json \
  --nested tools/recurring-decision-consumer/fixtures/n8n-stored/derived-nested-execution-2.json \
  --workflow-id eFUkVKYk8xXbM7LV \
  --execution-id 2 \
  --node "Shape Capture Fields" \
  --intents tools/recurring-decision-consumer/fixtures/recurring/intents.json \
  --priors tools/recurring-decision-consumer/fixtures/recurring/priors.json \
  --schedule tools/recurring-decision-consumer/fixtures/recurring/schedule.json \
  --clock 2026-11-05T23:21:56.441Z \
  --horizon 168
```

`receipt` prints the live process receipt. The package stays prepared. Payment and outside use stay none until a real consented caller appears.

## Portable state

```bash
node tools/recurring-decision-consumer/cli.mjs evaluate ... --state /tmp/rdc-state.json
node tools/recurring-decision-consumer/cli.mjs state show --state /tmp/rdc-state.json
node tools/recurring-decision-consumer/cli.mjs state remove --state /tmp/rdc-state.json
```

## Workflow export

Exports a caller-owned n8n or native stub only with `--verified`. That flag is a caller assertion, not executed schema or import proof, and is not sufficient on its own. Confirm the n8n route with a live schema or MCP probe (`verifiedMeans: live_schema_or_mcp_probe_not_flag`). The native argv stub is the primary verified shape and the solid direct baseline.

The n8n stub never ships Execute Command (unavailable on n8n Cloud and disabled by default from n8n 2.0). It uses a Webhook plus an HTTP Request node that POSTs evaluate inputs to a caller-supplied HTTPS `evaluateUrl`. Mount `receiveEvaluateRequest` (`src/http-adapter.mjs`) or `receive-http` on that endpoint. Registry locators on the existing instance are recorded by id only, never as secret values.

```bash
node tools/recurring-decision-consumer/cli.mjs export-workflow --runtime native --out /tmp/rdc-native.json --verified
node tools/recurring-decision-consumer/cli.mjs export-workflow --runtime n8n --out /tmp/rdc-n8n.json --verified
node tools/recurring-decision-consumer/cli.mjs receive-http --request /tmp/rdc-http-request.json
```
