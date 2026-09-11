# H04 M01 composition inventory receipt

Inventory of the W5-M01 four-engine composition surface for H04 replay. Read-only composition worktree only. No engine rewrite. No commit/push/PR. Writes only under `experiments/wave5-heavy/h04/inventory/m01/`.

## Verified SHA

`git -C /tmp/w5-h04/ro-m01 rev-parse HEAD` + `git cat-file -t HEAD`:

| Worktree | SHA | type | subject |
| --- | --- | --- | --- |
| `/tmp/w5-h04/ro-m01` | `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e` | commit | W5-M01: pin RECEIPT to composition SHA 8454bc1 |

Matches the assigned RO composition SHA. Implementation commit recorded in M01 RECEIPT: `8454bc187fdae4c8ac15feec5bf8ed8f96f82b1c`.

Catalog `pin.sha` values are import pins from `experiments/wave5/m01/catalog.json`. Those objects are **not** in this clone's git object store (`git cat-file -t` → missing). In-tree bins exist under `tools/{lockfile-pin-delta,json-schema-webhook-drift,route-table-diff,page-change-offline-job}/`. `invokeEngine` uses in-tree bins and still reports `pinSha` as the catalog import pin.

## Four engines (catalog inTreePinSha)

| id | inTreePinSha | relativeBin | analysisField | refuse | exampleIsRefuse |
| --- | --- | --- | --- | --- | --- |
| `lockfile-pin-delta` | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` | `bin/lockfile-delta.mjs` | `status` | stdout / 2 | false |
| `json-schema-webhook-drift` | `27482b712a7221e5079d70df85c5dd5608dc70eb` | `bin/webhook-drift.mjs` | `status` | stdout / 2 | false |
| `route-table-diff` | `886c81d824e0a24e2faa5b821b1cd0ca46ae0859` | `bin/route-diff.mjs` | `outcome` | stdout / 2 | false |
| `page-change-offline-job` | `fec7bc04ac4419f8e7ce40f2613314e6953af6bc` | `bin/page-change.mjs` | `report.verdict` | **stderr** / 2 | **true** |

First offer: `lockfile-pin-delta`. Schema pin also carries the M01 items-boolean integration fix (`b66caea` on the owned path).

## Semantic deltas vs prior H04 W4 leaves

Prior H04 inventory pins: lockfile `e81efc8a`, schema `94c7bfdf`, route `7387eb67`, page `91b57334`.

1. **lockfile now equality includes resolved.** W4-commerce-11 hashed `{name, version, integrity}` triples. M01/M03 `PIN_IDENTITY_FIELDS` is `name, version, integrity, resolved`. Same name+version+integrity with a different `resolved` (including git `#commit`) is `changed`. Catalog `acceptedInputs.equality` lists all four fields. Help text: "name+version+integrity+resolved pins".
2. **route has outcome.** W4-commerce-12 success stdout had `added`/`changed` and no `outcome`/`breaking`/`removed`. M01/M04 `analysisField` is `outcome` (`no-change` \| `permutation` \| `title-only` \| `changed` \| `breaking`). Collision is analysis `ok:true breaking=true`, not a missing engine. Permutation has equal `digest.v2`.
3. **page refuse on stderr.** W4-commerce-13 already emitted `{ok:false,code,message}` on stderr exit 2 (`--example` → `sample_as_delivered_watch`). M01 catalogs that: `refuse.stream=stderr`, `refused:null`. Stdout-only D01 wrappers will miss refusals unless they use this catalog or the M01 adapter. `exampleIsRefuse=true`.
4. **schema items boolean (extra).** W4-commerce-10 did not classify used-path array `items` true→false. M01 applies that fix on top of pin `27482b71` (`boolean-schema-tightened`, breaking). Compatible weakening stays analysis exit 0.

## Smoke

Node `v22.22.2`. cwd `/tmp/w5-h04/ro-m01`. Captures in `inventory/m01/smoke/`. `--example` **not** run.

| command | exit |
| --- | --- |
| `node experiments/wave5/m01/bin/catalog.mjs list` | **0** (`ok=true`, firstOffer `lockfile-pin-delta`, four selected ids) |
| `node experiments/wave5/m01/bin/catalog.mjs contract` | **0** (schema `samedaydesk.wave5.m01.job-catalog.v1`) |
| `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs --help` | **0** |
| `node tools/json-schema-webhook-drift/bin/webhook-drift.mjs --help` | **0** |
| `node tools/route-table-diff/bin/route-diff.mjs --help` | **0** |
| `node tools/page-change-offline-job/bin/page-change.mjs --help` | **0** |

Also captured catalog `--help` exit 0 (not required). Customer jobs were not run. SAMPLE `--example` was not run.

## Failures / unknown

- Catalog import pin SHAs are not git objects in `/tmp/w5-h04/ro-m01`. Replay must use in-tree bins (or `W5_M01_ENGINE_ROOTS`), not `git archive <pin.sha>` against this clone.
- D01 `createExecutor` still cannot select these engines without the `getJob` injection in `CONTRACT.md` (`unknown-job`). Not a sale.
- W4-commerce-11 / W4-commerce-13 GitHub PR numbers remain unknown (same as parent H04 inventory).

## Files written (owned dir only)

- `experiments/wave5-heavy/h04/inventory/m01/COMPOSITION.json`
- `experiments/wave5-heavy/h04/inventory/m01/INVOCATION.md`
- `experiments/wave5-heavy/h04/inventory/m01/RECEIPT.md`
- `experiments/wave5-heavy/h04/inventory/m01/smoke/*` (real stdout/stderr/exit)
