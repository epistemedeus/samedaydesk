# Paid useful-jobs execution contract

**Version:** `samedaydesk.paid-useful-jobs.execution.v1`

One kernel: `createExecutor` / `runPaidOffer` in `lib/wrapper.mjs`. CLI
(`bin/cli.mjs`) and local HTTP (`lib/http.mjs`, `bin/serve-execution.mjs`)
are thin consumers. This is not a live deploy. D08 owns the Python client.
D14 owns an independent HTTP consumer. D04 must drop any competing runner
and call this contract.

Pin this version string and the git SHA you tested. Do not assume a later
sibling's behavior.

## Invoke

```js
import {
  EXECUTION_CONTRACT_VERSION,
  createExecutor,
  runPaidOffer,
  createExecutionServer,
  listenExecutionServer,
} from "./index.mjs";
```

CLI (repo root):

```bash
node server/paid-useful-jobs/bin/cli.mjs run lockfile-pin-delta [--before …] [--out-dir dir]
```

Local HTTP (loopback only):

- `GET /health` → `{ ok, contract }`
- `POST /execute` JSON body → execution result plus `retrieval.{id,path}`
- `GET /results/:id` → stored result for that `executionId`
- HTTP 200 for contract JSON (including `ok: false`); 400 only for invalid JSON body

## Result fields

| Field | Meaning |
| --- | --- |
| `ok` | Transport `ok` **and** delivery `complete`. Not “analysis found no issues”. |
| `sold` | Always `false`. Live settlement is out of scope. |
| `fundingState` | `unfunded` \| `reserved-fixture` \| `rejected` |
| `transport` | `ok` \| `rejected` \| `acquisition-failed` \| `engine-crash` \| `timeout` \| `internal-error` |
| `analysis` | Domain report (`completed`, `refused`, `informational`, `partial`, `not-run`, …) |
| `delivery` | `{ status, complete, expected, present, missing }` from **this run's** isolated out dir |
| `sample` / `sampleReasons` | SAMPLE / `--example` / kit SAMPLE provenance |
| `executionId` | Retrieval id for the HTTP adapter |
| `outputs` | Expected artifacts from **this** execution's isolated out dir (`runOutDir`). Caller `outDir` may receive a copy when complete; receipts do not re-hash that alias. |

`ok: false` with `code` `sample-not-a-sale`, `missing-required-inputs`,
`reserved-fixture-requires-payment`, `unknown-job`, `kit-acquisition-failed`,
`engine-crash`, `engine-timeout`, `missing-output`, `input-schema-mismatch` are
truthful refusals, not sales.

A complete artifact set with analysis `refused` / `informational` can be
`ok: true` (useful no-change or refusal report). Crash, timeout, missing JSON,
and missing expected files are never that.

## Staging

Kit acquisition is inside the executor try path. Caller getters are evaluated
once (`freezeRequest`). File bytes are copied into an isolated work directory
**before** `inspectSample` and the engine; inspect reads staged content (kit
provenance still uses the original source path). The engine writes to a
fresh out directory. `outputs` and `receipt.outputsDigest` are those isolated
bytes. Caller `outDir` is a published copy of a complete run, not the identity
of delivery. Two executions may share a publication path; each receipt still
describes its own `runOutDir`. Receipt JSON is written into `runOutDir`.

Positive schema validation runs at this service entry (`lib/input-schema.mjs`)
after staging. Syntax-only `JSON.parse` is not enough: vendor-budget-impact
requires a `rows` array of `{field, value, unit}` objects. Preflight may refuse
the same bytes first; the kernel still refuses them if they arrive here.

`createExecutor({ catalog })` or `createExecutor({ getJob })` is the catalog
injection seam. The default executor overlays the four selected engines
(`lockfile-pin-delta`, `json-schema-webhook-drift`, `route-table-diff`,
`page-change-offline-job`) via `createM01AwareGetJob` and `runEngineForD01`.
Published useful-jobs stay on `getJob` + the useful-jobs archive CLI.

## Delivery composition

```bash
node server/paid-useful-jobs/bin/deliver.mjs \
  --job lockfile-pin-delta \
  --before "$BEFORE_LOCKFILE" \
  --after "$AFTER_LOCKFILE"
```

Accepted lockfile inputs: npm `package-lock.json` lockfileVersion 2 or 3.
Not yarn/pnpm/bun/HTML/package.json-only. That path is preflight →
managed-order → executor → `verifyComplete(runOutDir)` → mailbox pickup/ack.
`--second-after` runs a disjoint second job. `--http` mounts loopback
`POST /execute` for the order client.

## Tests

```bash
npm run test:paid-useful-jobs
npm run test:job-input-preflight
npm run test:job-output-atomicity
npm run test:managed-useful-jobs-order
npm run test:result-mailbox
npm run test:d28-journey
npm run test:m01-catalog
```
