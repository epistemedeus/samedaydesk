# FEATURE-MAP — offline extract-batch page-change job (W4-commerce-13 / W5-M05)

Own directory: `tools/page-change-offline-job/` only. Contract export: `PAGE_CHANGE_OFFLINE_CONTRACT` from `lib/index.mjs`. Engine `0.1.3`.

## CW34 independent source audit, 2026-09-12

Base: PR120 head `46a82f9d0863336c341176eee55ebb9c8de27484`, fetched from
`refs/pull/120/head`. The historical preflight below is not a current ref map.
`test/independent-audit.test.mjs` authors raw JSON fact pairs independently of
the existing customer and HTML fixtures. It exercises the actual CLI plus 96
deterministic mixed-JSON pairs (seed `0x34a57a`, 480 library comparisons) for
equality, key ordering, reversal, and repeatability.

| Witness | Current behavior |
| --- | --- |
| `0.1` vs `0.10000000000000002` | Distinct fractional facts remain changed |
| `19.9900` vs `1.999e1` | Equivalent decimal spellings remain unchanged |
| `0.1` vs `0.10000000000000001`, integer rounding, underflow, overflow | File input refused with exit 2 `input_precision`; no rounded unchanged claim |
| Literal `__proto__` member or key containing `/` and `~` | Member preserved; removal has an escaped JSON Pointer |
| `"1"` vs `1` | Change includes `beforeType`/`afterType`; Markdown names the type change |
| Partial row or non-null provider error with top-level success | Held facts remain comparable, but source-specific coverage issues prevent complete/current claims |
| Source reorder omitted at the change cap | `maxChanges` and incomplete completeness, including cap zero |
| Exactly one change followed by equal siblings at cap one | Complete if the remaining analysis fits the walk bounds |
| Equal deep objects and arrays | Equality cannot skip the depth/node budget |
| Job-file limits and in-memory library inputs | Same validated limits; library maxBytes enforced and non-finite numbers refused |
| Timestamps with and without milliseconds | Latest valid timestamp selected chronologically; invalid row time still makes freshness unknown |
| Source-order excerpts and non-BMP Unicode | Display byte cap respected without splitting a code point |

Numbers use JavaScript Number semantics only after the original file token has
the same decimal value as its shortest runtime serialization. This is a
round-trip acceptance boundary, not arbitrary-precision arithmetic. File
validation covers the entire document, including unselected metadata. Library
callers supplying `beforeJson`/`afterJson` have already parsed their numbers;
the engine cannot recover precision lost before that call. Exact higher
precision values must be supplied as string facts on both sides.

Depth starts at the selected-fields object (zero), counts actual child levels,
and includes empty member names. Node limits apply per matched source pair to
recursive comparisons and inspected array/subtree values on each side. They
bound analysis, not the initial JSON parse; maxBytes bounds held input size.
Change limits apply across rows and the source reorder. Excerpt limits are
display-only; full accepted values remain in the JSON evidence. Limits default
to 131072 bytes, depth 16, 4096 nodes, 64 changes, 200 excerpt bytes, 32 sources,
11 fields, and no freshness horizon. All limits are non-negative safe integers;
only `maxStaleMs` also accepts null to disable its horizon.

`changed` and `semantic` describe selected held JSON content or types. Neither
establishes business importance, browser visibility, or a live page event.
Missing top-level selected facts remain unknown coverage; removing a member
inside a present selected object remains an explicit removal.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS customer-job extract-batch fixtures | Present at `tools/recurring-job-recipes/fixtures/merchant/page-change/customer-job/` on `5b97d1b0` |
| `tools/recurring-job-recipes/vendor/page-change-bridge.mjs` | Present; requires `MERCHANT_INPUT_ROOT`. **Not imported.** |
| Catalog `page-change` job | Absent from `client/public/for-agents/useful-jobs/catalog.json`. **Not edited.** |
| offer-routing `sdd.page_change_offline` | Routes `page_change_evidence` to merchant skill. **Not edited.** Later W5-M01 binding: this CLI. |
| result-reuse | Exports existing `pilot/page-change-brief/v1`; does not compare. Compatible consumer. |
| Merchant `compare.mjs` | Not vendored. |
| I01 Neo PR54 `hashTermsVersion` | Not attached. Local hasher uses the same `sha256:` + 64 hex contract. Inject via `FUNDED_TASK_TERMS_MODULE`. Original F01 integer `termsVersion` rejected. |
| PR52 wrapper `aeef964f` | Read-only worktree. Not imported. This job stays a local CLI/engine. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Compare held extract-batch snapshots | published customer-job JSON | `node bin/page-change.mjs journey` | `verdict=changed`, `freshness=observed` when job `maxStaleMs` fits, `current=false` because coverage is incomplete | `test/journey.test.mjs`, `test/bounded-analysis.test.mjs` | None |
| Unchanged selected fields | `fixtures/unchanged/` | `job --job fixtures/unchanged/job.json` | `verdict=unchanged` | same | None |
| Title ASCII space-run noise | extra space in a title string | compare `title,description` | `verdict=unchanged`; other fields stay literal | `test/title-whitespace.test.mjs` | None |
| Canonically equivalent Unicode title | decomposed/composed `Café` in held title facts | compare `title,openGraph,links,text` | `verdict=unchanged`; NFC applies only to title and does not fold other field whitespace | `test/semantic-boundaries.test.mjs` | None |
| Fractional metadata with key-order noise | unchanged numeric `19.99` plus reordered object keys | compare held semantic-witness snapshots | `verdict=unchanged`; extraction JSON equality is separate from the integer-only terms hasher | same | None |
| Price, availability, and terms change | `19.99` to `24.99`, `in_stock` to `out_of_stock`, terms `v1` to `v2` | spawned CLI with a cold output directory | `verdict=changed`; each selected-field change remains explicit | same | None |
| Partial batch declaration | after batch has `partial=true`, `ok=false` despite comparable selected fields | spawned CLI | `verdict=incomplete`, `complete=false`, coverage codes retained | same | None |
| Mixed after-row age or missing time | one old/missing `completedAt`, one current row | compare with `--max-stale-ms` | oldest row makes freshness `stale`; missing row time makes it `unknown`; `current=false` | same | None |
| Nested metadata removal | selected nested attribute disappears | spawned CLI | semantic `remove`, without inventing a null value | same | None |
| Invalid calendar clock | syntactically shaped `2026-02-30...Z` | spawned CLI | exit 2 `clock_required` | same | None |
| Source-list reorder only | SDS merchant reordered fixtures | library `comparePageChange` | `verdict=reordered` | same | None |
| Truncated change list | `--max-changes 2` | compare | `verdict=changed`, `complete=false`, `limitsHit` includes `maxChanges` | `test/bounded-analysis.test.mjs` | None |
| Depth bound with surviving title change | `--max-json-depth 2` | compare | title semantic change kept, `complete=false`, `maxJsonDepth` | same | None |
| Stale held snapshots | `--max-stale-ms 1` | compare | `verdict=unchanged`, `freshness=stale`, exit 0 | same | None |
| Source-list slice | `--max-sources 1` | compare | `snapshot.*.truncated=true`, `maxSources` | same | None |
| Oversize file | `--max-bytes 32` | compare | exit 2 `input_bounds` | same | None |
| Refuse live URL | `--before http://127.0.0.1:…` | compare | `live_fetch_url`, server hits=0 | `test/local-runtime.test.mjs`, `test/seeded-failures.test.mjs` | None |
| Refuse payment retry | `--retry-payment` | compare | `payment_retry` | `test/seeded-failures.test.mjs` | None |
| Refuse quote as success | `fixtures/quote/quote-only.json` | compare | `quote_as_success` | same | None |
| Refuse SAMPLE as delivered watch | `--example` / SAMPLE job | compare/job | `sample_as_delivered_watch` | same | None |

## Files

| Path | Role |
| --- | --- |
| `bin/page-change.mjs` | Public CLI |
| `lib/contract.mjs` | Request/result contract for consumers |
| `lib/compare.mjs` | SDS-local engine |
| `lib/diff.mjs` | Selected-field JSON walk with honest truncation |
| `lib/clock.mjs` | Required clock plus optional observation horizon |
| `lib/hash-terms.mjs` | I01-format hasher + inject adapter |
| `lib/refuse.mjs` | Seeded fail-closed gates |
| `fixtures/customer-job/` | Byte copies of published SDS fixtures |
| `fixtures/bounded/` | Varied-input truncation/depth/title controls |
| `fixtures/semantic-witness/` | Original held HTML plus independently checked extract JSON for Unicode/noise and business-change controls |
| `test/*.test.mjs` | `node:test`, including spawned CLI |

## Later integration bindings (W5-M01)

1. Point `sdd.page_change_offline` artifact at `tools/page-change-offline-job/bin/page-change.mjs` (do not treat result-reuse as the compare).
2. Optional `FUNDED_TASK_TERMS_MODULE` → Neo `packs/funded-task-terms` hasher. Default hasher already matches I01 output shape.
3. Catalog listing is a separate public-surface change; not this package.
4. PR52 paid wrapper is the selected runner for hosted paid jobs. This engine was tested as the current CLI at `0.1.1`, not as a future wrapper behavior.

## Untested

- Live `POST /extract/batch` or merchant `POST /recipes/page-change`
- Neo hasher golden `complete.terms.json` (different terms body than this job)
- C1 URL-guard host normalization (identity is the stored `source` string)
- `claims.fresh` becoming true (this job never re-fetches)
- General browser visibility, CSS, or JavaScript semantics. The job compares selected facts already present in held extract JSON; the HTML witnesses test fixture provenance and are not accepted as CLI inputs.
- Dynamic-counter classification. A counter included in a selected extracted fact remains a literal content change; this engine does not claim that any change is a business event.
- External customer delivery
- PR52 `runPaidOffer` invoking this CLI

## Swarm frame (single assignment)

Done predicate: owned tests pass, RECEIPT + FEATURE-MAP committed, draft PR. No extra Cloud agents. Fan-out remains Root.
