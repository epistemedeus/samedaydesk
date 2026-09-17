# useful-jobs

Offline CLI from the public 1.4.7 archive. Caller files in, promised json+md out. `purchaseAuthority` stays false.

| field | value |
| --- | --- |
| goal | exact caller files → promised json+md |
| entrypoint | extract archive `bin/useful-jobs.mjs`; page `/for-agents/useful-jobs` |
| command | `pack run useful-jobs` then `run lockfile-pin-delta --before … --after … --out-dir $OUT` |
| state | extracted 1.4.7 outside the repo; `purchaseAuthority:false` |
| tests | `npm run test:useful-jobs-public` |
| prerequisite | Node 22, archive acquire 1.4.7 |

## Sub-features

- `list` returns ten job ids from `catalog.json`.
- `lockfile-pin-delta` writes `pin-delta.json` + `.md` from sample before/after.
- `missing-required-inputs` refuses `run lockfile-pin-delta` with no files (product exit 2).
- `page-change` has no `--example`; `--example` is `sample_as_delivered_watch`.

## How to get to it (user POV)

- Open `/for-agents/useful-jobs`.
- Download `/kit/useful-jobs-1.4.7.tar.gz` or `/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`.
- Extract outside the checkout and run `node bin/useful-jobs.mjs list`.

## Driving it with verify-cli

Preconditions:

- `doctor --json` exit 0.
- Dest/extract dirs not inside this git tree.

- **List.** `node tools/verify/cli.mjs pack run useful-jobs --json`. Exit 0. `bin/useful-jobs.mjs list --json` ran on the extracted 1.4.7 CLI.
- **Seeded missing inputs.** `node tools/verify/cli.mjs --seeded-failure missing-required-inputs --json`. Exit 1, `error.code` `SEED_REJECT`, product `missing-required-inputs`.
- **Product refuse as mapped feature.** `pack run useful-jobs --expect-product-reject -- -- run lockfile-pin-delta` exits 0 only after observing the child refuse.

## Gotchas

- Catalog `ownedPath` `tools/lockfile-pin-delta/` is **absent in this repo**; the engine lives in the archive.
- Inner README may still title 1.4.4; package/pin is 1.4.7.
- Do not treat a green `test:useful-jobs-public` as substitute for `bin/useful-jobs.mjs list` after a cold extract.
