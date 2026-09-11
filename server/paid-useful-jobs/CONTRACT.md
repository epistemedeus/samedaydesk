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
node server/paid-useful-jobs/bin/cli.mjs run <job-id> [--before …] [--out-dir dir]
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
| `outputs` | Expected artifacts from **this** execution (published to `request.outDir` only when complete) |

`ok: false` with `code` `sample-not-a-sale`, `missing-required-inputs`,
`reserved-fixture-requires-payment`, `unknown-job`, `kit-acquisition-failed`,
`engine-crash`, `engine-timeout`, `missing-output` are truthful refusals, not
sales.

A complete artifact set with analysis `refused` / `informational` can be
`ok: true` (useful no-change or refusal report). Crash, timeout, missing JSON,
and missing expected files are never that.

## Staging

Kit acquisition is inside the executor try path. Inputs are copied into an
isolated work directory; the engine writes to a fresh out directory. Caller
`outDir` is overwritten only with this run's complete expected files.

## Tests

```bash
npm run test:paid-useful-jobs
```
