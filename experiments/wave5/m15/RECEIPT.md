# RECEIPT. W5-M15 schema-change real-project trial

Repo: `epistemedeus/samedaydesk`
Branch: `cursor/w5-m15-reproducible-schema-change-real-project-trial-6e66`
Head: `751ae77f73700decb8c2bef4e70d276239172e2b`
Starting ref: `fable/f08-paid-wrappers` `aeef964fa188443078958d9d6d393afae1d542ee`
Compare: https://github.com/epistemedeus/samedaydesk/compare/fable/f08-paid-wrappers...cursor/w5-m15-reproducible-schema-change-real-project-trial-6e66
Owned path: `experiments/wave5/m15/`
Integration owner: W5-M01

Tested engine: W4-commerce-10 / W5-M02 `94c7bfdfeaa99f5e70f341504df3051cc7717f91` (`tools/json-schema-webhook-drift/`, PR 59). Staged with `git archive`. Not copied into this owned path.

Node `v22.14.0`. Postgres not applicable (engine has no store).

## Commands and counts

```bash
node --test --test-concurrency=1 experiments/wave5/m15/test/*.test.mjs
```

**19 pass, 0 fail, 0 skip.**

```bash
node experiments/wave5/m15/bin/schema-change-trial.mjs \
  --pair schemastore-package-sideEffects \
  --out-dir "$OUT"
```

Stdout: `ok=true` `kind=analysis` `analysisStatus=actionable` `breaking=1` `unknown=0` `customerBrief=false` `maintainerUsefulness=unknown` on engine SHA `94c7bfdfeaa99f5e70f341504df3051cc7717f91`. Brief lists `/properties/sideEffects` `type-change` boolean to untyped `oneOf`. `/properties/name` unchanged. Unused SchemaStore fields ignored.

SDS owner pair `sds-verified-feed`: `analysis` / `actionable`, `/properties/qa` `deleted` / `present-before-only`.

## Current-source findings (M02 at the pin)

These are actual CLI results, not hoped-for M02 amendments.

| Witness | Current M02 class |
| --- | --- |
| SchemaStore `sideEffects` boolean to `oneOf` boolean\|array | `breaking` `type-change` |
| JSON Schema `false` at a used property | `breaking` `structural-change` |
| `$ref` plus sibling `type` | informational, sibling ignored |
| `/required` item add | informational (array fingerprint is type-only) |
| empty-pointer root required add | `breaking` `structural-change` |
| integer `minimum` 0 to 10 | `breaking` `structural-change` |
| fractional `minimum` 0.5 to 1.5 | informational (integers only) |
| unlike `$schema` dialects, same used type | informational; `termsVersion` hashes differ; kit does not force them equal |
| OpenAPI documents | refused `not-this-job-openapi` (analysis, not engine-failure) |
| identical before/after | informational (valid no-change) |

## Remaining bindings

- W5-M06 corpus not exported. Interim synthetic witnesses are in `fixtures/corpus/`.
- W5-D24 published install not exported. Isolation is git-archive staging.
- Field F. Maintainer usefulness unknown. No message, spend, or deploy from this worker.
- Catalog / F08 wrap not bound. This job is not `api-upgrade-brief`.

Exact remaining live steps: `LIVE-STEPS.md`.
