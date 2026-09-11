# Feature map. W5-M15 schema-change real-project trial

Thin consumer of the current M02 JSON Schema used-path drift CLI. Not a second engine. Not OpenAPI. Not `api-upgrade-brief`.

## Caller goal

Run a permitted real JSON Schema revision pair through `tools/json-schema-webhook-drift` at pin `94c7bfdfeaa99f5e70f341504df3051cc7717f91`. Classify the result as analysis, engine-failure, or transport-failure. Maintainer usefulness stays unknown until a maintainer actually receives the brief.

## Entrypoint

| Item | Value |
| --- | --- |
| CLI | `node experiments/wave5/m15/bin/schema-change-trial.mjs` |
| Commands | `--pair <id>`, `--corpus`, `--list`, `--help` |
| Default pair | `schemastore-package-sideEffects` |
| Outputs | `trial-report.json` plus the engine `drift-brief.json` / `drift-brief.md` |
| Optional | `--out-dir` (else a temp directory) |

Engine staging. `git archive` of the M02 pin into `--out-dir/.engine`, or `M15_ENGINE_ROOT` pointing at a package that already has `bin/webhook-drift.mjs`. A missing engine is incomplete, not a skipped pass.

## Honesty

| Field | Meaning |
| --- | --- |
| `outcome.kind=analysis` | Engine produced a documented ok result or a documented refuse |
| `analysisStatus=informational` | Valid no-change or unused-path-only result |
| `analysisStatus=refused` | Valid refuse such as OpenAPI or remote `$ref` |
| `engine-failure` | Crash, non-JSON, `internal-error`, or ok without brief files |
| `transport-failure` | Spawn or timeout |
| `maintainerUsefulness` | always `unknown` in this kit |
| `customerBrief` / `sold` / `purchaseAuthority` | false |
| `postgres` | `not-applicable` |

## Architect skip

architect skipped: this slot is a thin consumer of a frozen CLI. The organizing structure is a classified trial record plus a pair/corpus registry. No new kernel.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m15/test/*.test.mjs
```

Node >= 22. No extra npm install.

## Later integration

- W5-M02 may amend false-schema / `$ref` sibling / required-array / fractional-numeric semantics. This kit pins the SHA it tested.
- W5-M06 independent corpus is not exported. Interim witnesses live in `fixtures/corpus/`.
- W5-D24 published-package install is not exported. Isolation here is git-archive staging.
- Field F. No maintainer message, spend, or deploy from this worker.
