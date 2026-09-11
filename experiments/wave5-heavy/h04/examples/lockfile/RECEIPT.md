# H04 lockfile examples (child)

Owned path: `experiments/wave5-heavy/h04/examples/lockfile/`  
Engine: `w4-lockfile-pin-delta` `e81efc8ab71b1bde88eca743d297149e61bbb6f2` (read-only `/tmp/w5-h04/ro-w4-lockfile`)  
Runs: `/tmp/w5-h04/h04-child-lock-runs/<id>`  
Not copied: W4 `tools/lockfile-pin-delta/fixtures/*`, W5-M07 lock corpora.

## Three ids

| id | kind | engine status | SHAs | triples that actually changed |
| --- | --- | --- | --- | --- |
| `h04-lock-01` | change | `actionable` | `ff381d2b46e9beec1475212df2eb610a7b01229b` → `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` | `concurrently@10.0.3→10.0.5`, `qs@6.15.2→6.16.0`, `shell-quote@1.8.4→1.9.0` (version+integrity) |
| `h04-lock-02` | change | `actionable` | sha1: PowerShell/vscode-powershell `75097e880339e45c09f5f6cca4dbdafe552b679f`; sha512: SDS `62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf` + registry.npmjs.org/ms/2.1.3 | `ms@2.1.3` integrity-only `sha1-V0yBOM4dK1hh8LRFedut1gxmFbI=` → `sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==` |
| `h04-lock-03` | no-change-control | `informational` | `218b2fa74d63951eeeda4cf0a67c420835a58b01` (self; subset minus local vendor path) | none (159 unchanged omitted) |

## Exact engine results

- lock-01: changed 3 / unchanged 99 / missingIntegrity 0. Full SDS lock blobs (102 pins). Parent `8ffef693719456a0acbc1e2afbbdff5900b82736` lock == before blob.
- lock-02: changed 1 (`changeKinds: ["integrity"]`) / unchanged 2 (`debug@4.4.3`, `safer-buffer@2.1.2` omitted).
- lock-03: added 0, removed 0, changed 0, unchanged 159. Key-order, 4-space indent, unused fields, extra `link:true` do not create a pin delta.

## Exact failure / status notes (not invented)

- Engine no-delta status is **`informational`**, not `unchanged`.
- Full-file self-diff of `218b2fa` is **`partial`** because `vendor/neomorphic-correspondence` (`@neomorphic/correspondence@0.1.0`) has no integrity. Control subsets that key out so the no-change job is `informational`. `node_modules/@neomorphic/correspondence` `link:true` is already skipped.
- SAMPLE / `--example` / HTML / package.json-only were not used as corpus. `purchaseAuthority` stayed false.

## Compact return

`h04-lock-01` concurrently@10.0.3→10.0.5, qs@6.15.2→6.16.0, shell-quote@1.8.4→1.9.0 (`ff381d2`→`62a88c8`).  
`h04-lock-02` ms@2.1.3 integrity-only (`75097e88` sha1 / SDS `62a88c8` sha512).  
`h04-lock-03` no pin delta (`218b2fa` subset, informational).
