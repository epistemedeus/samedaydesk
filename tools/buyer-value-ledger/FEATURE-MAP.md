# FEATURE-MAP — buyer value ledger (W4-commerce-16)

Own directory: `tools/buyer-value-ledger/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | Attached. Write branch `codex/w4-commerce-16-20260911`. |
| useful-jobs catalog + archive | `client/public/for-agents/useful-jobs/catalog.json` and `useful-jobs-1.0.0.tar.gz` (2522418 B, sha256 `6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`). |
| evidence-records closed sets | `tools/evidence-records/lib.mjs` imported; settlements joined only on exact `operationId`. |
| I01 Neo PR54 earned-work | **Not attached.** Hash terms follow published S275 `crypto.hashRequest` (stable-JSON SHA-256). No competing kernel copy. |
| F08 `server/paid-useful-jobs/` | Excluded. Not rewritten. Engines spawned as `node bin/useful-jobs.mjs run <id>`. |
| F01 managed API brief | Not copied. |
| `server/pricing.js`, homepages | **Not edited**. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Time an owner-qa sample run | `bin/value.mjs` | `node bin/value.mjs run vendor-budget-impact --buyer-class owner-qa --example --ledger <file> --out-dir …` | `sample=true`, `independentDemand=false`, `usableOutput` from catalog files | `test/journey.test.mjs` | None |
| Time caller files (not a sample) | `fixtures/caller/vendor-budget-impact/` | same with `--before` / `--after` | `sample=false`, still not demand | same | None |
| Read the ledger | `bin/value.mjs show` | `node bin/value.mjs show --ledger <file>` | two rows after the journey | same | None |
| Refuse missing buyerClass | request without `--buyer-class` | `run … --example` | `missing_buyer_class` | `test/seeded-failures.test.mjs` | None |
| Refuse fixture-buyer as independent | `fixtures/reject/fixture-buyer-as-independent.json` | `run … --buyer-class fixture-buyer --independent-demand` | `fixture_buyer_is_not_independent` | same | None |
| Refuse settlement-as-revenue | `fixtures/reject/sum-early-x402-as-job-revenue.json` | `node bin/value.mjs revenue --include-operation early-x402-revenue` | `settlement_is_not_job_revenue` | same | None |
| Refuse 8.105 as job revenue | `fixtures/reject/cited-banked-as-job-revenue.json` | `revenue --cited-banked-usdc` | `cited_banked_usdc_is_not_job_revenue` | same | None |
| Exact operationId join | evidence-records fixture | `run … --operation-id early-x402-revenue` | join matched, `jobRevenueUsdc` null | `test/pins-join.test.mjs` | None |
| Local HTTP archive pin | `lib/kit.mjs` | `--archive-origin http://127.0.0.1:<port>` | `kitSource=local-http`, not live site | `test/local-http.test.mjs` | None |
| Real local Postgres row | disposable `initdb` | library `runLabelledJob({ postgres })` | one row, `independent_demand=false` | `test/postgres.test.mjs` | None |

## Files

| Path | Role |
| --- | --- |
| `bin/value.mjs` | Public CLI |
| `lib/run.mjs` | Clock wrap + row |
| `lib/labels.mjs` | Required run buyerClass |
| `lib/engine.mjs` | Injected useful-jobs spawn |
| `lib/settlements.mjs` | Injected evidence-records join |
| `lib/hash-terms.mjs` | I01/S275 request hash |
| `lib/postgres.mjs` | Optional real Postgres store |
| `fixtures/` | Caller files + seeded rejects |
| `test/*.test.mjs` | `node:test` |
