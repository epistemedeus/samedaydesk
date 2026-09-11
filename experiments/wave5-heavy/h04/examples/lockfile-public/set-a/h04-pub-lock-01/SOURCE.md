# h04-pub-lock-01 primary source

Repo: `mochajs/mocha`  
Path: `package-lock.json` (source lockfileVersion **2** `packages` map; stored fixture is a lockfileVersion **3** subset)

| Role | SHA | Subject |
| --- | --- | --- |
| before | `202e9b8b4d1b6611c96d95d631c49d631d88c827` | build(v10.2.0): release |
| after | `d722d0038602eeb6968616b49ec79288100fdc72` | chore(deps): update 'glob' to v8 (#4970) |

Raw:

- https://raw.githubusercontent.com/mochajs/mocha/202e9b8b4d1b6611c96d95d631c49d631d88c827/package-lock.json
- https://raw.githubusercontent.com/mochajs/mocha/d722d0038602eeb6968616b49ec79288100fdc72/package-lock.json

Commits:

- https://github.com/mochajs/mocha/commit/202e9b8b4d1b6611c96d95d631c49d631d88c827
- https://github.com/mochajs/mocha/commit/d722d0038602eeb6968616b49ec79288100fdc72

Fetched via `git clone --filter=blob:none https://github.com/mochajs/mocha.git` then `git show <sha>:package-lock.json`.

The glob v8 lock refresh rewrites many surviving pins from sha1 SRI to sha512 SRI without changing `version` or `resolved`. Full source blobs are 1.59MB / 1.57MB, so this fixture is a bounded lockfileVersion 3 `packages` subset. Exact package triples below are copied from the real commit bytes (not invented, not W4/M07 fixtures).

## Proven same-version integrity triples (from source `packages`)

`node_modules/archy` `1.0.0` (same version):

```
-      "integrity": "sha1-+cjBN1fMHde8N5rHeyxipcKGjEA=",
+      "integrity": "sha512-Xg+9RwCg/0p32teKdGMPTPnVXKD0w3DfHnFTficozsAgsvq2XenPJq/MYpzzQ/v8zrOyJn6Ds39VA4JIDwFfqw==",
       "resolved": "https://registry.npmjs.org/archy/-/archy-1.0.0.tgz",
```
`node_modules/ansi-wrap` `0.1.0` (same version):

```
-      "integrity": "sha1-qCJQ3bABXponyoLoLqYDu/pF768=",
+      "integrity": "sha512-ZyznvL8k/FZeQHr2T6LzcJ/+vBApDnMNZvfVFy3At0knswWd6rJ3/0Hhmpu8oqa6C92npmozs890sX9Dl6q+Qw==",
       "resolved": "https://registry.npmjs.org/ansi-wrap/-/ansi-wrap-0.1.0.tgz",
```
`node_modules/array-uniq` `1.0.3` (same version):

```
-      "integrity": "sha1-r2rId6Jcx/dOBYiUdThY39sk/bY=",
+      "integrity": "sha512-MNha4BWQ6JbwhFhj03YK552f7cb3AzoE8SzeljgChvL1dl3IcvggXVz1DilzySZkCja+CXuZbdW7yATchWn8/Q==",
       "resolved": "https://registry.npmjs.org/array-uniq/-/array-uniq-1.0.3.tgz",
```

Unchanged neighbor pins in the subset (must omit as pin deltas): `@colors/colors@1.5.0`, `@hapi/hoek@8.5.1`.

In the full source pair, 439 `packages` keys keep name+version while integrity moves sha1→sha512; 0 of those also change `resolved`. This subset stores 3 of those integrity rewrites.

Original lockfileVersion is 2 (engine-supported). Stored subset is lockfileVersion 3 with the same name/version/integrity/resolved fields.
