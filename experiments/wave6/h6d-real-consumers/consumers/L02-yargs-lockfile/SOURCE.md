# L02-yargs-lockfile source

Official repository: [yargs/yargs](https://github.com/yargs/yargs)
Path: `package-lock.json`
License: MIT (`LICENSE` identical at both SHAs, git blob `b0145ca0b03bdc922de70dbaf5ae87c3a244c413`)

## Revisions (full 40-char SHAs)

| Role | SHA | Date (UTC) | Subject |
| --- | --- | --- | --- |
| before | `4153e0f097aeaf43a71a2530db6dda51dff2c544` | 2026-07-11T01:41:42Z | chore: improve build robustness (#2554) — adds `package-lock.json` |
| after | `8878a894111e3fe7c98d84af546c0f34fa017492` | 2026-07-26T03:06:55Z | chore(main): release 18.1.0 (#2475) |

Resolved via GitHub REST `GET /repos/yargs/yargs/commits/{sha}` (prefix `4153e0f097ae` / `8878a894111e`).

Compare `4153e0f0…` → `8878a894…` is two commits ahead; `package-lock.json` changes 4 lines (2 add / 2 del): lockfile `version` and `packages[""].version` `18.0.0` → `18.1.0`. No `node_modules/*` pin fields move.

## Retrieval

- Method: GitHub Contents API + `raw.githubusercontent.com` (bounded two-file fetch; no repo clone, no mass scraping)
- Retrieved at: `2026-09-12T06:50:23.000Z`
- Job path never fetches; stored fixtures are the only inputs

## Stored fixtures (bytes / sha256)

| File | bytes | sha256 | git blob |
| --- | ---: | --- | --- |
| `fixtures/official/package-lock.before.json` | 281077 | `fbab2725e79189189ff45ccef1cdee7b7400af5bdb7197b407c2aea118177130` | `b27cda064344e90087b00b4209e6e4197c093007` |
| `fixtures/official/package-lock.after.json` | 281077 | `06b3c838d9452ee690ca42a706a597b285da6542f7f2d28117133dc404edac40` | `e646b04f1649c1a12a5547a92bb911543bcab993` |
| `fixtures/official/LICENSE` | 1146 | `2f1a503bfab84b3ba7393627308b3274501e459e3b5185bbb56bbf16cb1602d4` | `b0145ca0b03bdc922de70dbaf5ae87c3a244c413` |
| `fixtures/official/pins-excerpt.json` | 2864 | `84f275c7457b50e79bc2af208dfb6b7aa27a9f694d00b5e9ec6108bd6baae0ff` | n/a (excerpt) |

Negative (synthetic, not upstream yargs):

| File | bytes | sha256 |
| --- | ---: | --- |
| `fixtures/negative/yarn.lock` | 475 | `ede6e77fa0e073d9dc6285ec66e1496c2f0911216b6dd7066390355dff264a38` |
| `fixtures/negative/package.json` | 301 | `fa1a378e9bbd908a8e0e560843fe8817a4094fc354f087706f6dae8d8aec8436` |
| `fixtures/negative/not-a-lock.html` | 153 | `29e9994edd3a04ac193fce1db976522b51f4eb22284a488f877997b7ea843b44` |

## Proven pin fact

`lockfileVersion` 3 both sides. 562 registry pins (`packages` keys except `""`) are identical on name, version, integrity, and resolved. Root project version `18.0.0` → `18.1.0` is the local package, not a registry pin (`packages[""]` is skipped by lockfile-pin-delta). Representative unchanged pins: `cliui@9.0.1`, `yargs-parser@22.0.0`, `escalade@3.2.0`.

## Honesty

- Official pair is yargs, not mocha / axios / express / debug / prettier / got / webpack-cli / npm-cli lockfiles
- npm lockfileVersion 2 or 3 only; yarn.lock is a refuse, not a conversion
- No purchase, live registry, or install
