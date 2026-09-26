# BOT-S170 — Cap journey customer-facing examples

Thin demos/recipes under `experiments/scale-r2-20260910/capabilities/examples-s170`.

These recipes **call in-tree relative imports** of already-accepted Cap01 / Cap04 / Cap05 / Cap07 / Cap08, and optionally **read** journey-s162 status (not a rewrite).

## What this is

| Recipe | Cap | What it shows |
| --- | --- | --- |
| `recipe-envelope` | Cap01 | Envelope from sample requirements → `requiredInputs` summary |
| `recipe-cost-compare` | Cap04 | Dry-run quotes vs free alternative |
| `recipe-fallback` | Cap05 | Fallback plan from a failed outcome (**ambiguous mutation honesty**) |
| `recipe-context-pack` | Cap07 | Buyer context pack + dry-run readback with **redaction** |
| `recipe-walkthrough-lite` | Cap08 + journey-s162 | Thin Cap08 walkthrough + **read-only** journey status / how-to-run |

## What this is not

- **Not** a Heavy S146 fork — Heavy trees already in branch from S162; leave them untouched
- **Not** a journey-s162 rewrite — status/demo reader only
- **Not** Cap package internals edits
- **Not** invent-green / paid / live network
- **S164 source residual** is out of scope (pending elsewhere; do not block on it)

## Install / import

Pure Node ESM, zero npm dependencies (`node >= 20`).

```sh
cd experiments/scale-r2-20260910/capabilities/examples-s170
# no npm install required
```

Relative imports used by recipes (from `src/recipes/`):

```text
../../../01/src/index.mjs
../../../04/src/index.mjs
../../../05/src/index.mjs
../../../07/src/index.mjs
../../../08/src/index.mjs
../../../journey-s162/src/index.mjs
```

Programmatic:

```js
import { runRecipeEnvelope } from "./src/recipes/envelope.mjs";
import { runRecipeCostCompare } from "./src/recipes/cost-compare.mjs";
// …
```

## Run

```sh
node src/cli.mjs list
node src/cli.mjs run recipe-envelope
node src/cli.mjs run recipe-cost-compare
node src/cli.mjs run recipe-fallback
node src/cli.mjs run recipe-context-pack
node src/cli.mjs run recipe-walkthrough-lite
node src/cli.mjs demo-all

node --test tests/*.test.mjs
# or: npm test
```

From repo root:

```sh
node experiments/scale-r2-20260910/capabilities/examples-s170/src/cli.mjs demo-all
node --test experiments/scale-r2-20260910/capabilities/examples-s170/tests/*.test.mjs
```

## How a customer runs the full journey

See `recipe-walkthrough-lite` output (`journeyStatusLite.howCustomerRunsJourney`), or:

```sh
cd experiments/scale-r2-20260910/capabilities/journey-s162
node src/cli.mjs install
node src/cli.mjs status
node src/cli.mjs demo
npm test
```

**Heavy pin already consumed by journey-s162:** `2dcb01713acdc1bb45eec7c8b21b0092a08b2e8c`  
Do not copy/amend Heavy dirs for these examples. TAP/#pass text is **not** release acceptance (`readyForRelease` stays false).

## Docs-only notes

- **Quota reset (docs only):** `2026-09-10T12:48:15.801Z` (PT `2026-09-10 05:48:15`)
- Mutation boundary: feature-branch examples package only; root owns merge / publication / paid actions

## Preserve

Do not break tested milestones: `journey-s162` / Cap01 / Cap04 / Cap05 / Cap07 / Cap08 packages.
