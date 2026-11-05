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
