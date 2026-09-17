# FEATURE-MAP — pre-spend cost assurance (W3-10 / E06)

Own directory: `tools/pre-spend-cost-assurance/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| Neo B04 `packs/price-arithmetic-verifier/` | **Not attached.** Import shape via `fixtures/b04-price-arithmetic-verifier/` (`atomicToDecimal`, `decimalToAtomic`, `moneyScale`). |
| F08 `server/paid-useful-jobs/` | Present on SDS PR52 branch only — **not rewritten**. This tree's `main` does not own that directory. |
| Live extract `$0.005` atomic `5000` | Recorded in `src/pins.mjs`. Unchanged. |
| Live seller-integrity-audit `$0.01` atomic `10000` | Recorded. Unchanged. Base USDC `eip155:8453`. |
| `server/pricing.js`, homepage | **Not edited**. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Cap extract + integrity-audit unpaid amounts | `fixtures/ok-plan.json` | `node bin/pre-spend.mjs assure --plan fixtures/ok-plan.json` | `costCap: "0.015"`, `purchaseAuthorized: false` | `tests/assure.test.mjs` | None |
| Literal journey | `fixtures/ok.json` | `node bin/pre-spend.mjs journey --fixture fixtures/ok.json` | cap `0.015` then POST-payment rejected | `tests/journey.test.mjs` | None |
| Refuse settle/prepare | CLI `settle` / `prepare` | same | `settle_refused` / `prepare_refused` | `tests/assure.test.mjs` | None |
| Reject default purchase | `fixtures/reject/default-purchase.json` | `assure --plan …` | `default_purchase` | `tests/seeded-failures.test.mjs` | None |
| Reject 5000 as dollars | `fixtures/reject/wrong-units-5000-dollars.json` | same | `wrong_units` | same | None |
| Reject 402 as success | `fixtures/reject/http-402-as-success.json` | same | `http_402_as_success` | same | None |
| Reject SAMPLE as paid assurance | `fixtures/reject/sample-as-paid-assurance.json` | same | `sample_as_paid_assurance` | same | None |
| Reject live price edits | `fixtures/reject/edit-live-prices.json` | same | `edit_live_prices` | same + `tests/live-prices.test.mjs` | None |
| Invalid delivery ≠ spend | `fixtures/reject/invalid-delivery-retry-spend.json` | same | `invalid_delivery_spend` | same | None |

## Files

| Path | Role |
| --- | --- |
| `bin/pre-spend.mjs` | CLI |
| `src/assure.mjs` | Pass/reject |
| `src/b04-import.mjs` | Attached Neo or fixture |
| `fixtures/b04-price-arithmetic-verifier/` | B04 money import shape |
| `fixtures/ok.json` | Literal journey |
| `tests/*.test.mjs` | `node:test` |
