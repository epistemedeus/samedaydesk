# L04-winston-lockfile source

Official npm lockfile pair for useful-jobs 1.4.0 `lockfile-pin-delta`.

## Repository

- Repo: [winstonjs/winston](https://github.com/winstonjs/winston)
- Path: `package-lock.json`
- License: MIT (`LICENSE` at the after SHA; root `package-lock.json` also records `"license": "MIT"`)
- Fallback not used. `koajs/koa` minimatch 3.1.2→3.1.5 was reserved only if this pair had identical pins.

## Resolved SHAs

Candidate prefixes from the assignment were `4b963a9f5b1e` → `96dccd6e3217`. GitHub REST resolved them to:

| Role | Full SHA | Subject | Date (UTC) |
|------|----------|---------|------------|
| before | `4b963a9f5b1ef24efb6250354a108b80c0c6e7d9` | Bump @babel/preset-env from 7.25.4 to 7.29.7 (#2617) | 2026-06-15T19:17:54Z |
| after | `96dccd6e32174c658149189abb6edb13572281b4` | Bump async from 3.2.5 to 3.2.6 (#2621) | 2026-07-12T04:49:11Z |

The after commit's sole parent is the before SHA. After commit files: `package-lock.json` only (4 additions, 3 deletions). PR: https://github.com/winstonjs/winston/pull/2621

## Retrieval

Method: GitHub REST + raw (User-Agent `h6d-l04`), retrieved 2026-09-12T06:50:11Z.

- `GET https://api.github.com/repos/winstonjs/winston/commits/96dccd6e3217`
- `GET https://api.github.com/repos/winstonjs/winston/commits/4b963a9f5b1e`
- `GET https://api.github.com/repos/winstonjs/winston/contents/package-lock.json?ref=<fullSha>`
- `https://raw.githubusercontent.com/winstonjs/winston/<fullSha>/package-lock.json`
- `https://raw.githubusercontent.com/winstonjs/winston/96dccd6e32174c658149189abb6edb13572281b4/LICENSE`

No live registry, npm install, or scheduler.

## Stored fixtures (bytes + sha256)

| Fixture | bytes | sha256 | git blob |
|---------|------:|--------|----------|
| `fixtures/official/before/package-lock.json` | 279571 | `8375bf80b1905e1011e076abb9e625e76b933296ef36c9b926c5d182b8abd199` | `33e9d79c4d40329c16569202731b7eb5709ae219` |
| `fixtures/official/after/package-lock.json` | 279592 | `916fbc5f044cc713a78f57f7c59c90ab5404c90374190e7a8f7ffb875fc70cf0` | `0a17e82c0a0ee8cfafba50dfda3079d5de8b7773` |
| `fixtures/official/LICENSE` | 1058 | `e61f2ace04e689d21ba1a7bc54d933bcb6e35ebeb887fb5831b880be5de192a7` | `948d80dd6c0cc10501702616c37da9e361aea069` |

Both lockfiles are `lockfileVersion` 3 with a `packages` map. Full blobs are stored (bounded). Pin excerpt: `fixtures/excerpts/async-pin.json`. Commit metadata: `fixtures/provenance/commits.json`. Checksums: `fixtures/SHA256.json`.

## Proven pin fact

`node_modules/async` (name inferred from the packages key; the entry has no `"name"` field):

| Field | before 3.2.5 | after 3.2.6 |
|-------|--------------|-------------|
| version | `3.2.5` | `3.2.6` |
| integrity | `sha512-baNZyqaaLhyLVKm/DlvdW051MSgO6b8eVfIezl9E5PqWxFgzLm/wQntEW4zOytVburDEr0JlALEpdOFwvErLsg==` | `sha512-htCUDlxyyCLMgaM3xXg0C0LW2xqfuQ6p05pCEIsXuyQ+a1koYKTuBMzRNwmybfLgvJDMd0r1LTn4+E0Ti6C2AA==` |
| resolved | `https://registry.npmjs.org/async/-/async-3.2.5.tgz` | `https://registry.npmjs.org/async/-/async-3.2.6.tgz` |

The after entry also adds `"license": "MIT"`, which is **not** a pin-identity field.

Independent witness and useful-jobs 1.4.0 engine both report exactly one changed pin, zero added, zero removed.

## Kit

Cold extract of published useful-jobs 1.4.0 (sha256 `2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f`, 2575215 bytes) at `vendor/useful-jobs-1.4.0/`. Engines were not edited.

## Honesty

- Not H04 mocha/axios lock excerpts; not webpack-cli/npm-cli/yarn.lock set-b.
- yarn.lock is not npm package-lock (negative). Engine refuse code for the yarn fixture is `parse-error` (non-JSON); the independent witness labels `yarn-lockfile`.
- `purchaseAuthority` is false. No sale, audit, or install.
