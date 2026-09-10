# S189 — Record-repeat review repair (native Heavy PARENT resume)

You are the **same** authenticated native Grok Heavy parent session.
Session id (do not invent): `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort: `xhigh`
Cursor only dispatches/git/collects. **You** own substantive source + tests.

## Continuity / freezes

- S185 FINISHED @ `2026-09-10T14:07:44.949Z`; tip `c055223` is **frozen** — do not rewrite that branch/package.
- S176 candidate under repair: `f3d55e54a7b3c548943312443f9f066652d83980` (already checked out on branch `codex/s189-record-repeat-review-fix-20260910`).
- Cash $0. No merge/deploy. No paid calls / overage / banked reset.
- Reuse inventory: S185 `resolveMaybe` still cwd-first — **not** a complete F1 fix. Reuse only its structured refuse / next-run write style if helpful. Do **not** duplicate a second parser engine.

## Outcome

Amend the **same** S176 record-repeat package so F1–F6 are fixed on existing contracts, then prove with:

1. Existing suites:
   - `npm --prefix experiments/s134-record-jobs test`
   - `npm --prefix experiments/s163-record-recipes test`
   - `npm --prefix experiments/s176-record-repeat-package test`
2. Fresh **outside-repo** unpack following packed `INSTALL.txt` + packed `npm test` literally.
3. Caller-authored pairs through the **shared CLI** for all four families (OpenAPI, Pricing, Keyed CSV, RSS/Atom) with the exact semantic assertions in the brief.

## Findings to fix (source-derived; reproduce once against original, then fix)

### F1 P1 — Manifest path collision (cwd steals captures)
`resolveMaybe()` must **not** prefer CWD over the manifest directory for manifest-sourced paths.
- Manifest-sourced paths → resolve against declared manifest base only (no fallback to unrelated trees).
- Explicit CLI path overrides → resolve against CWD.
- Legacy S163 manifests: explicit compatibility rule.
- Tests: competing same-named files in CWD; move manifest+captures to a fresh directory.

### F2 P1 — `--write-next-run` must not destroy compared evidence
Reject output path aliases of every input (before/after/used/imported manifest), including symlink/hardlink where applicable.
Prefer exclusive create; do not silently replace an imported manifest.
Tests: byte preservation on each collision + successful distinct-output case.

### F3 P1 — Bind current inputs and inherited provenance
On first recipe run: load recipe-supplied metadata (e.g. OpenAPI pin commits) into the generated manifest — do not drop `sourceMeta`.
On changed captures during replay: keep old attribution under an **explicitly historical** field; record identities/digests for **current** bytes.
Missing current source attribution / observation time stays unknown — never invent from filename, wall clock, or inherited `retain`.
Preserve synthetic labels. Tests for both cases.

### F4 P2 — Missing pricing units must not become silent `unchanged`
In pricing adapter/parser path: refuse missing/blank units **or** retain clearly labelled unit-unknown outside definitive price comparability.
Do not invent currency/denominator. Test omitted / null / whitespace-only units; keep case-sensitive cross-unit behavior.

### F5 P2 — Malformed JSON + unbounded reads
Validate manifest/pricing container shapes before dereference. Support only declared S163/S176 schemas; require consistent family/parser mapping; structured errors for `null` / bad shape.
Enforce documented byte limit **before full reads** + finite child-process timeout.
Test: limit+1 file; directory supplied as capture.

### F6 P1 — Builder/INSTALL/test contract coherence
Packed INSTALL must not require root `npm ci` without a root lockfile when deps are vendored under `vendor/s134-record-jobs`.
Packed acquisition test must not require excluded `vendor/s163-record-recipes/next-run/` private manifests — generate a temporary manifest from packed inputs.
Rebuild from amended source → unpack outside repo → follow INSTALL + `npm test` literally.
Generate discovery/receipt/page archive metadata **once** and keep them equal after rebuild (exact public archive named by receipt).

## Four-family shared-CLI assertions (caller-authored pairs)

| Family | Assert |
|---|---|
| OpenAPI | New required param on one pinned op → that op’s parameter delta; unpinned edit does not widen claim; replay retains selected ops |
| Pricing | Same-unit value change → exact row delta; differing/absent units cannot silently establish price comparability |
| Keyed CSV | `id=1, old→new` → exactly one changed row; duplicates stay blocked (no definitive keyed counts) |
| RSS/Atom | Description-only edit on one stable entry → that correction; non-feed input refused/non-comparable (not apparent deletion) |

Preserve: original + changed-input source attribution, synthetic vs actual labels, unavailable freshness, precise partial outcomes. A repeated manifest write must never destroy user input.

## Children (optional, truly disjoint)

Within mem headroom and remaining quota, you may admit useful children only for:
- entrypoint (F1–F3/F5 CLI)
- packaging (F6 archive/INSTALL/discovery)
- concrete parser uncertainty (F4 pricing units)

No capacity-only filler. One integrated head.

## First actions

1. Write `experiments/s189-record-repeat-review-fix/native-cells/receipts/parent-resume.json` with real session id, model, effort, branch, head.
2. Reproduce F1–F6 once against current source (document actual observed outcomes).
3. Implement smallest fixes on existing contracts.
4. Run suites + outside unpack + four-family CLI assertions.
5. Rebuild archive; sync discovery/page/receipt literals.
6. Write `experiments/s189-record-repeat-review-fix/RESULT.md` with exact head/branch, commands/failures/skips, unpacked outcomes, native evidence, smallest remaining limit.

## Forbidden

- Rewriting S185 or inventing a second parser engine
- Broad arbitrary stress cells as “useful work”
- Inferring provenance/freshness
- Merge/deploy / paid invokes
- Post-hoc summary without actual tests
