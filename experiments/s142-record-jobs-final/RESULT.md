# S142 RESULT — consumer verification of S134 record-job CLIs

Cash **$0**. No paid calls, submitted data, deploy, default merge, or public listing. Pulse/Agensi gates not revisited.

## Owning repo (fetch here — not merchant)

| Field | Exact value |
|---|---|
| **Owning GitHub repo** | `epistemedeus/samedaydesk` |
| Remote observed on VM | `https://github.com/epistemedeus/samedaydesk` |
| S134 source branch | `codex/s134-record-jobs-20260910` |
| S134 tip Root collected | `baa0e2c47142c4767f0746efc4ff69af341bbae7` |
| S142 branch | `codex/s142-record-jobs-final-20260910` |
| Source build path (kept on VM) | `experiments/s134-record-jobs` |
| Consumer path | `experiments/s142-record-jobs-final` |

Merchant context only (not this package): `epistemedeus/x402-url-extractor@1a23b648`. S122 `c0255ac` still **unresolved**.

## Product pins (locked)

| Asset | Pin |
|---|---|
| Node | `v22.14.0` (`npm ci` clean) |
| `yaml` | `2.9.0` (ISC) |
| `csv-parse` | `7.0.2` (MIT) |
| `fast-xml-parser` | `5.11.1` (MIT) |
| `npm audit` | 0 vulnerabilities after `npm ci` |
| Native model | `grok-4.6` + `--reasoning-effort xhigh` (SuperGrok Heavy display) |
| Concurrent child ceiling | catalog **unknown**; S134 overlap **≥24 is LB only**, not a ceiling |
| Subagent depth | max 1 (no grandchildren) |

## Defects fixed (with regressions)

1. **OpenAPI** — used-op `security` and response schema `$ref` changes now surface under `impact.changed` (no false `unchanged`).
2. **Pricing** — cross-unit rows are `cross-unit-incomparable` (no numeric equality claim); missing cells are `missing-cell`, never `fieldChanges`.
3. **CSV** — duplicate key columns → `rowDrift.mode = duplicate-keys-blocked` (no silent last-wins overwrite).
4. **RSS/Atom** — `missing-item-id` + `date-ambiguity` / `date-ambiguity-correction` exposed; corrections still reported.

Source tests: **32/32** (`npm test` in `experiments/s134-record-jobs`). Demos: `npm run demo:all` exit 0.

## Independent consumer drive (exported CLIs)

Fixtures under `experiments/s142-record-jobs-final/consumer-fixtures/` (independently authored; not s134 helpers). Sources/licenses in each `SOURCE.md`.

| CLI | Gate | Focused summary |
|---|---|---|
| `s134-openapi-impact` | no false unchanged | `unchangedCount: 0`; changed `GET /v1/catalog` fields: `responses`, `security` |
| `s134-pricing-table-change` | no cross-unit / missing as field change | `fieldChangeCount: 0`; conflicting reasons: `cross-unit-incomparable`, `missing-cell` |
| `s134-csv-drift` | no silent duplicate overwrite | `rowDriftMode: duplicate-keys-blocked` |
| `s134-rss-atom-brief` | missing id + date ambiguity | uncertainty codes include `missing-item-id`, `date-ambiguity`; corrections on 3 keys |

Consumer tests: **2/2**. `consumer-out/gate.json` → `ok: true`. Full JSON on disk under `consumer-out/`; summaries only in RESULT.

## Native `/usage` (read once, then reaped)

| Field | Observed |
|---|---|
| Captured at (UTC) | `2026-09-10T11:36:51Z` |
| Plan | Weekly limit (SuperGrok Heavy) |
| Used | **71%** |
| Remaining | **29%** |
| Resets | display `September 10, 18:27` → interpreted **`2026-09-10T18:27:00Z`** |
| Reset/overage observed | **false** |
| Reader | native Grok TUI `/usage` via tmux; session killed after capture |

Artifact: `experiments/s142-record-jobs-final/native-parent/usage-capture/usage.json`.

## Native cells / overlap

No quota-filler cells. S141 amends can reuse native parent context on this VM. S134's **24 overlap remains a lower bound**, not a measured ceiling. Separate OS sessions / provider requests / completed outputs kept distinct from this Cursor dispatch.

## Non-claims

- `paidValueClaim: false` on all CLI outputs
- Support is bounded; unknowns preferred over invented OpenAPI/RSS/CSV completeness
- No package export/import work (S127)
