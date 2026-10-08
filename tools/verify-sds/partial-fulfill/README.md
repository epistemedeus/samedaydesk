# partial-fulfill — SDS refuse settle on partial delivery

Owned path: `tools/verify-sds/partial-fulfill/**` (W0-X97).

Proves SameDayDesk **refuses to settle** when a fulfillment envelope is only
partial (failed/partial sources, `partial: true`, incomplete page-change,
partial records). Cold clone works offline; no `npm ci`. Live
`GET /commerce/settlement-proof` is cited read-only (`cite-apex`). This pack
does not pay, does not POST checkout, and does not write a settlement receipt.

`charged: true` on a merchant-shaped fixture is **not** settlement. Quote
presence is not delivery.

## Cold artifacts (read-only)

| Path | Role |
| --- | --- |
| `tools/result-reuse/fixtures/incomplete-failed-extract.json` | Default partial extract-batch (3 failed sources) |
| `tools/result-reuse/fixtures/accepted-extract-batch.json` | Mixed partial (2 success, 1 failure, charged:true) |
| `tools/result-reuse/fixtures/accepted-page-change.json` | Page-change `claims.complete: false` |
| `tools/result-reuse/fixtures/accepted-record-report.json` | Explicit-record partial/invalid rows |
| `tools/result-reuse/fixtures/accepted-complete-changed-page-change.json` | Complete page-change → eligible-unpaid, never settled |
| `fixtures/complete-extract-batch.json` | Pack-local complete extract-batch |

## Commands

```bash
# Cold refuse-settle on real incomplete extract-batch — exit 0
node tools/verify-sds/partial-fulfill/cli.mjs refuse-settle --json

# Seeded lie that the partial job is settled / delivered in full — exit 1
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure settle-partial --json

# Other seeded refuses
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure forged-complete --json
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure silent-ok-partial --json
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure receipt-on-partial --json
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure payment-signature --json
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure stripe-path --json
node tools/verify-sds/partial-fulfill/cli.mjs --seeded-failure live --json

# Cold harness (refuse-settle ok + complete unpaid + all seeds refuse) — exit 0
node tools/verify-sds/partial-fulfill/run-harness.mjs

# Tests
node --test tools/verify-sds/partial-fulfill/cli.test.mjs
```

`--live` and `--origin` pointing at `samedaydesk.com` / Stripe exit 2 (`LIVE_REFUSE`).
`settle` always exits ≠ 0 (`PARTIAL_FULFILL` or `UNPAID_BOUNDARY`).

## Seeded failures

| Seed | Code | Meaning |
| --- | --- | --- |
| `settle-partial` | `SETTLE_PARTIAL` | Rejects settled=true / delivered-in-full on a partial extract-batch |
| `forged-complete` | `FORGED_COMPLETE` | Rejects complete/in-full on mixed failed sources |
| `silent-ok-partial` | `SILENT_OK_PARTIAL` | Rejects `{ok:true, settled:true}` on `partial:true` |
| `receipt-on-partial` | `RECEIPT_ON_PARTIAL` | Rejects a settlement receipt on a partial job |
| `payment-signature` | `PAYMENT_HEADER_REFUSE` | Refuses sending `PAYMENT-SIGNATURE` |
| `stripe-path` | `STRIPE_PATH_REFUSE` | Refuses `/api/checkout` |
| `live` | `LIVE_REFUSE` | Refuses `--live` / origin fetch of settlement-proof |

## Boundary

- `boundary.paymentSent` always `false`
- `boundary.settled` always `false`
- `boundary.liveFetch` always `false`
- Never sends `PAYMENT-SIGNATURE`, `X-PAYMENT`, or `stripe-signature`
- No Stripe/x402 spend, no price/SKU edits, no neo, no merge, no registry publish

## Layout

```
cli.mjs                 JSON CLI
run-harness.mjs         cold acceptance entry
cli.test.mjs            node:test
lib/catalog.mjs         real-artifact pins + seeds
lib/envelope.mjs        JSON envelope
lib/classify.mjs        extract-batch / page-change / record partial vs complete
lib/settle.mjs          refuse-settle decision
lib/refuse.mjs          seeded refuses
fixtures/complete-extract-batch.json
fixtures/seeded-failures.json
fixtures/seeded/*.json
```
