# W5-D14 RECEIPT — thin real HTTP consumer (CW70 repair)

**Task:** W5-D14 / CW70 cold HTTP consumer of CURRENT runtime
**Repo:** `epistemedeus/samedaydesk`
**Feature branch:** `codex/h7-delivery-20260912`
**Runtime pin:** `8a811bbadba7edc6c926b319b0839cd2f01e5896` (useful-jobs **1.4.3 unpublished**)
**Contract:** `samedaydesk.paid-useful-jobs.execution.v1`
**Owned paths:** `experiments/wave5/d14/` `experiments/codex-window/cw70-cold-http-consumer-current/`

Historical D14 import and original receipts remain in
`experiments/codex-window/cw70-cold-http-consumer-current/evidence/source/`
(immutable). Historical SDS52/D01-pin claims below are provenance, not current
acceptance.

## What

Fetch-only consumer of in-tree `serve-execution.mjs`. `submit` validates
executionId, freezes caller JSON, writes the ticket, then POSTs. `fetch` is a
separate process that GETs `/results/:id` from the ticket origin only. No
wrapper/engine copy. No artifact download client pretending to be a server.

## Current-source findings (this pin)

- `POST /execute` accepts optional caller `executionId`; binds request hash;
  same request replays; different request 409 `execution-id-conflict`.
- `GET /results/:id`: missing 404, expired 410, cache full 503.
- Cache is process-local, 24h default, 1024 entries, not durable across restart.
- No artifact download route. No bearer auth in this server.
- HTTP 200 can carry `ok: false`, missing outputs, or engine transport failure.
- Complete no-change can be successful delivery (`analysis-outcome`).
- Output `path` fields are host paths, not client acquisition authority.
- GET does not echo caller payment/accepted terms or frozen request hash.
- Vendor HTTP summary is not the full `budget-impact.json` artifact.

## Tests

```bash
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/wave5/d14/test/*.test.mjs \
  experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs
```

See `experiments/codex-window/cw70-cold-http-consumer-current/H7-SLICE-STATUS.md`
for the latest pass/fail counts. Spawn uses in-tree
`server/paid-useful-jobs/bin/serve-execution.mjs`. git-fetch of historical D01
is forbidden.

## Integration limits

- Not a later sibling of this pin. Not durable exactly-once across restart.
- Remaining binding: live/public HTTP, non-JSON byte envelope, no GET artifact payload.
- `unsupported-portable-acquisition` is the honest portable result when only host paths exist.
- No live settlement, catalog publication, or new spend.
