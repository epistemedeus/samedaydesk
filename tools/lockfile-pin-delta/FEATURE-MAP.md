# Lockfile pin-delta feature map

Offline SameDayDesk job. Compares two npm `package-lock.json` files (lockfileVersion 2 or 3) and emits added, removed, and changed name+version+integrity+resolved pins. Equality also covers npm install boundaries `link`, `optional`, `devOptional`, `os`, `cpu`, and `libc`. `termsHash` is an annotation. Vendor-budget-impact remains curated pricing rows; this job is lockfile pins only.

Current contract export (W5-M03 on this branch). Consumers bind this CLI and `lib/index.mjs`. Do not inject I01 `hashRequest` as pin equality. That hasher covers a different document.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Caller pin brief | `bin/lockfile-delta.mjs` | `node bin/lockfile-delta.mjs --before <lock> --after <lock> [--out-dir <dir>]` | Writes `pin-delta.json` and `pin-delta.md`. Status `actionable` when a pin field changes. CLI `digest` is SHA-256 of the written `pin-delta.json` bytes. Unchanged packages omitted. `purchaseAuthority` always false. | `test/cli.test.mjs` journey | Node >= 22. Local files only. |
| Labeled example | same | `--example` | Loads `fixtures/journey/`. `sampleLabel=explicit-example`. Not a customer delta. | `--example` CLI test | none |
| Integrity-only edit | `lib/compare.mjs` + `lib/hash-terms.mjs` | same CLI | Same version, different integrity is a change. | integrity-only test | none |
| Git / resolved edit | `lib/parse-lockfile.mjs` | same CLI | Same name+version+integrity with a different `resolved` (including git `#commit`) is a change. `changeKinds` includes `resolved`. | git-resolved CLI; v2-git-deps CLI; SDS resolved-only CLI | none |
| Workspace links | `lib/parse-lockfile.mjs` | same CLI | `link: true` stubs are retained with their local `resolved` target. Link integrity is not applicable. A target relocation cannot disappear as no-change. | npm 10 generated workspace relocation | none |
| Optional / platform boundary | `lib/hash-terms.mjs` | same CLI | Optionality and OS/CPU/libc selection changes are reported even when version, source, and integrity match. Array order and duplicate values are non-semantic. | npm 10 generated optional transition; bounded structural oracle | none |
| Duplicate keys / bounds | `lib/json-structure.mjs` + `lib/run.mjs` | same CLI | Decoded duplicate JSON members refuse. Inputs are capped at 16 MiB, nesting at 128, members at 100,000, pins at 50,000, and individual pin terms at 16,384 characters. | duplicate escaped-key CLI; byte and depth bounds | none |
| Unsupported manager formats | `lib/parse-lockfile.mjs` | same CLI | Generated pnpm YAML and Yarn classic/Berry locks refuse as `unsupported-lockfile-format`, distinct from valid npm no-change and malformed JSON. | pnpm 12 and Yarn 1 generated locks; empty npm no-change | none |
| HTML / package.json refuse | `lib/parse-lockfile.mjs` | same CLI | Exit 2, `html-input` or `package-json-only`. Analysis refusal, not a crash. | seeded CLI tests | none |
| Missing integrity | compare | same CLI | Status `partial`, still lists known deltas including resolved-only git pins. Integrity is not applicable to npm link stubs. | missing-integrity fixture; v2-git-deps; workspace link | none |
| SAMPLE as customer | `lib/sample.mjs` | caller `--before/--after` on SAMPLE fixtures, or `--example --as-customer` | Refuses `sample-as-customer-delta` | seeded CLI test | none |
| Constant / unlike hasher | `compareLockfileTexts` `hashPinTerms` option | library / process import | Injected constant or unstable hasher cannot erase or invent pin-field differences. I01 whole-terms hashes stay a different schema. | process constant-hasher test; unstable hasher self-compare | none |
| SDS local lock | parse of repo `package-lock.json` | tests only; do not modify that file | lockfileVersion 3, `packages` map | `test/local-runtime.test.mjs` | SDS checkout with root lockfile |
| Later wrapper bind | W5-M01 | not in this package | PR52 `aeef964fa188443078958d9d6d393afae1d542ee` wrapper/catalog does not list this job. Bind `bin/lockfile-delta.mjs` when that owner adds it. | none here | W5-M01 |

Outputs are a nonsettling prototype. They are not an npm install, audit, purchase, or settlement.
