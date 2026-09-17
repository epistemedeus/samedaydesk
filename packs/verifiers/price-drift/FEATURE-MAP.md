# Feature map — SDS price-drift verifier

Job **W0-X100**. Write repo `epistemedeus/samedaydesk`. Own directory
`packs/verifiers/price-drift/`. Disjoint from neomorphic-io, checkout,
payment, publish, and `server/pricing.js`.

| ID | Intent | This pack | Status |
| --- | --- | --- | --- |
| X100 | Record SDS live x402 amounts; reject observation drift | `src/verify.mjs`, `bin/price-drift.mjs` | Implemented |
| B04 | Neo price-arithmetic oracle | — | **Out of scope** (not imported, not vendored) |
| E06 | Pre-spend cost assurance | — | **Out of scope** |
| F08 | SDS paid useful-jobs wrapper | — | **Out of scope** |

## Surfaces

| Capability | Path |
| --- | --- |
| CLI | `bin/price-drift.mjs` |
| Library | `src/verify.mjs` `verifyDocuments` |
| Pins | `src/constants.mjs`, `fixtures/pin.json` |
| Seeded rejects | `fixtures/reject/` |

## Tests that lock the journey and seeded failures

| Case | Test |
| --- | --- |
| Matching pin + observation → `ok: true` | `tests/verify.test.mjs` |
| x402 `items[]` catalog shape | `tests/verify.test.mjs` |
| Extract `0.005` → `0.05` | `tests/cli.test.mjs`, `tests/seeded-failures.test.mjs` |
| `--live` / `--checkout` / https path | `tests/cli.test.mjs` |
| Float money, wrong units, extra SKU, publish | `tests/seeded-failures.test.mjs` |
| Honesty: no purchase / rewrite / neo | `tests/honesty.test.mjs` |
