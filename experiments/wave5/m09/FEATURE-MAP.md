# FEATURE-MAP — W5-M09 independent page snapshots

Own directory: `experiments/wave5/m09/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS PR52 starting ref | `aeef964fa188443078958d9d6d393afae1d542ee` — no `tools/page-change-offline-job/` |
| Co13 engine pin | `91b57334818ecd7940cb854e9864f3b1749d1d1d` `tools/page-change-offline-job/` fetched into a **read-only** worktree. Not copied into this tree. |
| W5-M05 export | Not on this starting ref. Remaining integration owner W5-M01 / engine owner W5-M05. |
| Merchant `compare.mjs` | Not imported. Not vendored. |
| SDS customer-job RFQ fixtures | Consulted as schema examples. Snapshots are independent Northshore catalog documents. |
| Homepage / `server/pricing.js` / catalog.json | Not edited. |

## User goals

| User goal | Entrypoint | Command | State on Co13 `91b57334` | Tests | Account / spend |
| --- | --- | --- | --- | --- | --- |
| Noise-only observation metadata | `snapshots/cases/noise-observation-metadata/` | `node bin/replay.mjs case --id noise-observation-metadata` | `verdict=unchanged` | `test/replay-cli.test.mjs` | None |
| Unselected openGraph / JSON key order | same CLI | `noise-unselected-opengraph`, `noise-json-key-order` | `unchanged` | same | None |
| Source-list or heading-member permutation | same CLI | `noise-source-reorder`, `heading-permutation` | `reordered`, semantic 0 | same | None |
| Title / description / heading text change | same CLI | `meaningful-title` and siblings | `changed` | same | None |
| Noise plus title | `mixed-noise-plus-title` | same | `changed`; title path present | same | None |
| Long title vs excerpt limit | `excerpt-long-title` | same | `changed` (excerpt is evidence only) | same | None |
| Absent selected field | `coverage-unknown-absent-description` | same | `incomplete`; not a deletion | same | None |
| Replay the corpus | published snapshots | `node bin/replay.mjs journey` | 16/16 match current pin | `test/journey.test.mjs` | None |
| Refuse live URL | loopback HTTP | engine `--before http://127.0.0.1:…` | `live_fetch_url`, 0 hits | `test/local-http.test.mjs` | None |

## Current-source findings (Co13 `91b57334`, not a future M05 claim)

| Observation | Kind |
| --- | --- |
| `--max-sources 1` drops a later changed row. Verdict `incomplete`, semantic 0. Not labelled unchanged. | Honest truncation of rows; remaining M05: dropped semantic rows stay invisible. |
| `--max-changes 1` records `/description` and omits `/title` without `snapshot.truncated=true`. Verdict stays `changed`. | Contradictory truncation flag. Remaining M05. |
| `--max-stale-ms`, `maxJsonDepth`, `maxJsonNodes` are accepted/defaulted and unused. Freshness stays `unknown`. | Remaining M05. Customer-job fixture `limits.maxStaleMs=86400000` likewise does not bind. |
| Excerpt truncation of a long title does **not** erase the `changed` verdict. | Named “normalized away” defect disproved for excerpt display. |

Transport refusals (`live_fetch_url`, `clock_required`, `quote_as_success`, `sample_as_delivered_watch`, `payment_retry`) stay distinct from analysis verdicts.

## Files

| Path | Role |
| --- | --- |
| `bin/replay.mjs` | Public CLI |
| `lib/engine.mjs` | Resolve pinned worktree and spawn Co13 CLI |
| `lib/evaluate.mjs` | Compare engine report to snapshot controls |
| `snapshots/` | Independent HTML + extract-batch pairs |
| `test/*.test.mjs` | `node:test` process/HTTP proofs |

## Later integration bindings

1. W5-M05 amends `tools/page-change-offline-job/` for truncation-flag honesty and unused depth/stale limits.
2. W5-M01 wires the selected engine into the catalog/runtime. This consumer stays a thin replay of whatever pin `PAGE_CHANGE_ENGINE_ROOT` or `PIN.json` names.
3. M18 changed-page trial consumes these snapshots plus M05.

## Untested

- Live extract-batch fetch or merchant `POST /recipes/page-change`
- A later M05 head (do not claim it)
- Postgres (this consumer has no SQL interface)
- External customer delivery
