# S198 — Compose record-repeat + distribution-repair into one deployable candidate

You are the **same** authenticated native Grok Heavy parent.
Session id: `01a08b8c-8e39-7c13-aeb7-ddfb9b159ba5`
Model: `grok-4.6` · effort: `xhigh`
Cursor = transport/git/collection only. **You** own substantive integration + tests.

## Freezes / base

- Branch: `codex/s198-record-distribution-release-20260910` from **current main** `2b80f38a4e5ec5f080d1764de7c539af63190012` (Pulse intact — do not regress).
- S189 tip (record-repeat repaired): `f830b55bc6f9b31f664394341f33c5e43a2a2cf8` (substantive `12d528cdd92ae062d60ecd1beff2c9b5639417d7`). Reuse exact fixes — **do not reimplement** parsers.
- S185 tip (distribution-repair): `c05522364b26db04b4aa63f945ad15810785efb4` — **frozen**, do not rewrite that branch.
- Cash $0. No merge/deploy. No paid calls / overage / bankedreset / new auth.

## Already staged by Cursor (composition checkout)

Production trees from S189 + S185 are checked out onto this branch; shared SPA/site files were mechanically merged. Your job: **inspect, repair small integration defects, keep semantics, verify**.

Included:
- `experiments/s134-record-jobs`, `s163-record-recipes`, `s176-record-repeat-package` (S189 repaired)
- `experiments/s185-distribution-repair-package` (minus native-cells)
- pages, discovery, kits, machineEntry (both jobs), App/ForAgents/spa/smoke/llms/sitemap merges

Excluded from product (leave on frozen tips only):
- `experiments/s189-record-repeat-review-fix/**`, package `native-cells` prompts/raw logs
- homepage / Pulse / checkout / prices / merchant service unrelated edits

See `experiments/s198-record-distribution-release/PROVENANCE.md`.

## Required product outcome

Two discoverable inner-page jobs on the **same** site candidate:

1. **Record-repeat** (`/for-agents/record-repeat`): caller acquires kit, runs own supported record/pricing data, repeats with changed input. Preserve S189: missing pricing units explicit, unknown observation time, source metadata, safe next-run output, malformed/oversize rejection.
2. **Distribution-repair** (`/for-agents/distribution-repair`): caller acquires kit, turns actual before/after + incomplete/complete catalog into truthful repair artifact. Must **not** promote absent partial catalog rows into removals, infer indexed/payment/use from source agreement, or fabricate completed repairs.

Every literal install/CLI/import in page/discovery/INSTALL must work from a **clean unpack** with no checkout deps.

## Your work

1. Read ownership + graph of staged changes; fix only real integration defects with exact regressions.
2. If path/import relocation is required for clean build, do **relocation-only** with explicit provenance note — no gratuitous reorg.
3. Rebuild archives if needed so **final downloaded kit bytes** match amended source; keep discovery + sha receipts + machineEntry literals coherent (generate once).
4. Tests:
   - Focused: s134, s163, s176 package suites; s185 package suites; archive/acquisition tests; spa fallback/shells.
   - Full owning site Node 22 test + build.
   - Unchanged homepage / health / Pulse regression.
   - Two **fresh caller-authored** inputs + changed-input repeat (not only fixture ok:true counts) for both kits via shared CLIs.
   - Local-served page+download acquisition desktop / 390 / 320 with **no horizontal overflow** (you may leave browser evidence paths for Cursor collection).
5. Write compact RESULT under `experiments/s198-record-distribution-release/RESULT.md` + receipts JSON: branch, tip SHA, pins, commands/failures/skips, archive digests, native session evidence, smallest remaining limit.
6. Commit with clear messages on this branch (Cursor will push/PR). Do **not** finish after launch without completing tests.

Report full vs focused gates separately. Keep S185/S189 source pins available in PIN/PROVENANCE.
