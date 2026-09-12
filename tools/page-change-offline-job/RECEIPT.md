# RECEIPT — W4-commerce-13 offline extract-batch page-change job

## CW34 audit amendment, 2026-09-12

Native Astra read and tested PR120 source at
`46a82f9d0863336c341176eee55ebb9c8de27484` in the isolated remote VM clone on
`codex/cw34-page-engine-final-20260912`. Engine version is now `0.1.3`.
The dated implementation receipts below remain historical.

The independent audit adds raw JSON CLI pairs and a deterministic 96-pair
metamorphic audit, using Node's strict deep equality rather than the engine's
canonicalizer as the equality oracle. Reproduced defects cover numeric
information loss, metadata member identity, mixed-type evidence, partial/error
row completeness, change/depth/node/excerpt bounds, job-limit validation,
in-memory byte bounds, and observation timestamp ordering. See the current
`FEATURE-MAP.md` for exact semantics and limits.

Verification is native-agent execution on Node v22.23.2 with
`NODE_OPTIONS=--max-old-space-size=768`, test concurrency 1, and isolated temp
directories. The original 35-test suite passed before edits; its inherited
local-runtime test attempted a TCP connection to port 5432, without SQL or
database writes. That probe is removed. Subsequent tests use only the reserved
HTTP port 55541 for a zero-hit refusal check and a static database-dependency
check. No shared database is needed or accessed by the repaired suite.

The final source suite has 67 tests. The five M01 page-engine invocation tests
also pass when `W5_M01_ENGINE_ROOTS` explicitly maps `page-change-offline-job`
to this checkout. This proves invocation of the current CLI, not a rebuilt
distribution archive, paid-wrapper execution, or an independent controller
rerun. No sibling engine, wrapper, catalog pin, archive, deployment, live
extraction, payment, or outreach was changed.

```sh
NODE_OPTIONS=--max-old-space-size=768 npm test
# From the repository root, with W5_M01_ENGINE_ROOTS mapped to this engine:
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 \
  experiments/wave5/m01/test/invoke-page.test.mjs
```

Integration: review the CW34 draft stacked on PR120, then carry this owned
directory into the integration branch and explicitly rebuild/repin any frozen
distribution. Keep consumers tolerant of additive type evidence and the new
`input_precision` refusal. No merge or deployment is performed here.

## Historical receipts

W5-M05 amendment: see `experiments/wave5/m05/RECEIPT.md`. Engine `0.1.1` on
`cursor/w5-m05-co13-bounded-page-change-analysis-266c`. Contract export
`PAGE_CHANGE_OFFLINE_CONTRACT`. Tests: 26/26.

Tool: `tools/page-change-offline-job/`
Cloud branch: `cursor/w4-commerce-13-offline-extract-batch-page-change-job-no-merchant-kernel-3ddc`
Root-named identity: `codex/w4-commerce-13-20260911` (this Cloud checkout writes the Cursor branch)
Date: 2026-09-11
Node: v22.14.0
Base: `main` `5b97d1b02e786acd1895cfa1508087ae3f7a1545`
Implementation: `c0c08dfb9d2efc59e94c4d8ce1a93970b39ff178`
Branch head: `2ac6027e33de0eb2f79ee4e5ef9e9c3a888830eb`
Compare: https://github.com/epistemedeus/samedaydesk/compare/main...cursor/w4-commerce-13-offline-extract-batch-page-change-job-no-merchant-kernel-3ddc

## Outcome

SDS-local compare of two already-held `samedaydesk.extract-batch.v0` JSON files on explicit `sources[].data` fields. Writes `page-change.json` and `page-change.md`. Clock required. No fetch, pay, retry, or merchant `compare.mjs` import.

## Pins

| Item | Value |
| --- | --- |
| Write repo | epistemedeus/samedaydesk `main` |
| Own directory | `tools/page-change-offline-job/` (new) |
| Input SHA | `5b97d1b02e786acd1895cfa1508087ae3f7a1545` |
| Published fixtures | `tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/` |
| before.json sha256 | `23833bf7b28ca27a074cb9d73daaa2ec3beed14a55d767567c5fab50b66605f4` |
| after.json sha256 | `a7fdf95f161c67529a7254b1d2e1c4efa068506ac01edaee3c2561a5d09c9bd6` |
| Report schema | `pilot/page-change-brief/v1` (already consumed by result-reuse) |
| Hash terms | I01/F17 format `sha256:` + 64 hex. Integer `termsVersion` rejected. |
| Merchant compare.mjs | not imported, not vendored |
| offer-routing / catalog.json / homepage / `server/pricing.js` | not edited |
| Payments | nonsettling prototype only; `purchaseAuthorized` not granted |

## Evidence classes

| Class | What ran |
| --- | --- |
| fixture | Customer-job / unchanged / reorder SDS JSON files |
| local-runtime | Real `127.0.0.1` HTTP server for URL-input refusal (0 hits) |
| external | Not run. No live extract, merchant HTTP recipe, or customer message |

Postgres `127.0.0.1:5432` → `ECONNREFUSED`. This job has no SQL public interface; a store was not invented.

## Literal journey

```sh
cd tools/page-change-offline-job
node bin/page-change.mjs journey \
  --fixture ../../tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/job.json \
  --out-dir /tmp/page-change-out
```

From repo root:

```sh
node tools/page-change-offline-job/bin/page-change.mjs compare \
  --before tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/before.json \
  --after tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/after.json \
  --fields title,description,headings \
  --clock 2026-09-08T12:00:00.000Z \
  --out-dir /tmp/page-change-out
```

Recorded: `verdict=changed`, matched 2, missing 1, failed 1, coverageUnknown 1 (vendor-alpha `description`, not deletion), semantic 2, order 1 (widgets `headings/h2`). `networkUsed=false`. `paymentImpliesUsefulOutput=false`. `charged` on after (`true`) is not success.

Journey `termsVersion`: `sha256:a51d5a25585a8dde706cdc954fa4fbc2aeed50b3599cfb8791c601eb5932c0f4`

## Tests

```sh
node --test --test-concurrency=1 tools/page-change-offline-job/test/*.test.mjs
```

**PASS** — 16 tests, 0 fail on Node v22.14.0. No extra npm packages.

Seeded rejects:

| Input | Code |
| --- | --- |
| `https://…` or local HTTP URL as `--before` | `live_fetch_url` |
| `--retry-payment` / job `retryPayment` | `payment_retry` |
| quote-only JSON or `--treat-quote-as-success` | `quote_as_success` |
| `--example` / SAMPLE job as delivered watch | `sample_as_delivered_watch` |
| missing `--clock` | `clock_required` |
| integer `termsVersion` | `integer_terms_version` |

## Dependencies

- Node.js `>=22` (tested v22.14.0)
- SDS extract-batch fixtures on this tree
- Optional later: `FUNDED_TASK_TERMS_MODULE` pointing at Neo `packs/funded-task-terms` `hashTermsVersion`

Merchant PR54 is not an execution dependency.

## Next integration owner

Root. Bind `sdd.page_change_offline` to this CLI when ready. Do not wait on sibling W4 packages.

## Honesty

No deploy, purchase, live payment, account change, or customer messages. SameDayDesk / EIN.LLC / Neomorphic homepages untouched.
