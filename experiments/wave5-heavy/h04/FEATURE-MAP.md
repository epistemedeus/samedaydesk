# FEATURE-MAP — W5-H04 useful-job benchmark

Complement to W5-M06–M09 (semantic unit corpora). This package is a **runnable useful-job benchmark**: twelve caller-owned before/after jobs with primary-source evidence, expected useful reports, and real SDS52 / W4 engine output.

## User goal

Given two local revisions of a schema, lockfile, public route table, OpenAPI, or page snapshot, emit a decision-changing brief (or a truthful no-change) without treating SAMPLE engines as customer jobs.

| Field | Value |
| --- | --- |
| Entrypoint | `experiments/wave5-heavy/h04/` |
| Command | `node bin/h04-benchmark.mjs smoke` · `run` · `m01` · `list` |
| Tests | `npm test` (`node --test test/*.test.mjs`) |
| Account / spend | None. Offline. `sold` always false. Live settlement out of scope. |

## Engines actually executed (read-only worktrees)

| Engine | SHA | Worktree |
| --- | --- | --- |
| SDS52 paid-useful-jobs | `aeef964fa188443078958d9d6d393afae1d542ee` | `/tmp/w5-h04/ro-sds52` |
| W4 json-schema-webhook-drift | `94c7bfdfeaa99f5e70f341504df3051cc7717f91` | `/tmp/w5-h04/ro-w4-schema` |
| W4 lockfile-pin-delta | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `/tmp/w5-h04/ro-w4-lockfile` |
| W4 route-table-diff | `7387eb677abd442dfab9081cb0ad95451fd2a762` | `/tmp/w5-h04/ro-w4-routes` |
| W4 page-change-offline-job | `91b57334818ecd7940cb854e9864f3b1749d1d1d` | `/tmp/w5-h04/ro-w4-pages` |

Engines are not rewritten. `--out-dir` is never inside a RO worktree. SDS52 extracts the useful-jobs archive to `os.tmpdir()` after sha256/size check (`6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51`, 2522418 bytes).

## Twelve examples

| id | kind | Engine | Changed fact (primary source) |
| --- | --- | --- | --- |
| `h04-schema-01` | change | webhook-drift | JSON Schema meta-schema `/properties/exclusiveMinimum` boolean → number (Draft 04 → 06) |
| `h04-schema-02` | unused-additive-control | webhook-drift | GitHub `create` payload adds unused `repository.custom_properties`; used `/ref` `/ref_type` `/pusher_type` identical |
| `h04-schema-03` | no-change-control | webhook-drift | CloudEvents used `id`/`type`/`source`/`specversion` identical; key-order + unused `debug` |
| `h04-lock-01` | change | lockfile-delta | SDS `concurrently`/`qs`/`shell-quote` version+integrity bumps (`ff381d2` → `62a88c8`) |
| `h04-lock-02` | change | lockfile-delta | `ms@2.1.3` integrity-only sha1 → sha512 (public vscode-powershell sha1 + SDS/npm sha512) |
| `h04-lock-03` | no-change-control | lockfile-delta | 159 S51 pins identical under key-order/indent/unused-field noise |
| `h04-route-01` | change | route-table-diff | PUBLIC_SHELLS adds `/for-agents/useful-jobs` (`9c50ecb` → `abeb54e`) |
| `h04-route-02` | change | SDS52 api-upgrade-brief | Express adds GET `/api/observatory/{sources,snapshot,sources/{sourceId}}` (`d4fec15` → `8c1c4f7`) |
| `h04-route-03` | no-change-control | route-table-diff | `/x402/verified` copy-only; path/canonical/title/robots identical (`3693e7c` → `3c96d31`) |
| `h04-page-01` | change | page-change | JSON-LD validator title/h1/description rename (`ff381d2` → `374a565`) |
| `h04-page-02` | no-change-control | page-change | `resources.html` footer/provenance noise; selected title/description/headings unchanged |
| `h04-page-03` | change | page-change | `/x402/verified` inspection criterion: agree → 7-day CDP Bazaar freshness |

Corpus is not W4 SAMPLE fixtures and not M06–M09 unit corpora.

## State / honesty

- SAMPLE / `--example` is never a customer job. Page `--example` refuses `sample_as_delivered_watch` (designed).
- Compare is fact-level (`match` / `mismatch` / `unknown`). Missing expected-report stays `unknown`.
- Engine `informational` and oracle `unchanged` are recorded as the same no-change class (vocabulary alias, not a hidden pass).
- Route-table-diff has no `status` field; expected `ok` matches CLI `ok: true` plus highlight counts.

## M01 four-engine composition replay

Composition SHA `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e` at `/tmp/w5-h04/ro-m01`. H04 does not amend those engines.

| Surface | Value |
| --- | --- |
| CLI | `node experiments/wave5/m01/bin/run-job.mjs <id> --out-dir DIR …` |
| Library | `runCatalogJob` / `invokeEngine` from `experiments/wave5/m01/index.mjs` |
| In-tree pins | lockfile `fba9d148…`, schema `27482b71…`, route `886c81d8…`, page `fec7bc04…` |

`node bin/h04-benchmark.mjs m01` replays catalog examples against that CLI. 11 of 12 original examples map onto the four engines (exit 0). `h04-route-02` OpenAPI stays SDS52; M01 schema engine refuses YAML as `not-json`.

Expected artifacts are split: `oracles/existing/<id>/expected-facts.json` (raw bytes), `expected-refusal.json`, `expected-no-change.json`. Engine stdout is not the oracle.

Public lockfile cases (≤8 projects; distinct semantics): mocha integrity sha1→sha512, mocha resolved http→https, axios addition, webpack-cli removal, npm/cli noise no-change, yarnpkg/berry yarn.lock refuse, SDS large v3 self-diff (partial missingIntegrity).

CLI vs library: counts/status/outcome match on h04-lock-01; full `pin-delta.json` sha256 differs only at `generatedAt`. Not a CPU/hosting bill.

Lockfile remains the first offer: M01 catalog `firstOffer=lockfile-pin-delta`; this replay shows add/remove/integrity/resolved/noise/refuse/large all produce honest analysis or refuse without claiming CVEs.

## Cold-caller accept-pack

Entrypoint: `accept-pack/bin/accept.mjs` (`list` / `run` / `delivery-negative`).

| Family | New cases | Notes |
| --- | --- | --- |
| lockfile-public | 7 preserved | Not multiplied |
| schema | 6 | false items, numeric exclusiveMinimum, required-removed, $ref sibling, $ref annotation no-change, OpenAPI YAML refuse |
| route | 4 | permutation, duplicate-path breaking, `:sku` vs `{sku}` two paths, method records unsupported_catalog |
| page | 5 | /for-agents fact change, SkillGuard noise, input_bounds, stale freshness, live_fetch_url |
| unsupported | 4 | JSON OpenAPI not-this-job-openapi, HTML lock, HTTPS catalog, corrupt JSON |

Refusal is useful. Missing promised outputs fail delivery (`delivery-negative`). Digest helper strips only `generatedAt`. Buyers: `accept-pack/buyers/BUYERS.md`.

## Later integration

Root / W5-D01 may bind these examples into the SDS52 supplied-input contract. Do not publish wrapper prices to the live catalog from this directory.
