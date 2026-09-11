# W5-M16 dependency-update trial feature map

Thin SameDayDesk consumer. Runs the pinned lockfile-pin-delta CLI on a real git lockfile pair, then joins `packages[id].resolved` from the staged bytes. Does not vendor that engine or add a catalog job.

| Goal | Entrypoint | Command | State | Tests | Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Real SDS lock pair | `bin/trial.mjs` | `node bin/trial.mjs run --journey sds-vuln-update` | Analysis `actionable` with named version+integrity+resolved URLs. Unchanged pins omitted. `purchaseAuthority` false. Field execution not performed. | `test/real-project.test.mjs` | Node >= 22. Git objects for the pin and the two SDS SHAs. |
| HTTP staging | same | `--before-url` `--after-url` | Fetches lock bytes to files, then the same CLI. | `test/http-and-catalog.test.mjs` | loopback HTTP |
| Valid refusal | same | HTML / SAMPLE / `--example` | Transport ok, analysis `refused`. Exit 2. | `test/seeded-failures.test.mjs` | engine pin |
| Transport failure | `--engine-root` | missing CLI or crashing fixture CLI | Analysis `not-run`. Exit 1. Missing engine is incomplete, never a skipped pass. | seeded-failures | none |
| Catalog binding | `catalog-binding` | F08 `list` + `run lockfile-pin-delta` | `unknown-job`. Remaining M01/D01 binding. | http-and-catalog | F08 pin |
| Constant hasher | engine library at the pin | not used by this CLI | Documented current-source finding; this kit refuses to inject a constant hasher. | `test/predictions.test.mjs` | engine pin |

Unlike schemas stay unlike: lockfile pin terms, disclosure documents, and the trial digest are never forced equal.
