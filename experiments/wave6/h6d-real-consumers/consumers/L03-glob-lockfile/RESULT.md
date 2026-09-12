# L03-glob-lockfile result

Status: **pass**. `node --test` 13 pass / 0 fail.

## Source

Official pair `isaacs/node-glob` `package-lock.json`:

- before `aee5a632c5c29d82dd5be14b0344ad52209bcaba` (“update stuff”, 2026-05-01T17:51:42Z)
- after `7df583d631ff191e2f71a62b383926c0bd83ccda` (“update tap, for newer uuid”, 2026-05-01T17:53:57Z)

After’s only parent is before. After’s only changed file is `package-lock.json`.

License at both SHAs is **BlueOak-1.0.0** (Blue Oak Model License 1.0.0 in `LICENSE.md`). The assignment hint ISC is not the license of this pair.

Full stored blobs:

- before 204135 bytes sha256 `bd6ebe7138e0167883e29a6bf6a184de4d70de76fc88b3b68849a41789a3d0e9`
- after 204058 bytes sha256 `f88c43da0826c60a5b6c150134cb69640b3af75ef66b1e066db8ba9da99d9c15`

## Engine vs independent witness

useful-jobs 1.4.0 `lockfile-pin-delta` (kit sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`) and `witness.mjs` agree:

| | |
| --- | --- |
| status | actionable |
| lockfileVersion | 3 → 3 |
| pins | 403 → 403 |
| added / removed / changed / unchanged | 0 / 0 / 29 / 374 |

Proven from lockfile bytes (not from the commit title):

- `node_modules/tap` `21.7.1` → `21.7.2` (integrity and resolved also move)
- `node_modules/uuid` `8.3.2` → `14.0.0` (integrity and resolved also move)
- 27 sibling `@tapjs/*` / `tap-parser` / `tap-yaml` / `tcompare` pins move with tap
- `node_modules/minimatch@10.2.5` is unchanged (control pin)

Control (identical before/after): informational, 0 changed, 403 unchanged.

Negatives refuse closed: yarn.lock, HTML, package.json-only, lockfileVersion 1, missing `--before/--after`, live URL as a local miss (no fetch).

## Honesty

- Not a purchase, npm install, audit, or settlement.
- SAMPLE / `--example` / H04 mocha excerpts are not this customer pair.
- yarn.lock is not converted to npm lockfile.
- Independent witness does not import kit engines.
- Engine agreed; no `regression-artifact.json`.

Receiving owner: H6D-parent catalog + `bin/select-job.mjs`.
