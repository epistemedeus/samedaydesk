# useful-jobs

Offline CLI from the public 1.4.7 archive. Caller files in, promised json+md out. `purchaseAuthority` stays false. This directory is the SDS verify feature-map slice for useful-jobs only.

| field | value |
| --- | --- |
| goal | exact caller files → promised json+md |
| entrypoint | extract archive `bin/useful-jobs.mjs`; page `/for-agents/useful-jobs` |
| command | `node tools/verify-sds/features/useful-jobs/bin/prove.mjs --json` |
| state | extracted 1.4.7 outside the repo; `purchaseAuthority:false` |
| tests | `node --test tools/verify-sds/features/useful-jobs/test/*.test.mjs` |
| prerequisite | Node 22, committed public 1.4.7 archive |

## Sub-features

- `list` returns ten job ids from `catalog.json`.
- `lockfile-pin-delta` writes `pin-delta.json` + `.md` from caller `--before` / `--after`.
- `missing-required-inputs` refuses `run lockfile-pin-delta` with no files (product exit 2).
- `page-change` has no `--example`; `--example` is `sample_as_delivered_watch`.

## How to get to it (user POV)

- Open `/for-agents/useful-jobs`.
- Download `/kit/useful-jobs-1.4.7.tar.gz` or `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`.
- Extract outside the checkout and run `node bin/useful-jobs.mjs list`.

## Driving it with this slice

Preconditions:

- Node 22.x (`node --version`).
- Dest/extract dirs not inside this git tree.
- Never pay, publish, or POST checkout.

- **Cold list + caller lockfile.** `node tools/verify-sds/features/useful-jobs/bin/prove.mjs --json`. Exit 0. Binds committed 1.4.7 bytes+sha, extracts outside the tree, runs `bin/useful-jobs.mjs list --json` (ten ids), then `run lockfile-pin-delta` on generated caller files.
- **Seeded missing inputs.** `node tools/verify-sds/features/useful-jobs/bin/prove.mjs --seeded-failure missing-required-inputs --json`. Exit 1, `error.code` `SEED_REJECT`, product `missing-required-inputs`.
- **Seeded sha mismatch.** `node tools/verify-sds/features/useful-jobs/bin/prove.mjs --seeded-failure sha-mismatch --json`. Exit 1. `obtain-archive.mjs` child may exit 0 on `ok:false`; this slice remaps that to verifier exit 1 and does not extract.
- **Product refuse as mapped feature.** `node tools/verify-sds/features/useful-jobs/bin/prove.mjs --expect-product-reject --json` exits 0 only after observing the child refuse.

Machine map: [`map.json`](./map.json). Pin: [`PIN.json`](./PIN.json).

## Gotchas

- Catalog `ownedPath` `tools/lockfile-pin-delta/` is **absent in this repo**; the engine lives in the archive.
- Inner README may still title 1.4.4; package/pin is 1.4.7.
- Do not treat a green `test:useful-jobs-public` as substitute for `bin/useful-jobs.mjs list` after a cold extract.
- `obtain-archive.mjs` currently `process.exit(0)` on SHA mismatch. Proof fail is this slice's remapped exit 1.
- This slice does not drive publish, registry, payment, checkout, or neomorphic-io.
