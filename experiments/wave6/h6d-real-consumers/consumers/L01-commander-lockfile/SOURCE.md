# L01 commander.js lockfile source

Official npm `package-lock.json` pair for useful-jobs 1.4.0 `lockfile-pin-delta`.

## Repository

- Repo: [tj/commander.js](https://github.com/tj/commander.js)
- Path: `package-lock.json`
- License: MIT (`LICENSE` at the after SHA; SPDX `MIT`)
- Copyright: Copyright (c) 2011 TJ Holowaychuk `<tj@vision-media.ca>`

## Revisions (full SHAs)

Short candidates `9098b4863ef7` and `d785d8b3b944` resolved via GitHub commits API.

| Role | Full SHA | Commit | Date (UTC) |
| --- | --- | --- | --- |
| before | `9098b4863ef7678b9d138ae0f04afd949287510c` | Update dependencies (#2506) | 2026-04-13T22:33:18Z |
| after | `d785d8b3b9448952ef023a8cd26a0a3923a90458` | Update dependencies (#2518) | 2026-05-22T05:14:05Z |

The after commit's parent is the before commit. Both lockfiles are `lockfileVersion` **3** (`packages` map).

- Before commit: https://github.com/tj/commander.js/commit/9098b4863ef7678b9d138ae0f04afd949287510c
- After commit: https://github.com/tj/commander.js/commit/d785d8b3b9448952ef023a8cd26a0a3923a90458

## Retrieval

Method: GitHub REST + raw. No registry install, no live job fetch.

1. `GET https://api.github.com/repos/tj/commander.js/commits/9098b4863ef7`
2. `GET https://api.github.com/repos/tj/commander.js/commits/d785d8b3b944`
3. `GET https://raw.githubusercontent.com/tj/commander.js/<full-sha>/package-lock.json`
4. `GET https://raw.githubusercontent.com/tj/commander.js/d785d8b3b9448952ef023a8cd26a0a3923a90458/LICENSE`
5. Contents API for git blob SHAs of `package-lock.json` (metadata only; base64 dumps not stored)

Retrieved at: `2026-09-12T06:54:31Z`

## Stored fixtures (bytes / sha256)

Full blobs (authoritative):

| File | Bytes | sha256 |
| --- | ---: | --- |
| `fixtures/official/before.package-lock.json` | 94671 | `58f7587d6e2aaa12b3f82914c38af3774dabd1c6de2a5ca26741d4f2c3bbf528` |
| `fixtures/official/after.package-lock.json` | 95153 | `1ad36cdbfbbac6513de58c34772e4769670e6c484a7a2927b5e13a3ade0941d5` |
| `fixtures/official/LICENSE` | 1098 | `04512a63dce4d2d506ad612dc0bd7681ccf6e3655f7b6eaef7dfac8323d1ec0b` |

Git blob SHA-1 (GitHub contents `sha`):

- before `package-lock.json`: `08d0bef28aad911a9b7336eb851d35d5b8881807`
- after `package-lock.json`: `f48132b8c306b257e0db6204a77153bac1311ee6`

Bounded excerpts (changed/added `packages` only; not a substitute for full-blob hashes):

| File | Bytes | sha256 |
| --- | ---: | --- |
| `fixtures/excerpt/before-changed-packages.json` | 7369 | `3d787aa695898ba06cfea77d6d956591b3c2a02b3fe579de941b909b521d7e4a` |
| `fixtures/excerpt/after-changed-packages.json` | 7638 | `365146d0b1b0c5be5817cfd69de1f3146b16865ebaed73d5a3936edbc863ff1a` |
| `fixtures/excerpt/expected-delta.json` | 26483 | `caa9a85628123b67769392aad7ca40492e4056471362d53db74a9a09456b9a18` |

Negatives (not official lockfile pairs):

| File | Bytes | sha256 | Role |
| --- | ---: | --- | --- |
| `fixtures/negative/yarn.lock` | 291 | `790300f5cd45e49685ea209a3afd4405b826e8472474f011c41894ca6d5a531e` | synthetic yarn v1; not H04 webpack-cli/npm-cli |
| `fixtures/negative/package.json` | 1636 | `d2bb4e4b85da726720963e876a2e086b273a646601cb4263070c07d067bf3e42` | commander `package.json` at after SHA |

Provenance machine file: `fixtures/provenance.json`.

## Independent pin facts (name+version+integrity+resolved)

Witness on the full blobs (root `""` and `link:true` skipped):

- before pins: 203
- after pins: 204
- added: 1 (`@humanfs/types@0.15.0`)
- removed: 0
- changed: 25 (version+integrity+resolved on each)
- unchanged: 178
- missing integrity: 0

Spotlight changed pins:

- `typescript` 6.0.2 → 6.0.3
- `eslint` 10.2.0 → 10.4.0
- `prettier` 3.8.2 → 3.8.3
- `@eslint/config-helpers` 0.5.5 → 0.6.0

Kit: useful-jobs 1.4.0 archive sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f` (2575215 bytes), extracted under `vendor/useful-jobs-1.4.0/` for cold CLI. `--example` / SAMPLE is not this pair.
