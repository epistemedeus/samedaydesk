# FEATURE-MAP — buyer value ledger (W4-commerce-16)

Own directory: `tools/buyer-value-ledger/` plus Wave5 receipt `experiments/wave5/d13/RECEIPT.md`.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545` | Attached. Wave5 branch continues Co16 head `aa306e2`. |
| useful-jobs catalog + archive | Catalog 1.4.3 unpublished. vendor-budget-impact receipts use the 1.0.0 wrapper archive (`6bf65039…`, 2522418 B). M01 jobs use source-identity pins. Runtime pin `8a811bba`. |
| evidence-records closed sets | `tools/evidence-records/lib.mjs` imported; operationId observed only binds as this job when settlement `jobId` matches. |
| I01 Neo PR54 earned-work | **Not attached.** Hash terms follow published S275 `crypto.hashRequest` (stable-JSON SHA-256). No competing kernel copy. |
| Current core `server/paid-useful-jobs/` | Read-only import of execution.v1 through the request desk. Archive-origin/file overrides are refused. |
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
| Refuse wrong-source cache/archive | `--archive-file` / `--archive-origin` | CLI run with unpinned bytes after a warm cache | `archive_pin_mismatch`, `usefulPaidWork=false` | `test/binding.test.mjs` | None |
| Unrelated settlement is not this job | `--operation-id early-x402-revenue` | exact operationId found, `boundToThisJob=false` | `test/binding.test.mjs`, `test/pins-join.test.mjs` | None |
| Failed result / leftover files | crash adapter or non-directory `--out-dir` | `outcomeKind=engine_failure` or `transport_failure` | `test/binding.test.mjs` | None |
| Valid analysis refusal vs crash | invalid caller JSON | `outcomeKind=analysis_refusal`, not a crash | `test/binding.test.mjs` | None |
| Thin D01 consumer | SDS52 pin `aeef964` worktree | `runPaidOffer` imported, wrapper not copied | `test/d01-consumer.test.mjs` | None |
| Local HTTP archive pin | `lib/kit.mjs` | `--archive-origin http://127.0.0.1:<port>` | `kitSource=local-http`, not live site | `test/local-http.test.mjs` | None |
| Real local Postgres row | disposable `initdb` | library `runLabelledJob({ postgres })` | one row, `independent_demand=false` | `test/postgres.test.mjs` | None |

## Files

| Path | Role |
| --- | --- |
| `bin/value.mjs` | Public CLI |
| `lib/run.mjs` | Clock wrap + row |
| `lib/labels.mjs` | Required run buyerClass |
| `lib/engine.mjs` | Injected useful-jobs spawn |
| `lib/index.mjs` | Published contract: `runLabelledJob`, `joinSettlement`, `classifyUsefulPaidWork` |
| `CONTRACT.md` | Interface for D01 and other consumers |
| `lib/outcome.mjs` | Transport vs analysis vs paid-work blockers |
| `lib/d01.mjs` | Current SDS52 pin import, no wrapper copy |
| `lib/settlements.mjs` | Injected evidence-records join; job-bound vs observed operationId |
| `lib/hash-terms.mjs` | I01/S275 request hash |
| `lib/postgres.mjs` | Optional real Postgres store |
| `fixtures/` | Caller files + seeded rejects |
| `test/*.test.mjs` | `node:test` |
