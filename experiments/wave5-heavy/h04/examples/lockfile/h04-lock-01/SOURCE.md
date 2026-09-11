# h04-lock-01 primary source

Repo: `epistemedeus/samedaydesk`  
Path: `package-lock.json` (lockfileVersion 3, `packages` map)

| Role | SHA | Subject |
| --- | --- | --- |
| before | `ff381d2b46e9beec1475212df2eb610a7b01229b` | site: add exact seller repair briefs |
| after | `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` | fix(deps): update vulnerable locked dependencies |
| after-parent (same lock as before) | `8ffef693719456a0acbc1e2afbbdff5900b82736` | Merge pull request #36 |

`git show ff381d2b46e9beec1475212df2eb610a7b01229b:package-lock.json` and `git show 8ffef693719456a0acbc1e2afbbdff5900b82736:package-lock.json` are the same blob (`sha256:08166f190bee2ebf0a1e5b0848cc44d0e1a71fa2236c2322a9a5903ce1d3b8e2`). Fixtures `before.json` / `after.json` are those two git blobs, not W4 engine SAMPLE fixtures.

## `git show 62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf -- package-lock.json`

Only three `packages` entries change version+integrity (plus `concurrently.dependencies.shell-quote` and `qs.dependencies`):

```
    "node_modules/concurrently": {
-      "version": "10.0.3",
-      "resolved": "https://registry.npmjs.org/concurrently/-/concurrently-10.0.3.tgz",
-      "integrity": "sha512-hc3LH4UaKWd/bbyDK/IGVa4RB6PtQ3CUYwtrkzqHn+wIG3Hr5fhpRlk0L/gCa8ZE1L/Ufj50Zho69cI5w8SQBA==",
+      "version": "10.0.5",
+      "resolved": "https://registry.npmjs.org/concurrently/-/concurrently-10.0.5.tgz",
+      "integrity": "sha512-JaP/CoftUrCcAFW/g//RbgEGwlelnEae6cfBLgH6ZdO6s8jPkn6p9SB9u6pdVxYXoiSnFqseOlHfrEfF82TVOg==",
```

```
    "node_modules/qs": {
-      "version": "6.15.2",
-      "resolved": "https://registry.npmjs.org/qs/-/qs-6.15.2.tgz",
-      "integrity": "sha512-Rzq0KEyX/w/tEybncDgdkZrJgVUsUMk3xjh3t5bv3S1HTAtg+uOYt72+ZfwiQwKdysThkTBdL/rTi6HDmX9Ddw==",
+      "version": "6.16.0",
+      "resolved": "https://registry.npmjs.org/qs/-/qs-6.16.0.tgz",
+      "integrity": "sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==",
```

```
    "node_modules/shell-quote": {
-      "version": "1.8.4",
-      "resolved": "https://registry.npmjs.org/shell-quote/-/shell-quote-1.8.4.tgz",
-      "integrity": "sha512-VsC6n6vz1ihYYyZZwX7YZSF5l5x36ca17OC+a69h94YqB7X6XLwf+5MOgynYir2SLFUbl8gIYvBo8K8RoNQ6bQ==",
+      "version": "1.9.0",
+      "resolved": "https://registry.npmjs.org/shell-quote/-/shell-quote-1.9.0.tgz",
+      "integrity": "sha512-Iov+JwFv/2HcTpcwNMKd8+IWNb8tboQJNQTkAY/LLVK7gGH9jy+LGkVqPxfekHl+yMmiqXszdGWXgkfml7hjqA==",
```

Packages whose version/integrity actually changed in the commit: `concurrently`, `qs`, `shell-quote`. No adds/removes.

Engine (read-only): `e81efc8ab71b1bde88eca743d297149e61bbb6f2` `w4-lockfile-pin-delta` → status `actionable`, changed 3, unchanged 99 omitted.
