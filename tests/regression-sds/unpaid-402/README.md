# SDS unpaid-402 regression (W0-X41)

Executable fixtures for SameDayDesk **unpaid HTTP 402** observation. The pack
classifies offline fixtures with the shipped parser in
`client/scripts/verifiedFeedObservation.mjs`. It never pays, never sends
`PAYMENT-SIGNATURE`, never live-probes, and never writes the production
`/x402/verified.json` feed.

Write boundary: `tests/regression-sds/unpaid-402/**` only.

## Layout

```
tests/regression-sds/unpaid-402/
  MANIFEST.json
  run.mjs
  verify.mjs
  corpus.test.mjs
  cli-proof.test.mjs
  lib/{cite,classify,envelope,root}.mjs
  fixtures/cases/*.json
```

## Commands

From the repository root, Node 22.x:

```bash
# Cold: every fixture matches its expected verdict → exit 0
node tests/regression-sds/unpaid-402/run.mjs --json

# Seeded false-accept: empty-accepts 402 claimed as a current contract → exit 1 SEED_REJECT
node tests/regression-sds/unpaid-402/run.mjs --seeded-failure --json

# Seeded false-reject: valid extract-current claimed invalid → exit 1 SEED_REJECT
node tests/regression-sds/unpaid-402/run.mjs --seeded-false-reject --json

node tests/regression-sds/unpaid-402/verify.mjs \
  --fixture fixtures/cases/empty-accepts.json --expect accept --json

node --test --test-concurrency=1 tests/regression-sds/unpaid-402/*.test.mjs
```

## What a current unpaid-402 claim needs

Product `parseUnpaid402Payload` accepts only HTTP 402 with a non-empty
`accepts[]` row whose amount is a digit string, asset is present, and network
is a single CAIP-2 identifier. This pack also pins GET `/extract` terms to the
committed crawl: amount `5000`, network `eip155:8453`.

HTTP 402 with `accepts: []` is **not** a current contract (`missing_accepts`).
Shallow status-only classifiers (X5/X22 `classify-http`) treated that body as
`payment_required`. This pack uses the real parser.

## Seeded failure

| id | claimed | product | catch |
| --- | --- | --- | --- |
| empty-accepts | accept | reject `missing_accepts` | `SEED_REJECT` / `false_accept` |
| extract-current | reject | accept `current_unpaid_402` | `SEED_REJECT` / `false_reject` |

`--seeded-failure` always exits 1. The honest cold corpus still classifies
empty-accepts as reject and extract-current as accept.

## Limits

No live apex TLS. No Stripe/x402 spend. No publish/registry/checkout. No
neomorphic-io. CDN/400/500/redirect/timeout classes are fixture-classified.
