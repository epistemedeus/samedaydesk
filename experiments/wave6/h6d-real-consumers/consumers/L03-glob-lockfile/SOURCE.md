# L03-glob-lockfile source

Official npm `package-lock.json` pair from `isaacs/node-glob`.
Job: useful-jobs 1.4.0 `lockfile-pin-delta`.

## Repository

- Repo: `isaacs/node-glob`
- Path: `package-lock.json`
- Official site: https://github.com/isaacs/node-glob

## Revisions (full SHAs)

| Role | Full SHA | Commit | Date (UTC) |
| --- | --- | --- | --- |
| before | `aee5a632c5c29d82dd5be14b0344ad52209bcaba` | update stuff | 2026-05-01T17:51:42Z |
| after | `7df583d631ff191e2f71a62b383926c0bd83ccda` | update tap, for newer uuid | 2026-05-01T17:53:57Z |

After's only parent is before. After's only changed file is `package-lock.json` (186 insertions / 183 deletions).

- before commit: https://github.com/isaacs/node-glob/commit/aee5a632c5c29d82dd5be14b0344ad52209bcaba
- after commit: https://github.com/isaacs/node-glob/commit/7df583d631ff191e2f71a62b383926c0bd83ccda

## License at SHA (not the assignment hint)

Assignment hint was ISC. At both SHAs:

- `package.json` `"license": "BlueOak-1.0.0"`
- `LICENSE.md` is the Blue Oak Model License Version 1.0.0 (identical blob at both SHAs)

Recorded license: **BlueOak-1.0.0**. ISC is historically associated with glob but is not the license of this pair.

## Retrieval

- Method: GitHub REST `GET /repos/isaacs/node-glob/commits/{sha}` plus `GET /repos/isaacs/node-glob/contents/{path}?ref={sha}` and raw.githubusercontent.com for file bytes.
- retrievedAt: `2026-09-12T06:53:16Z`
- No registry install, no live lockfile fetch on the job path.

## Stored fixtures (full-blob sha256)

| File | bytes | sha256 |
| --- | ---: | --- |
| `fixtures/official/package-lock.before.json` | 204135 | `bd6ebe7138e0167883e29a6bf6a184de4d70de76fc88b3b68849a41789a3d0e9` |
| `fixtures/official/package-lock.after.json` | 204058 | `f88c43da0826c60a5b6c150134cb69640b3af75ef66b1e066db8ba9da99d9c15` |
| `fixtures/excerpt/package-lock.before.excerpt.json` | 21888 | `a335c49b0d25d073ade983023ade9ec16b5ca9a597a452d216707e2906c083bd` |
| `fixtures/excerpt/package-lock.after.excerpt.json` | 21811 | `a877c29a86c220f208971e1b1acd485bb2cc7af12afe0489b234bca2edc951f7` |
| `fixtures/excerpt/changed-pins.json` | 27016 | `4f581699053ee2f86b4585391cfc3557a65ad17b586073159089f05159dbd4fe` |
| `fixtures/license/LICENSE.md` | 1764 | `a49c9ba464796f65b59fca3f1e6ca40912df1e859f575383223f7ec6c5baae09` |
| `fixtures/license/package.json` | 2849 | `c6e8e925c5b497217143cfed58b26f49f84b2373bf83c23c914de1761bf06712` |

Git blob SHAs from contents API (not file sha256):

- before `package-lock.json` git blob `59550e4250a09436aced1e823f5fe6bfa096e4a2` (size 204135)
- after `package-lock.json` git blob `d97c70810ebc748614c6a6a364119579fcdb0308` (size 204058)
- `LICENSE.md` git blob `881248b6d7f0ca2c4f65c41c0af5e02bb0680601` (size 1764) at both SHAs

Excerpts keep the 29 changed `packages` entries plus unchanged controls (`minimatch`, `minipass`, `path-scurry`, `@types/node`) and record the full-blob sha256 above.

## Pin movement proven from lockfile bytes

Independent witness on the full stored blobs (lockfileVersion 3, `packages` map, 403 pins each):

- added 0, removed 0, changed 29, unchanged 374
- `node_modules/tap` `21.7.1` → `21.7.2` (integrity + resolved also move)
- `node_modules/uuid` `8.3.2` → `14.0.0` (integrity + resolved also move)
- remaining 27 changed pins are `@tapjs/*`, `tap-parser`, `tap-yaml`, `tcompare`
- control pin `node_modules/minimatch` stays `10.2.5` with identical integrity/resolved

## Kit

- Archive: `/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz`
- sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes)
- Extracted under `vendor/useful-jobs-1.4.0/`
- SAMPLE / `--example` / H04 mocha excerpts are not this pair
