# S185 reuse inventory

Read from Root-verified pins under `/tmp/s185-pins`. Algorithms are copied into `vendor/` untouched. Product code in `src/` only binds caller identity and packages diagnosis + repair.

## Modules reused

| Module | Pin | Vendor | What S185 calls |
| --- | --- | --- | --- |
| Record05 | `a7e2cd7a2223e2aa7e7e09eebf3695aba4731205` | `vendor/record05` | `buildRouteRegressionReport` via Record04 sibling import `../../05` |
| Record04 | `0e703bd4682894df4e1d25c61b594cac49f2463c` | `vendor/record04` | `buildDistRepairFeed`, `mapDeltaToRecommendation` |
| DIST08 | `ea000772cdbd6d5df7174369dcef9aa2270e5723` | `vendor/dist08` | `diagnoseConversion`, `isCompatible`, forbidden-field guards |
| NL06 | `76c0732b241beaa569f05a7394fdbf49604ffb66` | `vendor/nl06` | `selectJoinableRepairs`, `buildBundleFromFeed`, `buildBeforeAfterFromFeed`, `validateFeed` |

Sibling layout: `vendor/05` → `record05`, `vendor/08` → `dist08` so untouched relative imports keep working.

## Record04 / Record05

- Input: caller `{ baseline, current }` snapshots. Route key is `path`, not filename.
- Deltas: unchanged, removed, redirected, inaccessible, restored, status_changed, added.
- Incomplete current: `removed` → `cannot_prove_global_removal` / `recheck_with_complete_capture`, `coveragePreserved: true`, low confidence.
- No crawl; forbidden SEO/traffic/revenue fields rejected.

## DIST08

- Join only on `provider` / `jobRef` / `sharedEvidenceId` (plus unique sourceTag map).
- `catalog` is not uniquely grexal; catalog+grexal still needs jobRef/sharedEvidenceId unless provider is explicit on both sides.
- Explicit provider mismatch without shared ids → `unjoined`.
- `causationKnown` only when `sharedEvidenceId` matches. Product does **not** mint matching sharedEvidenceId (that would fabricate causation).
- unavailable ≠ no_users. click ≠ conversion. list price ≠ revenue.

## NL06

- `buildBundleFromFeed` currently stamps `provider: "grexal"` on useful-output rows (fixture join wiring).
- Product **rebinds** `provider` + per-route `jobRef` from caller identity. Grexal is used only when the caller supplied it.
- `buildBeforeAfterFromFeed` prefers high-confidence redirected/removed (`/docs` on the positive pair).
- Acquisition events from NL06 are discarded; product derives identity-bound events or uses caller `discovery.acquisitionEvidence`.

## First-use (held)

Pin `ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe` is **not vendored**. Boundaries copied into claims:

- discovery free / run priced / not invoked
- estimate reserve is not a charge
- unavailable ≠ no_users
- Grexal listing URL/agentId is an S149 cite, not a universal adapter

## Route-repair fixture

Record04 `examples/dist08-handoff/fixtures/route-repair-before-after.json` (export base `8b8e44376e9414f540483a526b048beb9e4dc370`): `/docs` redirected → `update_listed_route_or_redirect_target`. Product asserts the same fields from the live algorithm, not by copying the fixture as proof.

## Not reused

- S176 record-repeat parsers / bot native05..08
- First-use adapter success path that hard-requires the Grexal listing URL
- Any second route parser
