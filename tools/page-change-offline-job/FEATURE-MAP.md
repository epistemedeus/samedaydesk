# FEATURE-MAP — offline extract-batch page-change job (W4-commerce-13)

Own directory: `tools/page-change-offline-job/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS customer-job extract-batch fixtures | Present at `tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/` on `5b97d1b0` |
| `tools/recurring-job-recipes/vendor/page-change-bridge.mjs` | Present; requires `MERCHANT_INPUT_ROOT`. **Not imported.** |
| Catalog `page-change` job | Absent from `client/public/for-agents/useful-jobs/catalog.json`. **Not edited.** |
| offer-routing `sdd.page_change_offline` | Routes `page_change_evidence` to merchant skill. **Not edited.** Later Root binding: this CLI. |
| result-reuse | Exports existing `pilot/page-change-brief/v1`; does not compare. Compatible consumer. |
| Merchant `compare.mjs` | Read-only at `x402-url-extractor@f9dd59ae`. Not vendored. |
| I01 Neo PR54 `hashTermsVersion` | Not attached. Local hasher uses the same `sha256:` + 64 hex contract. Inject via `FUNDED_TASK_TERMS_MODULE`. Original F01 integer `termsVersion` rejected. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Compare held extract-batch snapshots | published customer-job JSON | `node bin/page-change.mjs journey` | `verdict=changed` | `test/journey.test.mjs` | None |
| Unchanged selected fields | `fixtures/unchanged/` | `job --job fixtures/unchanged/job.json` | `verdict=unchanged` | same | None |
| Source-list reorder only | SDS merchant reordered fixtures | library `comparePageChange` | `verdict=reordered` | same | None |
| Refuse live URL | `--before http://127.0.0.1:…` | compare | `live_fetch_url`, server hits=0 | `test/local-runtime.test.mjs`, `test/seeded-failures.test.mjs` | None |
| Refuse payment retry | `--retry-payment` | compare | `payment_retry` | `test/seeded-failures.test.mjs` | None |
| Refuse quote as success | `fixtures/quote/quote-only.json` | compare | `quote_as_success` | same | None |
| Refuse SAMPLE as delivered watch | `--example` / SAMPLE job | compare/job | `sample_as_delivered_watch` | same | None |

## Files

| Path | Role |
| --- | --- |
| `bin/page-change.mjs` | Public CLI |
| `lib/compare.mjs` | SDS-local engine |
| `lib/hash-terms.mjs` | I01-format hasher + inject adapter |
| `lib/refuse.mjs` | Seeded fail-closed gates |
| `fixtures/customer-job/` | Byte copies of published SDS fixtures |
| `test/*.test.mjs` | `node:test` |

## Later integration bindings (Root)

1. Point `sdd.page_change_offline` artifact at `tools/page-change-offline-job/bin/page-change.mjs` (do not treat result-reuse as the compare).
2. Optional `FUNDED_TASK_TERMS_MODULE` → Neo `packs/funded-task-terms` hasher. Default hasher already matches I01 output shape.
3. Catalog listing is a separate public-surface change; not this package.

## Untested

- Live `POST /extract/batch` or merchant `POST /recipes/page-change`
- Neo hasher golden `complete.terms.json` (different terms body than this job)
- C1 URL-guard host normalization (identity is the stored `source` string)
- `claims.current` / `claims.fresh` becoming true
- External customer delivery

## Swarm frame (single assignment)

Done predicate: owned tests pass, RECEIPT + FEATURE-MAP committed, draft PR. No extra Cloud agents. Fan-out remains Root.
