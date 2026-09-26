# BOT-S162 JOURNEY PACKET — for Lead

Date: 2026-09-10 (PT). Bot: BOT-S162. Lane: Pilot Capability Delivery R2. PRIORITY.

## Branch / HEAD

- **Branch:** `codex/r2-capabilities-journey-s162-20260910`
- **Base tip (S155):** `9727fd414e78a0d7f5115567d733df597ff9e60c`
- **Assemble commit:** `21b8154de0bccae02312057dd69c98dd591e3964`
- **Branch tip / HEAD:** `53b8f6719d23fe39ea17beefafc69892bf1482ea` (re-check with `git rev-parse` after fetch)
- **Remote:** `git push -u origin codex/r2-capabilities-journey-s162-20260910`
- **PR:** none (by design)

## Heavy pin confirmed in tree

- **Repo:** `epistemedeus/pilot`
- **Pin SHA:** `2dcb01713acdc1bb45eec7c8b21b0092a08b2e8c`
- **Checked out paths (exact pin, no independent Heavy edits):**
  - `experiments/s138-capability-evidence`
  - `experiments/s146-capability-consumer-gates`
- **Blob check:** `experiments/s138-capability-evidence/src/index.mjs` index blob `3cc7147679fbfeba6c35d4d948940f9f76ae6839` matches `2dcb0171:…/src/index.mjs`

## What was replaced

| Cap | S155 adapter | S162 adapter |
| --- | --- | --- |
| 02 | `missing_heavy` stub | Real Heavy `resolvePrerequisites` via relative import of `s138-capability-evidence/src/index.mjs` |
| 03 | `missing_heavy` stub | Real Heavy `bindEvidence` |
| 06 | `missing_heavy` stub | Real Heavy `composePartial` |

Adapter **interface** kept (`prereqResolver` / `evidenceBinder` / `partialComposer` / `adapterStatusTable`). Status now reflects real Heavy readiness/binding/composition:

- Cap02: `ready` | `not_ready` | `partial` (empty input → `not_ready`, never invent ready)
- Cap03: `bound` | `untested_declaration` (empty input → `untested_declaration`)
- Cap06: `complete` | `partial` | `empty` (empty input → `empty`)

JSON **data** fixtures only under `fixtures/heavy/` (never instruction-as-input).

## Eight-component flow (demo)

1. `envelope` — Cap01 **ok** (native)
2. `install_prereq` — Cap02 Heavy **ready** (with probe fixture) / **not_ready** when catalog-only
3. `evidence_bind` — Cap03 Heavy **bound** or **untested_declaration** (honest)
4. `cost_dry_run` — Cap04 **ok** (native)
5. `fallback_plan` — Cap05 **as needed** (runs when Heavy gaps or caller `failedOutcome`)
6. `verify_or_partial` — Cap06 Heavy **complete** / **partial** / **empty**
7. `buyer_context_pack` — Cap07 **ok** (native)
8. `walkthrough` — Cap08 **ok** (native)
9. `overall` — `missing_heavy` **cleared**; `readyForRelease=false`; unknown/partial preserved

## Acceptance (explicit)

- `missingHeavyCaps`: **`[]`** (Heavy pin wired)
- `accepted`: **`false`**
- `readyForRelease`: **`false`** (never set from TAP `# pass` alone)
- Demo with ready fixtures: `journeyStatus: integrated`, `acceptance: not_accepted`
- Catalog-only Cap02: `journeyStatus: integrated_partial`, `acceptance: gaps_preserved`

## S161 honesty notes (active)

1. Preserve unknown/partial — never invent ready/bound from empty reports.
2. **Hashing imported test output / TAP `# pass` text does NOT prove those tests ran against the claimed source revision** (BOT-INTEGRATION Cap03 note).
3. Do not set `readyForRelease` true solely from TAP pass text.
4. **Heavy's own 259 tests / 36 CLI sessions are NOT journey acceptance**; count only this package's integrated tests.
5. Catalog listing ≠ install readiness; signer/provenance alone ≠ bound evidence.

## How to run

```sh
cd experiments/scale-r2-20260910/capabilities/journey-s162
node src/cli.mjs install   # import paths + Heavy pin SHA
node src/cli.mjs status    # native vs Heavy-wired table (pin shown)
node src/cli.mjs demo      # eight-component dry-run with JSON fixtures
npm test
```

From repo root:

```sh
node experiments/scale-r2-20260910/capabilities/journey-s162/src/cli.mjs demo
node --test experiments/scale-r2-20260910/capabilities/journey-s162/tests/*.test.mjs
```

Node ≥ 20; no `npm install` (pure ESM, zero deps). Offline dry-run only
(`dryRun: true`, `paidInstall: false`, `liveNetwork: false`).

## Tests (THIS package only)

- **Command:** `node --test experiments/scale-r2-20260910/capabilities/journey-s162/tests/*.test.mjs`
- **Result:** **16 pass / 0 fail** (2 suites)
- Coverage: real Heavy Cap02/03/06 adapters; empty-input honesty; eight-stage order;
  never readyForRelease/accepted; Cap01/Cap04 forbidden rejection; Heavy pin + tips
  provenance; explicit non-claim of Heavy 259/36 as acceptance.
- **Do not copy Heavy 259/36 as acceptance.**

## Package path

`experiments/scale-r2-20260910/capabilities/journey-s162/`

Key files: `src/journey.mjs`, `src/adapters.mjs`, `src/cli.mjs`, `fixtures/heavy/`,
`README.md`, `RESULT.md`, this packet.

Native Cap01/04/05/07/08 remain under `capabilities/{01,04,05,07,08}/` (unchanged).
S155 package left intact for lineage.

## Blockers / residual for Lead / Root

1. Root owns residual findings to source owner (Heavy / native Cap owners).
2. `readyForRelease` remains false by design — TAP/hashing ≠ execution proof at claimed revision.
3. Cap08 walkthrough still uses its own Thin stubs internally for Cap02/03 lineage; journey-s162 stages call real Heavy for Cap02/03/06 independently.
4. Private feature branch only — no PR; Root owns merge/publication/paid actions.

## Stop conditions honored

- Native tools only — **no CloudAgent**
- **No PR**
- **No** independent Heavy source edits
- **No** green placeholder / invented ready-for-release
- Advice S161 preserved
