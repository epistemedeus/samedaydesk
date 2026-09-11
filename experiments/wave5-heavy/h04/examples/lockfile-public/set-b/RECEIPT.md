# lockfile-public set-b receipt

Owned path: `experiments/wave5-heavy/h04/examples/lockfile-public/set-b/`  
Not committed from this child. Not copied: W4 `tools/lockfile-pin-delta/fixtures/*`, W5-M07 corpora, set-a repos (`express` / `axios` / `debug` / `prettier` / `mocha` / `got`).

Engines executed (read-only):

| Pin | SHA | CLI |
| --- | --- | --- |
| W4 lockfile-pin-delta | `e81efc8ab71b1bde88eca743d297149e61bbb6f2` | `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs` |
| M01 composition | `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e` | `node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta` |
| M01 in-tree tool | `fba9d14872bc4c04214e527b9edfb30c2123c9e7` | `node tools/lockfile-pin-delta/bin/lockfile-delta.mjs` |

`expected-facts.json` is a raw `packages`-map parse (name+version+integrity+resolved; skip `""` and `link:true`). It is not engine stdout.

## Four ids (distinct remaining semantics)

| id | semantic | project | SHAs | raw fact | engine |
| --- | --- | --- | --- | --- | --- |
| `h04-lock-pub-b04-removal` | dependency removal (packages key present → absent) | `webpack/webpack-cli` | `cbd3a24dbdadd84e3614f9aff1068af2f1275cfe` → `3664b9d8239834f63124783307dd3e93953d6dd9` | removed 8: array-flatten@1.1.1, binary-extensions@2.3.0, core-util-is@1.0.3, destroy@1.2.0, detect-node@2.1.0, faye-websocket@0.11.4, follow-redirects@1.16.0, http-proxy@1.18.1 | `actionable`, removed 8, added 0, changed 0 |
| `h04-lock-pub-b05-normalize` | useful no-change (key order, indent 4, unused fields, link:true) | `npm/cli` | `b888cc9a9ff34a8b023ff47b784692396635397b` (self) | 22 pins identical | `informational`, added 0, removed 0, changed 0 |
| `h04-lock-pub-b06-refuse` | unsupported format | `yarnpkg/berry` | `3ad9e35026e514632a5ff8551d8308852094befd` (yarn.lock) | not npm JSON; no packages map | exit **2**, `refused: true`, `code: parse-error`. M01 `outcome.kind: refused` |
| `h04-lock-pub-b07-large` | realistic large bounded lockfileVersion 3 | `epistemedeus/samedaydesk` | `218b2fa74d63951eeeda4cf0a67c420835a58b01` (self, full blob) | 160 pins, 0 delta, missingIntegrity 1 | `partial` (vendor pin has no integrity); added 0, removed 0, changed 0 |

`webpack/webpack` gitignores `package-lock.json` and ships `yarn.lock`, so removal uses webpack-org `webpack-cli` npm lockfileVersion 3. `lodash/lodash` lock is lockfileVersion 1 (would refuse). `request/request` has no lockfile. `npm/cli` latest is 1202 packages (~437 KiB) — over the 100–300 pin store cap; large uses SDS 160 pins (72 KiB) as allowed.

## expected-refusal.json (unsupported)

```json
{ "expected": true, "engineId": "lockfile-pin-delta", "exitCode": 2 }
```

Proven on W4 and M01 against the public Berry blob (813432 bytes, sha256 `9c4eca915296cc1e71d975680a01dfd8b42a3bc0dde74fad0abb31201a7c83a5`).

## Compact return

- `h04-lock-pub-b04-removal` webpack-cli `cbd3a24`→`3664b9d`: 8 packages keys removed.
- `h04-lock-pub-b05-normalize` npm/cli `b888cc9a` 12.0.2 extract: noise, no pin delta.
- `h04-lock-pub-b06-refuse` yarnpkg/berry `3ad9e350` yarn.lock: refuse exit 2.
- `h04-lock-pub-b07-large` samedaydesk `218b2fa` full v3 lock, 160 pins.
