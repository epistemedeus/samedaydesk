# Lockfile pin-delta feature map

Offline SameDayDesk job. Compares two npm `package-lock.json` files (lockfileVersion 2 or 3) and emits added, removed, and changed name+version+integrity triples. Vendor-budget-impact remains curated pricing rows; this job is lockfile pins only.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Caller pin brief | `bin/lockfile-delta.mjs` | `node bin/lockfile-delta.mjs --before <lock> --after <lock> [--out-dir <dir>]` | Writes `pin-delta.json` and `pin-delta.md`. Status `actionable` when a triple changes. Unchanged packages omitted. `purchaseAuthority` always false. | `test/cli.test.mjs` journey | Node >= 22. Local files only. |
| Labeled example | same | `--example` | Loads `fixtures/journey/`. `sampleLabel=explicit-example`. Not a customer delta. | `--example` CLI test | none |
| Integrity-only edit | `lib/compare.mjs` + `lib/hash-terms.mjs` | same CLI | Same version, different integrity is a change. Hash is the integrated `{name,version,integrity}` terms, not version alone. | integrity-only test | none |
| HTML / package.json refuse | `lib/parse-lockfile.mjs` | same CLI | Exit 2, `html-input` or `package-json-only` | seeded CLI tests | none |
| Missing integrity | compare | same CLI | Status `partial`, still lists known deltas | missing-integrity fixture | none |
| SAMPLE as customer | `lib/sample.mjs` | caller `--before/--after` on SAMPLE fixtures, or `--example --as-customer` | Refuses `sample-as-customer-delta` | seeded CLI test | none |
| SDS local lock | parse of repo `package-lock.json` | tests only; do not modify that file | lockfileVersion 3, `packages` map, 160 pins in this checkout | `test/local-runtime.test.mjs` | SDS checkout with root lockfile |
| Later I01 hash bind | `createHashTermsAdapter` | inject `hashPinTerms` | Local SHA-256 canonical JSON until I01 hasher is published. Do not copy F01 or an earned-work kernel. | injected adapter test | I01 not on SDS main |

Outputs are a nonsettling prototype. They are not an npm install, audit, purchase, or settlement.
