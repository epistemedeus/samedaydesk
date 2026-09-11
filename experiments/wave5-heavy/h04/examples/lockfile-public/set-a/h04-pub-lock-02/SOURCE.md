# h04-pub-lock-02 primary source

Repo: `mochajs/mocha`  
Path: `package-lock.json` (source lockfileVersion **1** `dependencies` map; stored fixture is a lockfileVersion **3** subset of the same name/version/integrity/resolved triples)

| Role | SHA | Subject |
| --- | --- | --- |
| before | `cb5eb8ed42abfd0d63c5013353843f1208ff6582` | multiple async done() calls result in failure; closes #4151 (#4152) |
| after | `12b130b10e7ed1ee40e8becec3ca75066314fc43` | fetch sponsors at build time, show ALL non-skeevy sponsors; closes #4271 (#4272) |

Raw:

- https://raw.githubusercontent.com/mochajs/mocha/cb5eb8ed42abfd0d63c5013353843f1208ff6582/package-lock.json
- https://raw.githubusercontent.com/mochajs/mocha/12b130b10e7ed1ee40e8becec3ca75066314fc43/package-lock.json

Commits:

- https://github.com/mochajs/mocha/commit/cb5eb8ed42abfd0d63c5013353843f1208ff6582
- https://github.com/mochajs/mocha/commit/12b130b10e7ed1ee40e8becec3ca75066314fc43

Fetched via `git clone --filter=blob:none https://github.com/mochajs/mocha.git` then `git show <sha>:package-lock.json`.

These consecutive lockfile versions (mocha 7.1.0 both sides) rewrite `resolved` from `http://registry.npmjs.org/<name>/-/<name>-<ver>.tgz` to `https://registry.npmjs.org/<name>/-/<name>-<ver>.tgz` while `version` and `integrity` stay identical. That is a resolved URL pin change of registry path scheme (http→https), proven from raw lock bytes.

Full source blobs are ~719KB each, so this fixture is a bounded lockfileVersion 3 subset. Engine `lockfile-pin-delta` refuses lockfileVersion 1 (`unsupported-lockfile-version`); the stored subset is v3 so the job can parse. `expected-facts.json` still records the `resolved` field the engine does not hash (name+version+integrity only).

## Proven same-version resolved triples (from source `dependencies`)

`node_modules/got` `6.7.1` (same version, same integrity):

```
-      "resolved": "http://registry.npmjs.org/got/-/got-6.7.1.tgz",
+      "resolved": "https://registry.npmjs.org/got/-/got-6.7.1.tgz",
       "integrity": "sha1-JAzQV4WpoY5WHcG0S0HHY+8ejbA=",
```
`node_modules/path-is-absolute` `1.0.1` (same version, same integrity):

```
-      "resolved": "http://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz",
+      "resolved": "https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz",
       "integrity": "sha1-F0uSaHNVNP+8es5r9TpanhtcX18=",
```
`node_modules/strip-eof` `1.0.0` (same version, same integrity):

```
-      "resolved": "http://registry.npmjs.org/strip-eof/-/strip-eof-1.0.0.tgz",
+      "resolved": "https://registry.npmjs.org/strip-eof/-/strip-eof-1.0.0.tgz",
       "integrity": "sha1-u0P/VZim6wXYm1n80SnJgzE2Br8=",
```

Unchanged neighbor pins in the subset (https already, identical): `@babel/code-frame` and `@11ty/dependency-tree` as stored.

In the full source pair, 16 dependency entries rewrite http→https at unchanged integrity; this subset stores 3 of them (`got`, `path-is-absolute`, `strip-eof`).
