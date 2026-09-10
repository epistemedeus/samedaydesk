# Next-run manifest consumer (`s163.next-run-manifest.v1`)

A next-run manifest is a **pin + captured-input + source-metadata** bundle. A later job reuses it to spawn the same S134 parser on the same local captures. It is not a live fetch plan, not a scheduler, and not permission to invent rows, keys, used-ops, or prices.

Emitters today:

| Recipe | Writer | Path |
|---|---|---|
| `R-OPENAPI-PIN-IMPACT` / `R-OPENAPI-NEXT-RUN` | `adapters/openapi-used-ops.mjs#buildNextRunManifest` | `next-run/R-OPENAPI-PIN-IMPACT.manifest.json` |
| `R-CSV-KEYED-CHANGE` | `adapters/csv-keyed.mjs#buildNextRunManifest` | `next-run/R-CSV-KEYED-CHANGE.manifest.json` |

Pricing and RSS adapters retain units / source / synthetic labels at **prep** time; they do not currently write `next-run/*.manifest.json`. Do not synthesize those files to “complete” a family.

Create missing files by running the demos that own them (`demos/openapi-used-ops.mjs`, `demos/csv-keyed-drift.mjs`), or run `node docs/consumers/next-run-validate.mjs` (it launches those demos when the glob is empty or a mapped file is absent).

## Fields

`schema` must be the literal `s163.next-run-manifest.v1`. Unknown extra keys are ignored; missing required keys are invalid.

### Required

| Field | Type | Meaning |
|---|---|---|
| `schema` | string | Discriminator. Reject anything else — do not coerce. |
| `recipeId` | string | Registry recipe id (`R-…`). Identifies which repeat-job contract this pin belongs to. |
| `parser` | string | S134 module id (`s134-openapi-impact`, `s134-csv-drift`, …). Caller spawns that CLI; it does not swap parsers. |
| `inputs` | object | Captured file paths and pins already on disk. Family-specific (below). |
| `paidValueClaim` | boolean | Always `false` in this library. A `true` value is a contract break, not a feature. |

`sourceMeta` is required by the writers (`object` or `null`). A consumer treats `null` as “no provenance to copy,” not as license to fill gaps.

### Family `inputs`

| Parser | Keys | Reuse rule |
|---|---|---|
| `s134-openapi-impact` | `before`, `after`, `used` | `used` is the used-ops pin path. Pass it through. Do not add/drop operations to make impact look busier or quieter. |
| `s134-csv-drift` | `before`, `after`, `keyColumns` | `keyColumns` is the identity. Do not invent a key for blank cells or collapse duplicate keys. |

Paths may be repo-relative (OpenAPI demo) or absolute (CSV demo). Resolve relative paths from `experiments/s163-record-recipes`. Missing files → refuse, do not fetch remotes.

### Optional / family-specific

| Field | When | Meaning |
|---|---|---|
| `sourceMeta` | both current writers | Provenance copied from `sources/**/SOURCE.json` (or labeled `SYNTHETIC.json` when that is the recipe’s meta). Includes `sourceUrl`, `license`, `licenseUrl`, before/after `commit` + `sha256`, `synthetic`. |
| `coverage` | OpenAPI | Scope of the last report. `scope: "used-operations-only"` means webhook/component edits outside the pin are out of scope for `impact.unchanged` claims. `usedOperationCount` is copied from the last report, not recounted by guessing. |
| `retain` | OpenAPI (explicit); CSV (prep list, see below) | Names of evidence kinds the **next** run must copy, not invent. A checklist, not a claim that every name is a top-level key on this object. |
| `uncertaintyNotes` | CSV | Operator notes that travel with the pin (blank-key weak identity; duplicate-keys block). Copy as-is. |

### `retain` checklist (do not invent these)

Writers differ:

- OpenAPI `buildNextRunManifest` sets `retain: ["units", "coverage", "sourceUrl", "commit", "license"]`.
- CSV `prepareKeyedCsvPair` returns `retain: ["keyColumns", "sourceUrl", "commit", "license", "coverage"]` but `buildNextRunManifest` currently embeds those values in `inputs` / `sourceMeta` instead of a top-level `retain` array. Callers still must keep them.

| Name | Copy from | Do not |
|---|---|---|
| `units` | parser report / curated `field`+`value`+`unit` rows | case-fold unit strings; infer cost or ROI |
| `coverage` | `coverage` object or last report scope | widen `used-operations-only` to the whole document |
| `sourceUrl` | `sourceMeta.sourceUrl` | substitute a “more official” URL |
| `commit` | `sourceMeta.before.commit` / `after.commit` | retarget to HEAD or a prettier pair |
| `license` | `sourceMeta.license` (+ `licenseUrl` when present) | drop attribution |
| `keyColumns` | `inputs.keyColumns` | pick a different column because blanks/dupes appeared |

RSS prep retains `sourceUrl`, `license`, `format`, `synthetic`. Pricing prep retains unit strings (`retainUnits: true`) and refuses HTML. Those lists apply if a future recipe emits a manifest; they are not a reason to hand-write one now.

## Reusing a pin without inventing evidence

1. **Read the file.** Require `schema === "s163.next-run-manifest.v1"`. Wrong schema → stop.
2. **Spawn the named parser** on `inputs` as written. Example OpenAPI:

   ```bash
   node ../s134-record-jobs/modules/openapi-impact/cli.mjs \
     --before sources/openapi/museum/before.yaml \
     --after sources/openapi/museum/after.yaml \
     --used sources/openapi/museum/used-ops.pin.json
   ```

   Example CSV:

   ```bash
   node ../s134-record-jobs/modules/csv-drift/cli.mjs \
     --before sources/csv/airline-safety/synthetic-keyed-before.csv \
     --after sources/csv/airline-safety/synthetic-keyed-after.csv \
     --key airline
   ```

   Do not copy S134 parser source into this package. Do not point at a different module because the named one reported no-change.
3. **Reuse pins as bytes.** Load `inputs.used` through `loadUsedOpsPin`. An empty or invalid pin is `empty-used-ops-pin` / `invalid-used-op` — refuse. Do not pad the used list from the rest of the OpenAPI document.
4. **Reuse keys as written.** Blank CSV key values stay blank (weak identity). Duplicate keys stay a block (`duplicate-keys-blocked`), not last-write-wins.
5. **Copy `retain` / `sourceMeta` into the subsequent manifest.** New captures may replace `inputs.before` / `inputs.after` paths; they do not rewrite old commits, licenses, or pin membership.
6. **Keep labels.** `sourceMeta.synthetic === true` (or a `SYNTHETIC.json` recipe) stays synthetic. Observed no-change on a real pair stays a valid outcome — do not swap in a synthetic pair to manufacture churn. The CSV keyed-change demo currently copies real-pair `SOURCE.json` into `sourceMeta` while `inputs` still point at `synthetic-keyed-*.csv` (`R-CSV-KEYED-CHANGE` is the synthetic slice). Trust `recipeId` + input filenames; do not relabel that run as a live airline-safety observation.
7. **Refuse instead of filling.** HTML pricing pages, missing captures, empty used-ops, missing `keyColumns` → adapter `refused: true`. Never synthesize rows, operations, or keys so the parser has something to chew.

`paidValueClaim` stays `false`. Scoped no-change is not runtime compatibility, not demand, not ROI.

## Consumer snippet

```bash
node docs/consumers/next-run-validate.mjs
```

Prints one JSON object: schema, each `recipeId`, `retain` fields (from the file or the adapter prep list), and whether demos had to run. Exit `0` only when every `next-run/*.manifest.json` validates.

## Non-claims

- Not a cron / subscription / notification backend.
- Not a marketplace package or Bot Record `native05..08` capture wrapper.
- Not proof that unpinned OpenAPI surface is unchanged.
- Not a live HTTP client — captures are already on disk.
- Cash **$0**. No paid API value.
