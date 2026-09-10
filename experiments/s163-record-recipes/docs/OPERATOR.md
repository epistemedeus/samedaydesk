# S163 operator checklist

Cross-family notes for running and talking about this recipe library.
Scope is `experiments/s163-record-recipes` only. Cash **$0**.

Work assignment (who owns which family/docs, what was rejected) lives in
[`native-cells/ASSIGNMENT.md`](../native-cells/ASSIGNMENT.md).

## Preflight

Run from `experiments/s163-record-recipes`.

### Node 22

This checkout is exercised on **Node 22** (`node --version` → `v22.14.0` here).
`package.json` `engines.node` is `>=20`; treat **Node 22** as the operator
preflight, not “any Node ≥20.” Node 18 is not green.

```bash
node --version   # expect v22.x
```

### S134 pin

Recipes wrap the four S134 parsers. They are **not** copied into this tree.
Confirm the pin before demos or tests:

| Check | Expected |
|---|---|
| `registry/recipes.json` → `s134Pin` | `65ce1867f1b4339cc708bfb72a7d9a5942785632` |
| Sibling tree | `../s134-record-jobs/modules/{openapi-impact,pricing-table-change,csv-drift,rss-atom-brief}/cli.mjs` exist |
| This workspace HEAD (when the pin is the repo tip) | `git -C ../.. rev-parse HEAD` starts with `65ce1867` |

```bash
node --input-type=module -e "import fs from 'node:fs'; const r=JSON.parse(fs.readFileSync('registry/recipes.json','utf8')); if(!String(r.s134Pin).startsWith('65ce1867')) process.exit(1)"
test -f ../s134-record-jobs/modules/csv-drift/cli.mjs
```

Do not edit `experiments/s134-record-jobs` from this experiment. Literal CLI
examples are in each `recipes/**/R-*.json` (`cliExample`) and in `demos/`.

### Demos / tests

```bash
node --test test/recipes.test.mjs
node demos/run-all.mjs
```

Equivalent npm scripts: `npm test`, `npm run demo:all`. Per-family:

```bash
npm run demo:openapi
npm run demo:pricing
npm run demo:csv
npm run demo:rss
```

A real source pair that reports **no-change** is a valid outcome. Synthetic
pairs are labeled in `SYNTHETIC.json` / filenames — keep that label.

Adapters **refuse** unsupported extraction (HTML pricing pages, non-feeds)
instead of inventing rows. That refuse is success for those recipes, not a
parser bug.

## What not to claim

These are cross-family. Family docs restated them; do not walk them back in
summaries, receipts, or marketplace copy.

| Do not claim | Why |
|---|---|
| **ROI**, total-cost, spend, demand, or “this change is worth $X” | Pricing reports field/unit deltas only. Adapters set `paidValueClaim: false` / `costClaim: false`. Unit-string changes (`USD/1M-tokens` vs `USD/1M-Tokens`) are not case-folded and are not converted into cost. |
| **Paid value** of the library or of a run | Cash **$0**. No timers/cron, subscriptions, paid network calls in demos, accounts, outbound messages, site deploy, or marketplace publish. SuperGrok Heavy `/usage` is subscription display, not a billed SKU for this experiment. |
| **Ceiling = 48** native cells, or that 48 sessions ran / were required | 48 is an aspirational operating point, **not** a quota. Useful set size is the number of distinct recipe/doc/consumer tasks — here **6** (`S163-N01`…`S163-N06`). Filler cells to pad toward 48 were **rejected**. Catalog concurrent-child ceiling is unknown (`subagents_max_concurrent: null`); do not substitute 48 or an unverified 64. |
| **Merchant package** / page-change extract recipes / marketplace listing | Different input contract. Do not duplicate `tools/recurring-job-recipes`, S127 package export/import, or merchant page-change extract recipes. Merchant pin (S134 `PINS.md`) is context only — these CLIs do not wrap merchant HTTP or paid extract. Owning repo is `epistemedeus/samedaydesk`, not merchant. |

Also out of scope (same non-goals as `registry/recipes.json`):

- Runtime compatibility proof (OpenAPI used-op impact is structural, not a live API call).
- Alert spam / subscription backend (RSS/Atom).
- Last-write-wins on duplicate CSV keys (mode is `duplicate-keys-blocked`).
- Treating scoped OpenAPI no-change as a false negative on the whole document when webhooks/components moved outside the used-ops pin.
- Relabeling a `SYNTHETIC.json` pair as a live capture.
- Cell IDs `native05`…`native08` (Bot Record owns those plus the capture wrapper — do not fork).
- A second parser engine.

## Memory / PSI admission (native cells)

Admission is local process math. It does **not** prove a 48-wide Heavy wave
and does **not** touch Bot Record `native05`…`native08`.

Launcher: [`native-cells/scripts/admit-launch.mjs`](../native-cells/scripts/admit-launch.mjs)
(reuses S134 admission spelling). Runtime discovery: `grok-4.6` + `xhigh`
from `~/.grok/models_cache.json`.

| Constant | Value | Role |
|---|---|---|
| Per-cell RSS budget | `200 MiB` (`PER_RSS`) | `maxByHeadroom = floor(headroom / PER_RSS)` |
| Memory reserve | 25% of `MemTotal` | `headroom = MemAvailable − reserve25` |
| PSI block | `avg10 >= 0.25` on `/proc/pressure/memory` (`some` line) | Reject the wave |
| Disk | `bavail/blocks < 0.2` | Reject |
| Effective mem | `headroom / MemTotal < 0.25` | Reject |

Admit **all 6** useful cells or none (`canAdmit(6)`). Wave label:
`wave0-plus6-useful-only`. Cell IDs are `S163-N##`, never `native05`…`native08`.

Inspect, do not invent:

```text
native-cells/receipts/admit-wave0.json
native-cells/receipts/admission-evidence.json
native-cells/receipts/live.json
native-cells/receipts/final.json
```

Do **not** re-run `admit-launch.mjs` while a wave is alive — it would spawn
another six Grok sessions. Read `/proc/meminfo` and `/proc/pressure/memory`
if you need a fresh snapshot; receipts already record `memory`, `psiAvg10`,
`diskFreeRatio`, and `excludes`.

This host’s wave-0 snapshot (illustrative, not a guarantee on the next box):
`psiAvg10 = 0`, disk free ≈ 0.97, headroom enough for 6, `rejectedPaddingToward48: true`.
Weekly SuperGrok Heavy `/usage` is captured under `native-parent/usage-capture/`
and is **not** a paid-value claim for the recipes.

## Assignment

Distinct work only — one cell per family/docs/consumer task, not one cell per
assertion. See [`native-cells/ASSIGNMENT.md`](../native-cells/ASSIGNMENT.md).

| Cell | Owner task | Consumed into |
|---|---|---|
| S163-N01 | OpenAPI family operator notes + import snippet | `docs/families/openapi-used-ops.md` |
| S163-N02 | Pricing unit interpretation (no cost/ROI) | `docs/families/pricing-row-unit.md` |
| S163-N03 | CSV keyed uncertainty / blank-key / dup policy | `docs/families/csv-keyed-drift.md` |
| S163-N04 | Feed live vs SYNTHETIC labeling rules | `docs/families/rss-atom-brief.md` |
| S163-N05 | Next-run manifest consumer example | `docs/consumers/next-run-manifest.md` |
| S163-N06 | This checklist + cross-family non-claims | `docs/OPERATOR.md` |

**Rejected / not admitted:** filler cells to pad toward 48; anything under
Bot Record `native05`…`08`; generic market-research essays; second parser
engines.
