# CW70 H7 slice status — cold HTTP consumer of CURRENT 1.4.3

Recorded 2026-09-12 on Cursor Cloud VM. Hostname `cursor` is not provider identity.
Runtime pin: `6007fcfa27074f9a594248e47296f1afa4f8385d` (useful-jobs **1.4.3**).
Branch: `codex/h7-delivery-20260912`. No git commit from this child.

## What landed

D14 ticket/CLI now chooses and validates `executionId` before network I/O, freezes
caller UTF-8 JSON once, and persists the ticket atomically **before POST**. Retrieval
id never comes from the POST body. Lost/timeout/parse/refused responses keep the
caller id. `commitStatus` distinguishes `not-sent`, `uncertain`, `rejected`, and
`accepted`. Same-ID replay is process-local, not durable exactly-once recovery.

`classifyHttpExchange` no longer treats HTTP 200 `ok: true` with incomplete
delivery as `analysis-outcome`. POST/GET set `redirect: "error"`. Retrieval is
restricted to the ticket origin and `/results/:id` (rejects protocol-relative
escape, userinfo, encoded traversal, query/fragment).

**Portable acquisition is honestly `unsupported-portable-acquisition`.** This
server has no artifact download route. HTTP `path` is host metadata, not
acquisition authority. Engine HTTP summary may be verified as result JSON and
must not count as acquired artifact files. `httpArtifactsDelivered` stays
`false`.

Explicit local acquisition: `fetch --local-artifacts DIR --acquire-to DIR`
consumes caller-selected copies only (exact names, bytes, sha256, containment,
symlink rejection, atomic dest publish). Source is `local`. No fake artifact
HTTP server was added. The existing in-tree
`server/paid-useful-jobs/bin/serve-execution.mjs` is launched read-only.

`test/spawn-d01.mjs` no longer git-fetches historical D01 pins.

## Files changed

Owned trees only: `experiments/wave5/d14/`,
`experiments/codex-window/cw70-cold-http-consumer-current/`.

Modified:

- `experiments/wave5/d14/bin/http-consumer.mjs`
- `experiments/wave5/d14/lib/client.mjs`
- `experiments/wave5/d14/lib/encode-inputs.mjs`
- `experiments/wave5/d14/lib/pins.mjs`
- `experiments/wave5/d14/test/spawn-d01.mjs`
- `experiments/wave5/d14/test/http-consumer.test.mjs` (historical SDS52/git-fetch suite replaced)
- `experiments/wave5/d14/README.md`
- `experiments/wave5/d14/RECEIPT.md`
- `experiments/wave5/d14/FEATURE-MAP.md`
- `experiments/wave5/d14/package.json`

Added:

- `experiments/wave5/d14/lib/errors.mjs`
- `experiments/wave5/d14/lib/origin.mjs`
- `experiments/wave5/d14/lib/digest-named.mjs`
- `experiments/wave5/d14/lib/ticket.mjs`
- `experiments/wave5/d14/lib/verify.mjs`
- `experiments/wave5/d14/lib/acquire.mjs`
- `experiments/wave5/d14/test/helpers.mjs`
- `experiments/wave5/d14/test/local-acquire.test.mjs`
- `experiments/wave5/d14/test/transport-faults.test.mjs`
- `experiments/codex-window/cw70-cold-http-consumer-current/test/current-runtime.test.mjs`
- `experiments/codex-window/cw70-cold-http-consumer-current/H7-SLICE-STATUS.md` (this file)

Unchanged / immutable:

- `experiments/codex-window/cw70-cold-http-consumer-current/evidence/source/*`
- `experiments/codex-window/cw70-cold-http-consumer-current/test/consumer-foundation.test.mjs` (assertions not rewritten)
- `server/paid-useful-jobs/**` (read-only launch of `bin/serve-execution.mjs`)

## Commands

```bash
mkdir -p /tmp/h7/runtime-tmp/cw70
export TMPDIR=/tmp/h7/runtime-tmp/cw70
export NODE_OPTIONS=--max-old-space-size=768

flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 \
  experiments/codex-window/cw70-cold-http-consumer-current/test/consumer-foundation.test.mjs

flock /tmp/h7/runtime-tmp/test.lock node --test --test-concurrency=1 \
  experiments/wave5/d14/test/*.test.mjs \
  experiments/codex-window/cw70-cold-http-consumer-current/test/*.test.mjs
```

Final combined command: **exit 0**. Node v22.22.2. No PG/Firebase.

## Pass / fail / skip

| Suite | Result |
| --- | --- |
| Foundation red specs (injected fetch) | **5 pass, 0 fail, 0 skip** |
| Combined owned tests | **36 pass, 0 fail, 0 skip, 0 cancelled** (8 suites, ~4.1s with warm kit) |

Foundation controls now green by repairing the client, not by rewriting assertions:

- incomplete `ok: true` is not `analysis-outcome`
- lost POST retains caller executionId `/results/:id`
- POST `redirect` is `error`
- protocol-relative retrieval does not issue HTTP

## Portable vs local acquisition

- Remote/metadata fetch: `acquisition.code = unsupported-portable-acquisition`,
  `httpArtifactsDelivered = false`. Host `path` is ignored for file access.
- Node `--permission` fetch (no fs read of the server artifact tmpdir) still
  returns contract JSON and the same unsupported portable code; a restricted
  process cannot read the host artifact path.
- Local exact-byte acquire of caller-imported copies: `code = local-acquired`,
  `source = local`, `httpArtifactsDelivered = false`. Changed-input oracle
  matched vendor `budget-impact.json` content (`desk-embed` / price fields).
- Local reject: missing, hash-mismatch (stale and corrupt same-length wrong
  bytes), symlink.

## Runtime claims exercised on real HTTP

Against in-tree `serve-execution.mjs`: health/contract; changed-input artifact
oracle; genuine no-change (`analysis-outcome`, not engine-transport-failure);
HTTP 200 contract refusals (`unknown-job`, `sample-not-a-sale`); invalid JSON
400; valid-but-wrong id 404; real 409 job/input/terms substitution plus same-id
replay; two concurrent clients (replay + conflict); response dropped after
server commit then fetch from another process without rerun; restarted process
cache 404; caller files mutated after freeze; separate sender/fetcher working
directories.

Labelled faults around the unchanged runtime (not positive delivery proof):
same/cross-origin redirects with **zero** auth/body bytes at the sink; header
and body timeouts; non-JSON and oversized bodies; mutating GET rejected by
ticket verification; 410 expiry via `createExecutionServer({ resultTtlMs: 40 })`;
dishonest HTTP 200 `ok: true` incomplete delivery.

## Remaining raw limits (not failures of the owned suite)

- Default 24h process cache TTL was not wall-clock waited; 410 is covered with a
  labelled short-TTL adapter, not by sleeping a day on `serve-execution.mjs`.
- vendor-budget-impact 1.0.0 was not observed here to emit a **complete analysis
  refusal** (`analysis.outcome=refused` with both promised files). Distinct
  HTTP 200 **contract** refusals and complete **no-change analysis-outcome**
  were observed. Transport vs analysis vs incomplete remain separate kinds.
- GET still does not prove caller `payment.accepted` / frozen request hash.
  Ticket `declaredTerms` are local declarations.
- Same-ID replay is not durable exactly-once across server restart.
- Historical SDS52 `createSdsApp` tests were removed rather than run (they are
  not CURRENT runtime and the old spawn path could git-fetch D01).

HTTP path is not acquisition authority.
