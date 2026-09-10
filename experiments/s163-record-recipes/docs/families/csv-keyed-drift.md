# CSV keyed drift

Family `csv-keyed-drift` wraps the pinned parser `s134-csv-drift` (`65ce1867f1b4339cc708bfb72a7d9a5942785632`) for **keyed** before/after CSV pairs. Adapter: `adapters/csv-keyed.mjs`. Demo: `demos/csv-keyed-drift.mjs`.

Identity is the `--key` column set (recipes use `airline`). The adapter **refuses** a pair with no `keyColumns`; it does not invent keys. Observed **no-change** on a real pair is a valid outcome. Synthetic slices stay labeled in `SYNTHETIC.json` / filenames.

Cash **$0**. `paidValueClaim` is always false. This is not a warehouse migration plan, safety ranking, or paid monitoring product.

## Recipes

| Recipe | Pair | What it asserts |
|---|---|---|
| `R-CSV-REAL-NEWLINE` | FiveThirtyEight airline-safety two commits (not synthetic) | Keyed `changedCount=0` may be valid when commits only change newlines |
| `R-CSV-KEYED-CHANGE` | Labeled synthetic slice | Field change on a named key **plus** a blank-key row as a weak identity |
| `R-CSV-DUP-IDENTITY` | Labeled synthetic slice | `rowDrift.mode = duplicate-keys-blocked` — no last-write-wins |

Registry: `registry/recipes.json`. Expected CLI JSON: `fixtures/expected/csv-*.json`.

## Real airline-safety pair — `changedCount=0` is valid

`R-CSV-REAL-NEWLINE` pins the public FiveThirtyEight `airline-safety` table (CC0) at two commits:

| Side | Commit | Bytes | SHA-256 |
|---|---|---|---|
| before | `2ced6788d427fe11049175d378ce37f5016c6a04` | 2265 | `800c82c2…af0ad1b` |
| after | `6d880e939ad3d11d94c137c911681b3cf718fd74` | 2265 | `064300a3…cbd58b3` |

Source record: `sources/csv/airline-safety/SOURCE.json` (`synthetic: false`, `contentIdentical: false`). The files differ in **line endings** (classic CR vs LF) with the same cell text after newline normalization.

Keyed compare (`--key airline`) therefore reports:

- `rowDrift.mode`: `keyed`
- `addedCount` / `removedCount` / `changedCount`: **0**
- empty `added` / `removed` / `changed`

Byte inequality is **not** row drift. A newline-only (or line-ending-only) commit pair is a **valid no-change** result at the keyed-row layer. Do not “fix” the recipe by swapping in a synthetic delta, and do not treat `contentIdentical: false` as a field-change claim.

Fixture: `fixtures/expected/csv-airline-real.json`. Recipe note: `recipes/csv-keyed-drift/R-CSV-REAL-NEWLINE.json`.

## Synthetic keyed change + blank-key weak identity

`R-CSV-KEYED-CHANGE` is **synthetic**, derived from airline-safety head rows, labeled in `sources/csv/airline-safety/SYNTHETIC.json`. Inputs:

- `sources/csv/airline-safety/synthetic-keyed-before.csv`
- `sources/csv/airline-safety/synthetic-keyed-after.csv`

Observed keyed report (`mode: keyed`, `keyColumns: ["airline"]`):

| Signal | Value | Meaning |
|---|---|---|
| `changedCount` | 1 | `Air France` / `incidents_00_14`: `6` → `7` |
| `addedCount` | 1 | New row whose `airline` cell is empty |
| `removedCount` | 0 | — |

The added key is the JSON-stringified empty cell: `""`. The parser does **not** fill in a carrier name. That empty token is a **weak identity**:

- It is comparable only as “the empty `airline` value,” not as a real entity.
- Do **not** invent a key (`unknown`, `row-5`, a hash of other columns, etc.) to make the add look named.
- Do **not** silently merge blank-key rows with each other or with named rows.
- A second blank `airline` would be a **duplicate key**, not a distinct unnamed record (see next section).

Adapter next-run notes state this explicitly: *“Blank key values are weak identities — treat as uncertainty, not silent merge.”* The CLI may still list the row under `rowDrift.added` with key `""`; consumers must not upgrade that to a strong identity.

Fixture: `fixtures/expected/csv-synthetic-keyed.json`. Recipe subjobs: `recipes/csv-keyed-drift/R-CSV-KEYED-CHANGE.json`.

## Duplicate keys blocked — identity preserved (no last-write-wins)

`R-CSV-DUP-IDENTITY` uses a labeled synthetic pair where **after** contains two `Air Canada` rows (before does not). Parser output:

```json
"rowDrift": {
  "mode": "duplicate-keys-blocked",
  "keyColumns": ["airline"],
  "duplicateKeysAfter": ["\"Air Canada\""],
  "beforeRowCount": 2,
  "afterRowCount": 3,
  "note": "Refusing keyed add/remove/change: duplicate keys would silently overwrite rows."
}
```

Uncertainty code `duplicate-keys-after` (or `duplicate-keys-before` when the clash is on the earlier file): *“keyed compare blocked to avoid silent last-wins overwrite.”*

This is the S142/S154 gate. A `Map` keyed by `airline` would keep only the last `Air Canada` row and emit a fake add/change. The parser **refuses** `added` / `removed` / `changed` counts instead. Identity is preserved by **not claiming** which duplicate is “the” row.

Operators:

- Do not collapse duplicates with last-write-wins to force `mode: keyed`.
- Do not treat `afterRowCount - beforeRowCount` as a keyed add (here `3 − 2 = 1` is **not** `addedCount`).
- Definitive keyed counts resume only when both sides have unique keys.

Fixture: `fixtures/expected/csv-synthetic-dup.json`. Recipe: `recipes/csv-keyed-drift/R-CSV-DUP-IDENTITY.json`.

## Retain `keyColumns` / source / license into next-run manifests

Repeat jobs must not rediscover identity or drop attribution. `prepareKeyedCsvPair` declares:

```text
retain: keyColumns, sourceUrl, commit, license, coverage
```

`buildNextRunManifest(recipeId, prep, sourceMeta)` emits schema `s163.next-run-manifest.v1`. Callers keep these fields on the next run — they do not invent a key column or a license.

| Retain | Where it lives on the CSV manifest | Why |
|---|---|---|
| `keyColumns` | `inputs.keyColumns` (array, e.g. `["airline"]`) | Same identity as the last run. Missing keys → adapter refuse `missing-key-columns`. |
| source | `sourceMeta` (`sourceUrl`, `label`, `family`, `before.commit` / `after.commit`, hashes) | The pair is a captured public artifact, not a live fetch. |
| license | `sourceMeta.license` + `sourceMeta.licenseUrl` | FiveThirtyEight data is CC0 / public domain; synthetic slices stay labeled. |

Also carried (not invented later):

- `parser`: `s134-csv-drift`
- `uncertaintyNotes`: blank-key weak identity; duplicate-keys block (S142/S154)
- `paidValueClaim`: `false`

On-disk example: `next-run/R-CSV-KEYED-CHANGE.manifest.json` (written by `demos/csv-keyed-drift.mjs`). Consumer field list for the shared schema is `docs/consumers/next-run-manifest.md` (sibling note). A next run that omits `keyColumns` or `sourceMeta.license` is incomplete, not a new discovery.

## Adapter refuse (no invented evidence)

`prepareKeyedCsvPair` returns `ok: false` / `refused: true` and does **not** spawn the parser when:

| Code | When |
|---|---|
| `missing-key-columns` | `keyColumns` empty or omitted |
| `missing-csv-capture` | before/after path missing |
| `empty-csv-capture` | file exists but is empty |

CLI helper: `buildCsvCliArgs` → `../s134-record-jobs/modules/csv-drift/cli.mjs --before … --after … --key <col>` (repeat `--key` for composite keys).

## CLI

From `experiments/s163-record-recipes`:

```bash
# Real pair (expect keyed changedCount=0)
node ../s134-record-jobs/modules/csv-drift/cli.mjs \
  --before sources/csv/airline-safety/before.csv \
  --after sources/csv/airline-safety/after.csv \
  --key airline

# Synthetic keyed change + blank key
node ../s134-record-jobs/modules/csv-drift/cli.mjs \
  --before sources/csv/airline-safety/synthetic-keyed-before.csv \
  --after sources/csv/airline-safety/synthetic-keyed-after.csv \
  --key airline

# Duplicate identity block
node ../s134-record-jobs/modules/csv-drift/cli.mjs \
  --before sources/csv/airline-safety/synthetic-dup-before.csv \
  --after sources/csv/airline-safety/synthetic-dup-after.csv \
  --key airline

node demos/csv-keyed-drift.mjs
node --test test/recipes.test.mjs
```

Without `--key`, the parser reports `unkeyed-count-only` plus `unkeyed-row-compare` — row-count delta only, **not** per-row add/remove/change. Recipes in this family always pass keys.

## Non-claims

- Not a warehouse migration, SCD, or merge-key recommendation.
- Not airline-safety analysis, incident totals, or risk ranking.
- No ROI, demand, or paid-feed value. No live GitHub fetch in demos.
- Not a full CSV dialect / type-inference engine (S154: cells vs row `meta` stay separate; this family does not re-litigate that).
- Unkeyed count delta is not row equality. Duplicate-blocked row-count delta is not a keyed add.
- Blank `airline` is not a named carrier.

## File map

| Path | Role |
|---|---|
| `adapters/csv-keyed.mjs` | Prep, CLI argv, next-run manifest |
| `recipes/csv-keyed-drift/R-CSV-*.json` | Three recipes |
| `sources/csv/airline-safety/SOURCE.json` | Real pair citation + license |
| `sources/csv/airline-safety/SYNTHETIC.json` | Synthetic label |
| `fixtures/expected/csv-*.json` | Locked CLI reports |
| `next-run/R-CSV-KEYED-CHANGE.manifest.json` | Retained key/source/license for the next run |
