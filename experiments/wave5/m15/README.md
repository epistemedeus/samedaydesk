# How to run the W5-M15 schema-change trial

This kit runs the pinned M02 used-path drift CLI on a permitted real JSON Schema pair. It does not reimplement the engine. It does not send the brief to a maintainer.

## Prerequisites

1. Node 22 (`node --version`).
2. A samedaydesk git checkout that can `git archive` SHA `94c7bfdfeaa99f5e70f341504df3051cc7717f91`, or `M15_ENGINE_ROOT` set to a staged copy of `tools/json-schema-webhook-drift`.

If the engine cannot be staged, the CLI exits 2 with `incomplete: true`. That is not a passed skip.

## Run the SchemaStore pair

From the repository root:

```bash
node experiments/wave5/m15/bin/schema-change-trial.mjs \
  --pair schemastore-package-sideEffects \
  --out-dir /tmp/m15-schemastore
```

Read `/tmp/m15-schemastore/schemastore-package-sideEffects/drift-brief.md` and `trial-report.json`.

`outcome.kind` is `analysis` when the engine ran. `maintainerUsefulness` stays `unknown`.

## Run the owner SDS pair

```bash
node experiments/wave5/m15/bin/schema-change-trial.mjs \
  --pair sds-verified-feed \
  --out-dir /tmp/m15-sds
```

## Replay the interim corpus

```bash
node experiments/wave5/m15/bin/schema-change-trial.mjs --corpus --out-dir /tmp/m15-corpus
```

Informational rows are valid analysis of the current engine. They are not crashes.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m15/test/*.test.mjs
```

Equivalent: `npm test` from `experiments/wave5/m15`.

## Remaining live steps

See `LIVE-STEPS.md`. This worker does not message maintainers or spend.
