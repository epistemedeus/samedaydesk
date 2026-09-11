# H4 precise repairs — receipt

- **SDS start HEAD:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 merge)
- **Branch:** `fable/h4-precise-repairs`
- **Compare URL:** https://github.com/epistemedeus/samedaydesk/compare/main...fable/h4-precise-repairs
- **Draft PR:** `gh pr create --draft` failed (`Resource not accessible by integration`). Not merged. Not deployed.
- **Heavy session id:** `1434eeed-5e5c-48d1-b2d1-1ea29c966400`
- **Merchant pin:** `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (`fixtures/merchant-pr54/indexing-payload-continuity.mjs`)
- **Runtime:** Node v22.22.2; tests via `node --experimental-strip-types --test tests/*.test.ts`
- **Secrets:** none

## Commands

| Command | Result |
| --- | --- |
| Inspect SDS catalog, `verified.json`, `server/pricing.js`, ResourceServer hooks | Current source recorded (see contradictions) |
| `npm test` (this pack) | **pass** — 30/30 |
| `git push -u origin fable/h4-precise-repairs` | **pass** |
| `gh pr create --draft` | **fail** — integration token cannot create PRs |

## Contradictions vs brief (followed current source)

- SDS at PR51 has **no** ResourceServer `onBeforeVerify` / `onBeforeSettle` and **no** `verifyPayment` / `settlePayment` assignments. Those names exist on the copied x402-url-extractor PR54 fixture, not on SDS server. Encoded as diagnostics only; no live hook install.
- Brief “no live $15 job”: SDS hosted `seller_contract_repair` is **$490.00** (`server/pricing.js`). No $15 offer exists. Pack is G01 proposal-only at any price.
- Live unpaid-402 pins match the brief’s do-not-change list: `GET /extract` **$0.005** (atomic `5000`), `GET /commerce/seller-integrity-audit` **$0.01** (atomic `10000`), asset Base USDC, network `eip155:8453` (`client/public/x402/verified.json`).
- Six useful jobs are free offline (`purchaseAuthority: false` in catalog). Used as repair subjects, not F08 paid wrappers.
- `client/src/data/machineEntry.mjs` still pins an older extractor commit (`ef46e2b…`). This pack uses the specified PR54 pin only for indexing-payload continuity diagnostics.

## Scope held

Own directory only. No homepage styles, live price edits, payment-route reassignment, merchant PRs, deploy, or Wave 1/2 features.

# H4R — defect corpus

- **SDS start HEAD:** `5b97d1b02e786acd1895cfa1508087ae3f7a1545` (PR51 merge; unchanged)
- **H4 pack HEAD (base of this branch):** `03c01edb39f4df4fad7485b0ce7ff8638034e8d6`
- **Branch:** `fable/h4r-defect-corpus`
- **Compare URL:** https://github.com/epistemedeus/samedaydesk/compare/main...fable/h4r-defect-corpus
- **Draft PR:** retried `gh pr create --draft --base main --head fable/h4r-defect-corpus`. Failed: `Resource not accessible by integration (createPullRequest)`. No PR exists for this head or for `fable/h4-precise-repairs`. Not merged. Not deployed.
- **Prior H4 Heavy session:** `1434eeed-5e5c-48d1-b2d1-1ea29c966400`
- **This H4R parent session:** `512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3`
- **Merchant pin:** `a143898dd1ec35c097ca7eb0b472f30dad1ee319` (diagnostics only)
- **Runtime:** Node v22.22.2; `npm test` then `node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/`
- **Secrets:** none

## Child sessions (10 native)

Simultaneous peak: **10** native children in one spawn wave. No re-spawn. Parent owned integration, FEATURE-MAP, RECEIPT, commits, and push.

| # | Session id | What it did |
| --- | --- | --- |
| 1 | `01a091ef-6a8a-7a93-8f4d-e9b76fd0ce76` | Gap close: `npm test` 30/30, push `fable/h4r-defect-corpus`, retry draft PR (failed), record compare URL |
| 2 | `01a091ef-6a8a-7a93-8f4d-e9cf9dcc350b` | M-SDS-F08 SAMPLE/`--example` reserved-fixture reproduction + reject-as-not-a-sale (no F08 product) |
| 3 | `01a091ef-6a8a-7a93-8f4d-e9db77d804ea` | F18-health: agents `GET /health` unsupported vs live `/healthz`; SDS `/api/health` untouched |
| 4 | `01a091ef-6a8a-7a93-8f4d-e9e5c336d5ef` | F18-bytes: gzip/br Content-Length ≠ decoded JSON utf8 pin |
| 5 | `01a091ef-6a8a-7a93-8f4d-e9f6339b1c52` | F18-402: unpaid 402 atomic 5000/10000 is unpaid-held; treating 402 as success rejected |
| 6 | `01a091ef-6a8a-7a93-8f4d-ea0228133856` | F18-sample: SAMPLE completion is not customer use; fixture-becomes-sale kept (`intake.ts` not edited) |
| 7 | `01a091ef-6a8a-7a93-8f4d-ea1769734e71` | Out-of-scope briefs: M-termsVersion, M-F07, M-F02-pr; Neo-not-patched-on-SDS guard |
| 8 | `01a091ef-6a8a-7a93-8f4d-ea25f79bb7ac` | Notes: F18-routes (live 23 / older 22 / local 20), M-H4-api, M-F16-meter |
| 9 | `01a091ef-6a8a-7a93-8f4d-ea3dcf159e4c` | Guardrails: seeded failures still rejected + F01/F07 Neo-on-SDS claim refused |
| 10 | `01a091ef-6a8a-7a93-8f4d-ea49a267ac79` | Corpus runner `bin/repair.ts corpus --fixtures fixtures/corpus/` |

## Runtime (best-effort)

| Item | Value |
| --- | --- |
| Started (UTC) | 2026-09-11T19:22:21Z (first pack `npm test` this session) |
| Ended (UTC) | see final JSON `runtime.ended` after last push |
| Host | 4 CPUs; MemTotal 16398384 kB; loadavg ~1.00–1.06 during the child wave |
| Peak RSS observed | `grok` ~215 MiB (`/proc` `ps` RSS 214968 kB mid-wave); parent shell ~11 MiB. Chrome on the host is larger and unrelated. |
| Simultaneous native sessions | 10 |
| Admissions / retries | 10/10 children admitted on first spawn. No parent re-spawn. `gh pr create` failed once (expected). Children 3, 6, 8, 10 logged 1–2 internal tool errors and recovered. `grok usage` in this environment listed child ids only — no admission counters. |

## Defect corpus dispositions

| id | Disposition | Notes |
| --- | --- | --- |
| M-SDS-F08 | `fixed_with_regression` | This tree has **no** `server/paid-useful-jobs/`. F08 product lives on `origin/fable/f08-paid-wrappers` (`bae3e7c`, draft [PR 52](https://github.com/epistemedeus/samedaydesk/pull/52), not merged). First reviewer gap: SAMPLE/`--example` still got `reserved-fixture` funding; `RECEIPT-REVIEW.md` was absent until `a86ae16` on that branch. Commit `95d9d21` on F08 rejects SAMPLE as `sample-not-a-sale`. Pack-local wrapper reproduces the unguarded reserved-fixture path and rejects SAMPLE funding as not-a-sale. Does not invent a sale. |
| M-termsVersion | `briefed_out_of_scope` | F01 integer `termsVersion` vs F17/F02 content hash. Neo not in this workspace. Brief: `briefs/M-termsVersion.md`. Not patched on SDS. |
| M-F07 | `briefed_out_of_scope` | Neo `harness_fixture` labelled insufficient. SDS `fable/w2-09-f07-consumer-evidence-refresh` is a different F07 (consumer evidence refresh) and was not patched here. Brief: `briefs/M-F07.md`. Not patched on SDS. |
| M-F02-pr | `noted` | F02 PR create URL only. Same class as this pack’s `gh` miss. No SDS code change. |
| M-H4-api | `noted` | Short API result vs delivered branch. This RECEIPT + non-truncated final JSON is the collector deliverable. |
| F18-health | `reproduced` | Agents gateway `GET /health` unsupported; live probe is `GET /healthz` (`client/src/data/machineEntry.mjs` LIVE_INVENTORY). SDS Express `GET /api/health` (`server/routes/health.js` mounted at `/api`) is not this defect and was not changed. |
| F18-bytes | `reproduced` | gzip Content-Length 191 vs decoded JSON 219 bytes on the pack fixture; br 144 vs 219. Compressed length is not the JSON pin. No production change. |
| F18-402 | `fixed_with_regression` | 402 + extract atomic 5000 / seller-integrity-audit atomic 10000 is unpaid-held. Treating 402 as success fails. Live prices unchanged. F18 journeys: 28 probes / 0 mismatches / 2 unpaid-held. |
| F18-sample | `fixed_with_regression` | SAMPLE / `--example` / fixture completion is not customer use. H4 fixture-becomes-sale kept and strengthened in `src/f18-sample.ts`. |
| F18-routes | `noted` | F18 live `routeCount` 23 vs older 22. This tree’s `client/public/x402/verified.json` has **20** routes. Observation only; feed not edited. |
| M-F16-meter | `noted` | F16 meter vendored; Pilot not attached; SDS cannot push Pilot. No meter product on this tree. Brief: `briefs/M-F16-meter.md`. |

## Commands (H4R)

| Command | Result |
| --- | --- |
| `cd experiments/cursor-wave-20260911/h4-precise-repairs && npm test` (gap close) | **pass** — 30/30 |
| `npm test` (after corpus) | **pass** — 96/96 |
| `node --experimental-strip-types bin/repair.ts corpus --fixtures fixtures/corpus/` | **pass** — 11 ids, `missingIds: []`, `canarySettled: false`, `saleState: not_a_sale` |
| `git push -u origin fable/h4r-defect-corpus` | **pass** |
| `gh pr create --draft` | **fail** — `Resource not accessible by integration (createPullRequest)` |

## Quoted F08 facts (this tree vs F08 branch)

- `server/paid-useful-jobs/` is **absent** on `fable/h4r-defect-corpus` / H4 base.
- `origin/fable/f08-paid-wrappers` contains `lib/sample-guard.mjs`, `lib/funding.mjs` (`classifyFunding` SAMPLE + sale-like → `fundingState: "rejected"`, `code: "sample-not-a-sale"`), `fixtures/payment/reserved-fixture.json`, and `RECEIPT-REVIEW.md`.
- Draft PR 52 remains draft/open. This pack did **not** copy that product into `server/paid-useful-jobs/`.

## Scope held (H4R)

No Wave 1 F08 paid-wrappers product. No Wave 3 W3-* products. Live prices unchanged (`$0.005` / `$0.01`). No deploy, payment, secrets, merchant PR, overage, or reset redemption. SDS homepage styles untouched. Node 22. F01/F07 Neo residuals briefed only — not claimed as SDS patches.
