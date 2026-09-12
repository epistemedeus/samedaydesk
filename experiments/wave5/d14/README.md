# Thin HTTP consumer for execution.v1 (W5-D14 / CW70)

Fetch-only client of `samedaydesk.paid-useful-jobs.execution.v1` on useful-jobs
**1.4.4 unpublished** (runtime pin `c6f1464222169f2d32247c978dc5007d82a2aa03`).
Immutable 1.4.3 `a18ab918` does not contain wrapper.mjs. It is not a
second useful-jobs server and it does not vendor the wrapper.

## How to submit caller JSON and fetch the result

1. Start the in-tree loopback (not this folder, not a newly written server):

```bash
node server/paid-useful-jobs/bin/serve-execution.mjs
```

The process prints one JSON line with `origin`. Cache is process-local and is
not durable across restart.

2. Submit caller-owned JSON. The client chooses/validates `executionId`, reads
UTF-8 JSON once, persists the ticket **atomically before POST**, then sends
bytes (not filesystem paths) to `POST /execute`.

```bash
node experiments/wave5/d14/bin/http-consumer.mjs submit \
  --base http://127.0.0.1:PORT \
  --job vendor-budget-impact \
  --before experiments/wave5/d14/fixtures/caller/vendor-budget-impact/before.json \
  --after experiments/wave5/d14/fixtures/caller/vendor-budget-impact/after.json \
  --ticket /tmp/w5-d14-ticket.json
```

3. In a second process, fetch that execution. Retrieval uses the ticket's
caller-owned id at the ticket origin only (`GET /results/:id`). It does not
rerun the job and does not take the id from a lost POST response.

```bash
node experiments/wave5/d14/bin/http-consumer.mjs fetch \
  --ticket /tmp/w5-d14-ticket.json \
  --out /tmp/w5-d14-result.json
```

HTTP `path` fields are **host paths, not acquisition authority**. This server
has no artifact download route. `fetch` without local copies surfaces
`unsupported-portable-acquisition` and keeps `httpArtifactsDelivered: false`.
The vendor HTTP summary is metadata, not `budget-impact.json`.

Explicit local acquisition (caller-selected copies only; never an artifact HTTP
server):

```bash
node experiments/wave5/d14/bin/http-consumer.mjs fetch \
  --ticket /tmp/w5-d14-ticket.json \
  --out /tmp/w5-d14-result.json \
  --local-artifacts /path/to/copies \
  --acquire-to /path/to/dest
```

Local acquire checks exact names, bytes, sha256, containment, and rejects
symlinks. Destination publish is atomic. Source is `local`;
`httpArtifactsDelivered` stays false.

## Classify outcomes

- `http-transport-failure` — no contract JSON (refused, timeout, redirect,
  400/404/409/410/413/503, non-JSON, oversize).
- `execution-transport-failure` — HTTP 200 with engine crash/timeout/acquisition-failed.
- `contract-refusal` — HTTP 200 `ok: false` (unknown-job, sample-not-a-sale, …).
- `incomplete-delivery` — HTTP 200 `ok: true` with incomplete outputs. Not analysis success.
- `analysis-outcome` — HTTP 200 `ok: true` with complete delivery. A useful
  no-change report is not a crash.
- `ticket-mismatch` — GET body failed ticket-bound verification.

GET does not echo caller payment/accepted terms or the server frozen request
hash. Local `declaredTerms` are not remote cryptographic proof. Recomputed
hashes on a substituted GET are not caller identity.

## Tests

```bash
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/wave5/d14/test/*.test.mjs \
  experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs
```

Tests launch in-tree `server/paid-useful-jobs/bin/serve-execution.mjs`. They do
not git-fetch historical D01 pins.

## Limits

Non-JSON inputs are refused here. `POST /execute` still treats a non-JSON string
as a filesystem path. GET `/results/:id` returns contract JSON including output
sha256 and host `path`. Artifact file bytes stay on the host until the caller
imports copies. Same-ID replay is process-local, not durable exactly-once
recovery across restart.
