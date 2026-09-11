# Feature map — W5-M20 first-use readout

Own directory: `experiments/wave5/m20/` only.

## Preflight (this checkout)

| Looked for | Result |
| --- | --- |
| SDS PR52 `aeef964fa188443078958d9d6d393afae1d542ee` | Attached. `runPaidOffer` is the tested export. `createExecutor` is not on this checkout. |
| W4-commerce-16 run buyerClass | Closed set consumed. Ledger source not copied. |
| W4-commerce-03 binder | Repeat-job owner. Not copied. |
| W5-D01 execution.v1 | Read-only worktree. Remaining integration binding. |
| D27, M15-M19 receipts | Absent. Recorded as sibling-pending, not customer no-reply. |
| Homepages / root package.json / `server/pricing.js` | Not edited. |

## User goals

| User goal | Entrypoint | Command | State | Tests | Account |
| --- | --- | --- | --- | --- | --- |
| Classify labelled observations | `bin/readout.mjs classify` | `--in fixtures/observations` | four use classes plus sibling-pending | `test/classify.test.mjs` | None |
| Owner-qa dry run against PR52 | `dry-run` | `--buyer-class owner-qa --out-dir` | useful-use, failed-use, no-reply, no paid-return | `test/wrapper-dry-run.test.mjs` | None |
| One next-offer adjustment | `lib/next-offer.mjs` | same | exactly one `nextAdjustment` | `test/next-offer.test.mjs` | None |
| Loopback HTTP | `bin/serve.mjs` | `GET /health` `POST /readout` | contract JSON | `test/http.test.mjs` | None |
| Unlike terms stay unlike | `terms` | `--left --right --force-equal` | `unlike_terms_forced_equal` | `test/terms.test.mjs` | None |

## Later binding

M01 re-runs this kit against D01 `samedaydesk.paid-useful-jobs.execution.v1` and against real D27/M15-M19 receipts. This result does not claim those siblings' behavior.
