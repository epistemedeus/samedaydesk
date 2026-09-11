# H04 M01 four-engine composition invocations

Read-only composition worktree: `/tmp/w5-h04/ro-m01` @ `a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e`.

`--out-dir` is always under `/tmp/w5-h04/h04-m01-smoke/<id>` (never the RO tree). `--example` / SAMPLE is **not** a customer job. `page-change-offline-job --example` is a designed refuse.

Catalog + engines live in the RO composition, not the H04 write worktree.

## Shared setup

```bash
RO=/tmp/w5-h04/ro-m01
SMOKE=/tmp/w5-h04/wt/experiments/wave5-heavy/h04/inventory/m01/smoke
OUT=/tmp/w5-h04/h04-m01-smoke
mkdir -p "$SMOKE" "$OUT"
cd "$RO"
node -v
git rev-parse HEAD   # expect a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e
```

## Catalog (`experiments/wave5/m01`)

cwd: `/tmp/w5-h04/ro-m01`

```bash
cd /tmp/w5-h04/ro-m01

node experiments/wave5/m01/bin/catalog.mjs list
node experiments/wave5/m01/bin/catalog.mjs contract

# optional
node experiments/wave5/m01/bin/catalog.mjs describe lockfile-pin-delta
```

## run-job (thin spawn of each engine CLI)

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke

node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before tools/lockfile-pin-delta/fixtures/journey/before.json \
  --after tools/lockfile-pin-delta/fixtures/journey/after.json \
  --out-dir "$OUT/lockfile-pin-delta"

node experiments/wave5/m01/bin/run-job.mjs json-schema-webhook-drift \
  --before tools/json-schema-webhook-drift/fixtures/journey/before.json \
  --after tools/json-schema-webhook-drift/fixtures/journey/after.json \
  --used tools/json-schema-webhook-drift/fixtures/journey/used.json \
  --out-dir "$OUT/json-schema-webhook-drift"

node experiments/wave5/m01/bin/run-job.mjs route-table-diff \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/journey/after.json \
  --out-dir "$OUT/route-table-diff"

node experiments/wave5/m01/bin/run-job.mjs page-change-offline-job \
  --job tools/page-change-offline-job/fixtures/customer-job/job.json \
  --out-dir "$OUT/page-change-offline-job"
```

`run-job.mjs` forwards to `catalog.mjs run`. `--out-dir` is required.

## Direct engine CLIs

cwd: `/tmp/w5-h04/ro-m01`

```bash
cd /tmp/w5-h04/ro-m01
OUT=/tmp/w5-h04/h04-m01-smoke

node tools/lockfile-pin-delta/bin/lockfile-delta.mjs --help
node tools/lockfile-pin-delta/bin/lockfile-delta.mjs \
  --before tools/lockfile-pin-delta/fixtures/journey/before.json \
  --after tools/lockfile-pin-delta/fixtures/journey/after.json \
  --out-dir "$OUT/lockfile-pin-delta-direct"

node tools/json-schema-webhook-drift/bin/webhook-drift.mjs --help
node tools/json-schema-webhook-drift/bin/webhook-drift.mjs \
  --before tools/json-schema-webhook-drift/fixtures/journey/before.json \
  --after tools/json-schema-webhook-drift/fixtures/journey/after.json \
  --used tools/json-schema-webhook-drift/fixtures/journey/used.json \
  --out-dir "$OUT/json-schema-webhook-drift-direct"

node tools/route-table-diff/bin/route-diff.mjs --help
node tools/route-table-diff/bin/route-diff.mjs \
  --before tools/route-table-diff/fixtures/journey/before.json \
  --after tools/route-table-diff/fixtures/journey/after.json \
  --out-dir "$OUT/route-table-diff-direct"

node tools/page-change-offline-job/bin/page-change.mjs --help
node tools/page-change-offline-job/bin/page-change.mjs job \
  --job tools/page-change-offline-job/fixtures/customer-job/job.json \
  --out-dir "$OUT/page-change-offline-job-direct"
```

`--example` notes (SAMPLE, not customer; not required for this inventory smoke):

- lockfile / schema / route: `--example --out-dir DIR` is a labeled SAMPLE success (exit 0). Not a customer brief / published table / customer delta.
- page-change: `--example` **refuses** on **stderr** exit 2 `sample_as_delivered_watch`. Fixture analog is `journey` (still not a customer job).

## Library

From a file that can resolve the RO composition path:

```js
import { runCatalogJob, invokeEngine } from "/tmp/w5-h04/ro-m01/experiments/wave5/m01/index.mjs";

const result = invokeEngine({
  engineId: "lockfile-pin-delta",
  outDir: "/tmp/w5-h04/h04-m01-smoke/lib-lockfile",
  inputs: {
    before: "/tmp/w5-h04/ro-m01/tools/lockfile-pin-delta/fixtures/journey/before.json",
    after: "/tmp/w5-h04/ro-m01/tools/lockfile-pin-delta/fixtures/journey/after.json",
  },
});
// runCatalogJob is an alias of invokeEngine
```

Relative form when cwd is the composition root:

```js
import { runCatalogJob, invokeEngine } from "./experiments/wave5/m01/index.mjs";
```

D01 bind is not a sale. Unpatched `createExecutor` still reports `unknown-job` for these ids. See `experiments/wave5/m01/CONTRACT.md`.

## Observed smoke (this inventory)

Ran 2026-09-11T23:26:18Z, Node `v22.22.2`, cwd `/tmp/w5-h04/ro-m01`. Captures in `inventory/m01/smoke/`. `--example` not run.

| command | exit |
| --- | --- |
| `catalog.mjs list` | 0 |
| `catalog.mjs contract` | 0 |
| four engine `--help` | 0 |
