# FEATURE-MAP — W5-M01 useful-engine composition for D01

SameDayDesk Wave5 catalog owner. Writes `experiments/wave5/m01/` plus the transferred engine trees under `tools/`. Does not write `server/paid-useful-jobs/` or root `package.json`.

## Caller goal

Run the four terminal engines from supplied inputs through their published CLIs, export a stable job catalog, and give D01 a thin adapter. First advertised offer remains **lockfile-pin-delta**.

## Entrypoint

| Item | Value |
| --- | --- |
| Contract | `experiments/wave5/m01/catalog.json` + `CONTRACT.md` |
| Export | `experiments/wave5/m01/index.mjs` (`runCatalogJob`, `runCatalogPaidOffer`, `runEngineForD01`) |
| CLI | `node experiments/wave5/m01/bin/run-job.mjs <engine-id> --out-dir DIR --before …` |
| Tests | `node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs` |

`run` / `invoke` spawn the in-tree engine CLI. They do not reimplement pin, schema, route, or page compare.

## Engines on this branch

| Engine | Import SHA | Outputs |
| --- | --- | --- |
| lockfile-pin-delta (first offer) | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` | `pin-delta.json`, `pin-delta.md` |
| json-schema-webhook-drift | `27482b712a7221e5079d70df85c5dd5608dc70eb` plus items boolean fix | `drift-brief.json`, `drift-brief.md` |
| route-table-diff | `886c81d824e0a24e2faa5b821b1cd0ca46ae0859` | `route-diff.json`, `route-diff.md` |
| page-change-offline-job | `fec7bc04ac4419f8e7ce40f2613314e6953af6bc` | `page-change.json`, `page-change.md` |

Independent corpora (read-only): M06 `4875dba8`, M07 `b4de86d4`, M08 `902ff58d`, M09 `da4c3e1c` from Pilot `9529591d` TERMINALS.json.

## First-SKU justification (independent cases)

Lockfile first: M07 20/20 domain match on this tree. Version/integrity explained, resolved-only closed, noise omitted, unsupported formats refuse, constant hasher cannot hide integrity.

Not first: schema is used-path JSON Schema only; route does not claim Next.js-shaped catalogs and treats collisions as analysis; page-change never claims a fresh live fetch and `claims.complete` can be false on a useful changed walk.

## D01

D01 `6bed72dd` / kernel `bccf34b3` owns the wrapper. Current DI cannot select these engines (`unknown-job`). Adapter: `lib/d01-adapter.mjs`. Exact injection is in `CONTRACT.md`. Not a sale.

## Remaining

No live catalog rewrite. No settlement. Page-change stderr must be parsed as catalogued. `--max-sources 1` still drops later semantic rows as incomplete analysis.
