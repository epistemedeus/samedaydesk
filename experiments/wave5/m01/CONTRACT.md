# W5-M01 job catalog contract

**Catalog schema:** `samedaydesk.wave5.m01.engine-catalog.v1`  
**Job contract export:** `samedaydesk.wave5.m01.job-catalog.v1`  
**D01 execution contract (read-only):** `samedaydesk.paid-useful-jobs.execution.v1` at `6bed72dd22a396134aa5c957933b42c3a5746698`

This package executes the four imported engine CLIs. It does not copy their compare kernels and does not write `server/paid-useful-jobs/` or root `package.json`.

## Consumer

```bash
node experiments/wave5/m01/bin/run-job.mjs lockfile-pin-delta \
  --before tools/lockfile-pin-delta/fixtures/journey/before.json \
  --after tools/lockfile-pin-delta/fixtures/journey/after.json \
  --out-dir "$OUT"

node experiments/wave5/m01/bin/catalog.mjs contract
node --test --test-concurrency=1 experiments/wave5/m01/test/*.test.mjs
```

Library: `runCatalogJob` / `invokeEngine` from `experiments/wave5/m01/index.mjs`.

## Outcome mapping

| Kind | Meaning |
| --- | --- |
| `analysis` | Engine exit 0, stdout `ok:true`, promised files exist. No-change, permutation, compatible weakening, stale freshness, and incomplete-but-honest page walks stay here. |
| `refused` | Valid product refusal on the catalogued stream (stdout for lock/schema/route, stderr for page-change). |
| `incomplete-delivery` | Transport looked successful but a promised output file is missing. |
| `transport-failure` | Crash, missing binary, or non-JSON. Not a domain verdict. |

Unlike hashes are not forced equal. Route permutation now has equal `digest.v2`. Schema `termsVersion` stays the I01 content hash of the brief.

## First offer

`lockfile-pin-delta` from independent M07 cases on this tree: 20/20 domain match, constant hasher cannot hide integrity, unsupported formats refuse.

## D01 bind (exact small change)

Unpatched D01 `createExecutor` injects `acquireKit` and `runEngine` only. `getJob` and `materializeInputs` always load the PR51 six-job catalog, so `lockfile-pin-delta` is `unknown-job` before `runEngine` runs.

Required in D01 (not applied here):

`server/paid-useful-jobs/lib/wrapper.mjs` inside `createExecutor`:

```js
const resolveJob = deps.getJob || getJob;
// ...
job = resolveJob(jobId);
const materialized = materializeInputs(jobId, request, join(work, "inputs"), { getJob: resolveJob });
```

`server/paid-useful-jobs/lib/input-guard.mjs`:

```js
export function materializeInputs(jobId, request, workDir, deps = {}) {
  const job = (deps.getJob || getJob)(jobId);
```

Then D01 can select these engines:

```js
import { createExecutor, getJob } from "./index.mjs";
import {
  createM01AwareGetJob,
  runEngineForD01,
} from "../../../experiments/wave5/m01/lib/d01-adapter.mjs";
import { MODULE_ROOT } from "../../../experiments/wave5/m01/lib/paths.mjs";

export const runPaidOffer = createExecutor({
  getJob: createM01AwareGetJob(getJob),
  runEngine: runEngineForD01,
  acquireKit: () => MODULE_ROOT,
});
```

Optional: if `analysis.outcome === "refused"`, return the engine refuse code instead of `missing-output` when promised files were never written.

Until that lands, consume `runCatalogPaidOffer` from this directory. That is not an already-integrated sale. `sold` stays false.
