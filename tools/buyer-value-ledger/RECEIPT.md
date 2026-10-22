# RECEIPT — W4-commerce-16 buyer value ledger

Tool: `tools/buyer-value-ledger/`
Branch: `codex/w4-commerce-16-20260911`
Date: 2026-09-11
Node: v22.14.0
Base: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51)
Exact head: `6544b898b0f91929be93b1e74aa794cf6fc78764`
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...codex/w4-commerce-16-20260911
Draft PR: https://github.com/epistemedeus/samedaydesk/pull/72

## Outcome

CLI wraps a spawned useful-jobs run, records `durationMs`, catalog output bytes, and required `buyerClass` (`owner-qa | fixture-buyer | unknown`). Never infers organic or independent demand. Never treats 8.105 USDC as this job's revenue. Settlement fixtures join only with an exact `operationId`.

## Pins

| Item | Value |
| --- | --- |
| Write repo | epistemedeus/samedaydesk |
| Own directory | `tools/buyer-value-ledger/` (new) |
| useful-jobs 1.0.0 | 2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51` |
| evidence-records | imported `tools/evidence-records/lib.mjs` |
| I01 Neo PR54 | not attached; hash terms = S275 `crypto.hashRequest` `5de66179` |
| F08 / F01 | not copied |
| `server/pricing.js` / homepage | not edited |

## Literal journey

```sh
cd tools/buyer-value-ledger
node bin/value.mjs run vendor-budget-impact --buyer-class owner-qa --example --ledger /tmp/bvl.json --out-dir /tmp/bvl-example
node bin/value.mjs run vendor-budget-impact --buyer-class owner-qa \
  --before fixtures/caller/vendor-budget-impact/before.json \
  --after fixtures/caller/vendor-budget-impact/after.json \
  --ledger /tmp/bvl.json --out-dir /tmp/bvl-caller
node bin/value.mjs show --ledger /tmp/bvl.json
```

Recorded here (local-runtime spawn, Node v22.14.0): example `sample=true` durationMs 207 outputBytes 1858; caller `sample=false` durationMs 196 outputBytes 1648; two rows; `independentDemand=false`; `jobRevenueUsdc=null`.

## Tests

```sh
cd tools/buyer-value-ledger
node --test --test-concurrency=1 test/*.test.mjs
```

**PASS** — 11 tests, 0 fail, 0 skip on Node v22.14.0.

| Class | What |
| --- | --- |
| fixture | caller JSON under `fixtures/caller/`; reject JSON under `fixtures/reject/` |
| local-runtime | spawned `bin/useful-jobs.mjs`; 127.0.0.1 archive HTTP; disposable PostgreSQL 16 `initdb` |
| external acceptance | not claimed |

Seeded refusals: `missing_buyer_class`; `fixture_buyer_is_not_independent`; `settlement_is_not_job_revenue` (`early-x402-revenue` 0.040 USDC); `cited_banked_usdc_is_not_job_revenue` (8.105).

Dependencies: Node >= 22; `tar`; committed useful-jobs archive; in-repo evidence-records. Postgres test needs `initdb`/`pg_ctl` (this host: `/usr/lib/postgresql/16/bin`). No network, wallet, or secrets.

## Untested

- Live `https://samedaydesk.com` archive GET (external).
- Neo PR54 earned-work HTTP/Postgres kernel (repo not on this checkout).
- F08 wrapper CLI spawn.
- The other five catalog jobs as timed journeys (engine adapter is generic; journey pin is vendor-budget-impact).
- Live Stripe / x402 settlement.

## Next owner

Root. Later: bind I01 hash-terms module in-place if Neo PR54 exports it; do not treat labelled runs as demand.
