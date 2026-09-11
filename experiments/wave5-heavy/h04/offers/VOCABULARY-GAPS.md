# Vocabulary gaps (W5-H04)

Findings about **token mismatch** between pinned engine output and useful-job oracles. Not product bugs of stale heads. FAILURE-TAXONOMY.md already states several of these; this file records where the 12 examples hit them.

No engine crashed. Missing `status` stays `unknown` (not inferred). SAMPLE/`--example` was not used as a customer job.

## Cross-family no-change tokens

| Family | Example | Engine | Engine token | Oracle `expectedStatus` | Harness `compare` |
| --- | --- | --- | --- | --- | --- |
| schema-webhook | h04-schema-02 | w4-json-schema-webhook-drift `94c7bfd…` | `informational` | `unchanged` | match (aliased) |
| schema-webhook | h04-schema-03 | same | `informational` | `unchanged` | match (aliased) |
| lockfile | h04-lock-03 | w4-lockfile-pin-delta `e81efc8…` | `informational` | `informational` | match |
| page-facts | h04-page-02 | w4-page-change-offline-job `91b5733…` | `verdict=unchanged` | `unchanged` | match |
| api-routes | h04-route-03 | w4-route-table-diff `7387eb6…` | *(no status key)* `ok: true` | `ok` | unknown |

`compare.mjs` `normalizeStatus` treats `unchanged`, `informational`, `no-change`, `no_change`, `none` as one bucket. That hides the schema-02/03 literal gap.

Taxonomy (schema/lock): no-change used paths / zero pin delta → `informational`, **not** a synonym of `unchanged`. Page-change uses `unchanged` as a first-class verdict. Route-table-diff has no success-status enum.

## Exact mismatches

### 1. `informational` vs `unchanged` (schema no-break)

- Engine stdout + `drift-brief.json`: `"status": "informational"`.
- Markdown: `Status: **informational**`.
- Summary: `No structural used-path drift. Not a runtime compatibility proof.`
- Oracle `expected-report.json` for h04-schema-02 and h04-schema-03: `"status": "unchanged"`, `consumersBreak: false`.
- Family RECEIPT already names this: W4 labels equality `informational`; the useful-job oracle uses `unchanged` when the buyer should take no action.

Lock-03 oracle uses `informational` (aligned). Schema oracles do not. Cross-family oracle inconsistency, not an engine rewrite.

### 2. Route-table-diff has no `status` vs oracle `"ok"`

- `route-diff.json` / CLI stdout: `"ok": true`, counts, `tableDigest`. No `status` or `verdict`.
- Oracle `h04-route-01` / `h04-route-03`: `"status": "ok"`.
- Harness: `facts.status` actual `null` → `unknown`. Highlights (`Added: 1` / `Added: 0`, …) still matched.
- Type gap: oracle string `"ok"` vs engine boolean `ok: true`.

Do not treat `unknown` as a failed route diff. The useful counts are present.

### 3. Page-change `verdict` vs oracle `status`

- Engine: `report.verdict` = `changed` | `unchanged` | `reordered`. No `status` on the report object.
- Oracle: both `"status"` and `"verdict"` set to the same string.
- Harness walks `verdict` when `status` is absent, so h04-page-01/02/03 compare as `match`.
- Literal key names still differ from schema/lock (`status`) and route (none).

### 4. Highlight phrase `integrity-only` vs `changeKinds: ["integrity"]` (h04-lock-02)

- Engine JSON: `"changeKinds": ["integrity"]`, name `ms`, version stays `2.1.3`.
- Engine markdown: `` `ms` at `node_modules/ms` `` then `integrity: sha1-V0yBOM4dK1hh8LR... -> sha512-6FlzubTLZG3J2...` (truncated).
- Harness `runs/h04-lock-02/.../compare.json`: mismatch on highlight `ms@2.1.3 integrity-only` (phrase never in artifacts). Status `actionable` matched.
- Current `expected-report.json` highlights no longer include `integrity-only` (now `"name": "ms"`, `integrity`). Recorded harness result is from the earlier oracle string.

### 5. Schema no-break briefs do not echo used pointers or unused field names

h04-schema-02 `example.json` `expectedHighlights`: `/ref`, `/ref_type`, `/pusher_type`, `ignoredUnused`, `custom_properties`.

- `ignoredUnused` appears as a JSON key (`true`).
- `/ref`, `/ref_type`, `/pusher_type` do **not** appear in `drift-brief.json` or `.md` (only `unchangedCount: 3`).
- `custom_properties` is correctly **absent** (unused additive). Oracle `notReported` lists it; `example.json` highlights still ask for the string.

h04-schema-03 `example.json` `expectedHighlights`: `/id`, `/type`, `/source`, `/specversion`, `no consumer action`.

- Pointers not echoed (only `unchangedCount: 4`).
- Engine never says `no consumer action`. Closest sentence: `No structural used-path drift. Not a runtime compatibility proof.`

Harness did not score these needles because `expected-report.json` has no `highlights` array (only `status` + `ok`). Gap is example.json vs engine, not a harness mismatch.

### 6. Engine id alias: `sds52-api-upgrade-brief` vs `sds52-paid-useful-jobs`

- `h04-route-02` `example.json` `engines`: `["sds52-api-upgrade-brief"]`.
- Inventory / harness pin id: `sds52-paid-useful-jobs` (job `api-upgrade-brief`).
- `src/engines.mjs` maps the alias. Not a fact mismatch. Status tokens match (`actionable`).

### 7. `kind=change` vs `expectedStatus=unchanged` (h04-schema-02)

- `example.json` `kind` is `change` because the GitHub payload gained `repository.custom_properties`.
- Oracle status is `unchanged` because used paths did not drift.
- Engine `kind` is `webhook-example`, status `informational`.
- Three different “kind/status” vocabularies for one pair. Buyer action is none.

### 8. Markdown integrity truncation (lock-02)

- Full SRI is in `pin-delta.json`.
- Markdown shortens to `sha1-V0yBOM4dK1hh8LR...` / `sha512-6FlzubTLZG3J2...`.
- A highlight that requires the full sha512 still matches via the JSON artifact. A markdown-only consumer would not see the full hash.

## Not gaps (recorded so they are not over-claimed)

- h04-lock-01 / h04-schema-01 / h04-page-01 / h04-page-03 / h04-route-02: status/verdict tokens match the oracle.
- h04-lock-03: oracle already uses `informational`.
- Route-03 zero identity delta vs page-03 `changed` is two jobs on one SHA pair, not a contradiction.
- SDS52 `sold: false` / `live-settle-out-of-scope` is taxonomy honesty, not a status alias bug.
- Full-file S51 lock self-diff `partial` (missingIntegrity on `vendor/neomorphic-correspondence`) is why lock-03 subsets that key; not a silent fail.
