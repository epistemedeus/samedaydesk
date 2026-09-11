# W5-M20 readout contract

**Version:** `samedaydesk.wave5.m20.readout.v1`

Thin consumer of SDS PR52 `runPaidOffer`. Not a second wrapper, ledger, or
binder. Pin this version string and the git SHA you tested.

## Invoke

```bash
node experiments/wave5/m20/bin/readout.mjs status
node experiments/wave5/m20/bin/readout.mjs classify --in <file-or-dir>
node experiments/wave5/m20/bin/readout.mjs dry-run --buyer-class owner-qa --out-dir /tmp/m20
node experiments/wave5/m20/bin/serve.mjs --host 127.0.0.1 --port 0
```

```js
import { classifyCohort } from "./lib/cohort.mjs";
import { runDryRun } from "./lib/dry-run.mjs";
```

Loopback HTTP:

- `GET /health` and `GET /contract` return this version string
- `POST /readout` JSON `{ observations }` returns the same body as `classify`
- `POST /dry-run` JSON `{ buyerClass }` runs the owner-labelled wrapper dry run
- HTTP 200 for contract JSON including `ok: false`. 400 only for invalid JSON.

## Result fields

Transport, analysis, delivery, and payment stay separate. Wrapper `ok` is
not usefulness. `sold` from PR52 is always false and is not paid return.

| Field | Closed set |
| --- | --- |
| `useClass` | `no-reply` \| `failed-use` \| `useful-use` \| `paid-return` |
| `siblingStatus` | `pending` \| `present` \| `not-scanned` (not a use class) |
| `actorClass` / run `buyerClass` | `owner-qa` \| `fixture-buyer` \| `unknown` |
| `transport` | `ok` \| `rejected` \| `acquisition-failed` \| `engine-crash` \| `timeout` \| `internal-error` \| `not-observed` |
| `analysis.outcome` | `not-run` \| `completed` \| `refused` \| `informational` \| `partial` \| `actionable` \| `crashed` |
| `delivery.status` | `complete` \| `incomplete` \| `not-attempted` |
| `payment.state` | `none` \| `reserved-fixture` \| `rejected` \| `settled` |

`paid-return` needs a later job for the same `callerKey` plus an exact
settlement `operationId` join for that job. Fixture funding, SAMPLE,
`early-x402-revenue`, and 8.105 USDC cannot satisfy it.

Valid engine refusal or no-change with JSON is `useful-use`, not a crash.
Process crash, timeout, missing JSON, and missing expected outputs after a
claimed success are `failed-use`. A presented offer with no later observation
in the window is `no-reply`. Absent D27/M15-M19 files are `sibling-pending`,
not customer no-reply.

`nextAdjustment` is exactly one concrete change to the next offer, with
evidence ids. It is not demand, revenue, or a customer quote.

## Tests

```bash
node --test --test-concurrency=1 experiments/wave5/m20/test/*.test.mjs
```
