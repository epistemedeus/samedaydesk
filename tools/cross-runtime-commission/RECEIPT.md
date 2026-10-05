# W3-09 RECEIPT — E03 cross-runtime commission scaffold

**Date:** 11 September 2026
**Branch:** `fable/w3-09-e03-cross-runtime-commission`
**Base:** `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 useful-jobs public integration)

## What

A SameDayDesk **cross-runtime commission scaffold** in `tools/cross-runtime-commission/`.
It records two labelled runtimes (`node22-local` vs `node22-container-fixture`) running the
same listing-repair-packet fixture: shared input digest, exact commands, engine results.
`independent: true` only when captured environments differ by more than cwd.

Not a live second-customer purchase. `commissionedCustomer` is always false.
`payingMaintainer` is always false. `purchaseAuthority` is false. `sold` is always false.
SAMPLE is never commissioned customer work. A demo-labelled single-runtime run cannot
claim `independent: true`.

Engines are reused from `client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`
(2522418 bytes, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`).
F08 wrappers are not rewritten. W2-06 `tools/cold-start-assessment/` and Pilot F11
`tools/verify/cold-start/` own their trees; this scaffold imports honesty / price / engine
pins only.

## Literal journey

```sh
cd tools/cross-runtime-commission
node bin/cross-runtime.mjs journey --fixture fixtures/ok.json
```

## Seeded failures (must refuse)

| Fixture | Code |
| --- | --- |
| `fixtures/fail-one-runtime-independent.json` | `one-runtime-not-independent` |
| `fixtures/fail-sample-commission.json` | `sample-not-commissioned-customer-work` |
| `fixtures/fail-extract-price.json` | `extract-price-immutable` |
| `fixtures/fail-paying-maintainer.json` | `invented-paying-maintainer` |
| `fixtures/fail-touch-f08.json` | `f08-wrappers-out-of-scope` |

## Tests

```bash
npm run test:cross-runtime-commission
```

**PASS** — 14 tests, 0 fail (`node --test --test-concurrency=1 tools/cross-runtime-commission/test/*.test.mjs`).

Literal journey: `cd tools/cross-runtime-commission && node bin/cross-runtime.mjs journey --fixture fixtures/ok.json` exits 0. Two labelled runtimes share one input digest; `independent` is true for local vs container-fixture and false when only cwd differs. Demo-labelled single-runtime does not claim `independent: true`.

## Hard stops honored

No deployment, payment, secrets, homepage CSS, live price change, new account, chain, or queue.
`server/paid-useful-jobs/` was not created or edited.
