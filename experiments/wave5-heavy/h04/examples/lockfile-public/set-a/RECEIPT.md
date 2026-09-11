# H04 lockfile-public set-a (child)

Owned path: `experiments/wave5-heavy/h04/examples/lockfile-public/set-a/`  
Engine surface: M01 `lockfile-pin-delta` (`m01EngineId`)  
Not copied: W4 `tools/lockfile-pin-delta/fixtures/*`, W5-M07 lock corpora, SDS lock examples, epistemedeus/samedaydesk.  
No version bump is claimed as a CVE.

Fetched with `git clone --filter=blob:none` of the six permitted public repos, then `git show <sha>:package-lock.json`.

## Distinct projects used (2 of 6)

Only **mochajs/mocha** and **axios/axios** commit `package-lock.json` on any fetched ref. The other four permitted repos do not:

| repo | lockfile |
| --- | --- |
| expressjs/express | `.npmrc` `package-lock=false`; no `package-lock.json` |
| debug-js/debug | historical `yarn.lock` only (removed `310ae229`) |
| prettier/prettier | `yarn.lock` only |
| sindresorhus/got | no `package-lock.json` |

A third distinct project among the allowed list cannot be proven. Unknown stays unknown; integrities were not invented.

Mocha is used for two *distinct semantics* (integrity-source and resolved-url). Axios covers addition. All three required semantics are proven from raw lock bytes.

## Three ids

| id | kind | project | beforeSha → afterSha | proven triples |
| --- | --- | --- | --- | --- |
| `h04-pub-lock-01` | integrity-source | mochajs/mocha | `202e9b8b4d1b6611c96d95d631c49d631d88c827` → `d722d0038602eeb6968616b49ec79288100fdc72` | `archy@1.0.0` integrity `sha1-+cjBN1fMHde8N5rHeyxipcKGjEA=` → `sha512-Xg+9RwCg/0p32teKdGMPTPnVXKD0w3DfHnFTficozsAgsvq2XenPJq/MYpzzQ/v8zrOyJn6Ds39VA4JIDwFfqw==` (resolved unchanged); `ansi-wrap@0.1.0` sha1→sha512; `array-uniq@1.0.3` sha1→sha512 |
| `h04-pub-lock-02` | resolved-url | mochajs/mocha | `cb5eb8ed42abfd0d63c5013353843f1208ff6582` → `12b130b10e7ed1ee40e8becec3ca75066314fc43` | `got@6.7.1` resolved `http://registry.npmjs.org/got/-/got-6.7.1.tgz` → `https://registry.npmjs.org/got/-/got-6.7.1.tgz` (integrity unchanged); `path-is-absolute@1.0.1` http→https; `strip-eof@1.0.0` http→https |
| `h04-pub-lock-03` | addition | axios/axios | `e9cfed35cfd18778050da9892a29efd8e9fc4d82` → `d676df772244726533ca320f42e967f5af056bac` | added `node-forge@1.3.1` integrity `sha512-dPEtOeMvF9VMcYV/1Wb8CPoVAXtp6MKMlcbAt4ddqmGqUJ6fQZFXkNZNkNlfevtNkGtaSoXf/vNNNSvgrdXwtA==`; added `selfsigned@3.0.1` integrity `sha512-6U6w6kSLrM9Zxo0D7mC7QdGS6ZZytMWBnj/vhF9p+dAHx6CwGezuRcO4VclTbrrI7mg7SD6zNiqXUuBHOVopNQ==` |

`expected-facts.json` is computed from raw JSON parse of stored `before.json`/`after.json` (`name`, `version`, `integrity`, `resolved`), not from running lockfile-delta. Stored fixtures are lockfileVersion 3 subsets because every source blob is >200KB. Pin fields were copied from `git show` of the listed SHAs.

## Engine notes (not invented as source facts)

- Pin-terms hash is name+version+integrity. Resolved-only http→https (`h04-pub-lock-02`) is a source fact; the engine may omit it.
- Original mocha resolved pair is lockfileVersion 1 (`unsupported-lockfile-version` if fed raw). Stored subset is v3 so the example is parseable. See `expected-refusal.json`.
- `h04-pub-lock-02` is not a no-change control. Unchanged neighbor pins are listed in `expected-no-change.json` as must-omit.

## Compact return

`h04-pub-lock-01` mochajs/mocha `202e9b8b4d1b6611c96d95d631c49d631d88c827` → `d722d0038602eeb6968616b49ec79288100fdc72` archy@1.0.0 / ansi-wrap@0.1.0 / array-uniq@1.0.3 sha1→sha512.  
`h04-pub-lock-02` mochajs/mocha `cb5eb8ed42abfd0d63c5013353843f1208ff6582` → `12b130b10e7ed1ee40e8becec3ca75066314fc43` got@6.7.1 / path-is-absolute@1.0.1 / strip-eof@1.0.0 resolved http→https.  
`h04-pub-lock-03` axios/axios `e9cfed35cfd18778050da9892a29efd8e9fc4d82` → `d676df772244726533ca320f42e967f5af056bac` add node-forge@1.3.1 + selfsigned@3.0.1.
