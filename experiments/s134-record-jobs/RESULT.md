# S134 RESULT

Cash boundary: **$0**. No paid fetch/LLM/notifications. No deploy/default merge/accounts. Package export/import impact owned by **S127** (not duplicated here).

## Product pins

| Asset | Pin / note |
|---|---|
| yaml | `^2.9.0` (ISC) |
| csv-parse | `^7.0.2` (MIT) |
| fast-xml-parser | `^5.11.1` (MIT) |
| Merchant context | `epistemedeus/x402-url-extractor@1a23b648` MIT — context only, not re-wrapped |
| S122 merchant `c0255ac` | **unresolved** in this checkout |
| Native model | `grok-4.6` + `--reasoning-effort xhigh` (subscription display SuperGrok Heavy) |
| Subagent depth | docs max **1** (no grandchildren) — verified |
| Concurrent child ceiling | catalog `null` (**unknown**); user-reported 64 **unverified**; measured overlap lower bound **≥24** |

`npm audit`: 0 vulnerabilities at install.

## Modules / tests / demos

| CLI | Role |
|---|---|
| `s134-openapi-impact` | Used-operation OpenAPI before/after impact |
| `s134-pricing-table-change` | Extracted pricing field/unit deltas |
| `s134-csv-drift` | Schema + row drift with uncertainty |
| `s134-rss-atom-brief` | RSS/Atom correction + dedup brief |

- Tests: **28/28** (`npm test`)
- Demos: `npm run demo:all` exit 0 (`demos/INDEX.md`)
- Free baseline: manual local inspection / `diff` of supplied files
- Delivered difference: structured JSON impact/drift/brief with `paidValueClaim:false` and explicit uncertainties (empty/partial/conflicting/unknown)

Parent kept a small RSS message-clarity amend from concurrent review; tests remain green.

## Native Heavy cells (24 / 24)

Prelaunch: MemAvailable=10.417 GiB; reserve25=3.91 GiB; headroom=6.508 GiB; PSI `some avg10=0.00 avg60=0.00 avg300=0.00 total=0`; est@200Mi=33.

| Wave | Action | Alive after | Rejects |
|---|---|---|---|
| wave0 initial9 | launch | 9 | none |
| wave1 +3 (while alive) | launch | 12 | none |
| wave2 +6 (while alive) | launch | 18 | none |
| wave3 +6 (while alive) | launch | 24 | none |

Peak native child overlap observed: **24**. PSI stayed ~0 at admission. **Zero admission rejects.** Ceiling above 24 remains unknown.

Latency start→exit: min 82.3s / median 139.0s / max 275.6s. All `exitCode=0`. Receipts on disk: 24/24.

| Cell | Session ID | Latency s | Exit | PID |
|---|---|---|---|---|
| C01 | `01a08b0a-530c-78b0-aa1e-8f8a584bdb20` | 136.525 | 0 | 93717 |
| C02 | `01a08b0a-539a-70d3-beb4-9b712131ad42` | 118.764 | 0 | 93820 |
| C03 | `01a08b0a-5448-7bc0-8a92-545d58dc5c12` | 187.848 | 0 | 94269 |
| C04 | `01a08b0a-5530-74c1-b156-fd2eec83b2eb` | 119.51 | 0 | 94713 |
| C05 | `01a08b0a-55b9-75a0-ba33-f59c72c812b1` | 144.011 | 0 | 95293 |
| C06 | `01a08b0a-5651-7651-ad1f-f2321ec70421` | 121.037 | 0 | 95788 |
| C07 | `01a08b0a-5726-7a01-94fe-5fbf646489cf` | 147.444 | 0 | 96381 |
| C08 | `01a08b0a-578d-7433-9060-bb665a80e367` | 129.606 | 0 | 96985 |
| C09 | `01a08b0a-587a-7851-a833-deab3a3ca593` | 173.488 | 0 | 97522 |
| C10 | `01a08b0a-5960-7560-8907-85d5088e3e28` | 176.707 | 0 | 97986 |
| C11 | `01a08b0a-5a3f-70e3-9f56-cd81f99f7481` | 125.565 | 0 | 98470 |
| C12 | `01a08b0a-5a69-7be3-8152-e5b7ad5932da` | 177.923 | 0 | 98919 |
| C13 | `01a08b0a-5bbb-7af3-9aa9-42e1a8ebaed1` | 182.082 | 0 | 99353 |
| C14 | `01a08b0a-5c69-70d0-a30c-da262aa5ecbc` | 142.249 | 0 | 99801 |
| C15 | `01a08b0a-5cab-7ab3-86bf-2515a269af8c` | 82.292 | 0 | 100361 |
| C16 | `01a08b0a-5df2-73a0-ace2-d97a81a51360` | 123.338 | 0 | 101051 |
| C17 | `01a08b0a-5e0e-7c02-a096-6bfbef405f8c` | 135.836 | 0 | 101443 |
| C18 | `01a08b0a-5fec-7d60-9d25-e1b2f22f208f` | 134.944 | 0 | 101917 |
| C19 | `01a08b0a-5f95-7790-9ab1-e68624570ed4` | 129.582 | 0 | 102645 |
| C20 | `01a08b0a-5f65-7151-9289-07340d157f80` | 127.326 | 0 | 103193 |
| C21 | `01a08b0a-6094-7f83-b0bd-57aed6244127` | 141.459 | 0 | 103978 |
| C22 | `01a08b0a-6150-7d61-815b-44d9ba5ce56f` | 152.58 | 0 | 104695 |
| C23 | `01a08b0a-6270-70f2-935d-9f4e6786ab33` | 264.078 | 0 | 105399 |
| C24 | `01a08b0a-6438-7a40-b00d-7f27454f56b7` | 275.636 | 0 | 106148 |

## Unknowns / remaining

- Hard concurrent child ceiling (catalog null; ≥24 measured; 64 unverified)
- S122 `c0255ac` object identity
- Provider weekly usage meters (unavailable here)
- Stop at provider limit; no overage/reset performed

## S142 gate fixes (same source tree)

Applied on branch `codex/s142-record-jobs-final-20260910` without duplicating S127 export work:

- OpenAPI: detect used-op `security` + response `$ref` (no false unchanged)
- Pricing: cross-unit → `cross-unit-incomparable`; missing → `missing-cell` (not fieldChanges)
- CSV: duplicate keys → `duplicate-keys-blocked` (no silent overwrite)
- RSS: `missing-item-id` + `date-ambiguity` exposed

Regressions: +4 tests (32/32). Consumer verification lives in `experiments/s142-record-jobs-final/`.

## S147 chat-advisory amend

Branch `codex/s147-record-jobs-chat-amend-20260910` preserves S142 gates and closes remaining F1–F6 cases (local-ref/schema OpenAPI coverage, unit case preservation, CSV header/width evidence, feed duplicate ambiguity, body coverage, non-feed indeterminate). Receipt: `experiments/s147-record-jobs-chat-amend/RESULT.md`.
