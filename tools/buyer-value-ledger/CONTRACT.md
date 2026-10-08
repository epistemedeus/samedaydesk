# buyer-value-ledger contract (W5-D13)

Public entry: `node bin/value.mjs` and `lib/index.mjs`.

## Commands

- `run <jobId> --buyer-class owner-qa|fixture-buyer|unknown` then `--example` or caller files
- `show --ledger <file>`
- `revenue` (always refuses treating settlements/banked USDC as this job)
- `status`

## Result fields that matter

| Field | Meaning |
| --- | --- |
| `ok` | Analysis completed (success, no-change, or valid refusal). Not transport/engine crash. |
| `refused` | Valid analysis refusal, not a crash. |
| `outcomeKind` | `analysis_success` / `analysis_no_change` / `analysis_refusal` / `engine_failure` / `transport_failure` |
| `usefulDelivery` | This run produced digested catalog outputs for an analysis outcome. |
| `usefulPaidWork` | True only if useful delivery, settlement bound to this job, and live purchase authority. This prototype never sets it. |
| `settlementJoin.boundToThisJob` | Exact `operationId` **and** settlement `jobId` match. Evidence-records fixtures have no jobId. |
| `row.outputs[].sha256` | SHA-256 of delivered bytes. Byte counts alone are not identity. |

## Current runtime pin tested by this package

- useful-jobs 1.0.0 archive from this checkout (default spawn)
- Optional D01 wrapper: `epistemedeus/samedaydesk@aeef964fa188443078958d9d6d393afae1d542ee` `server/paid-useful-jobs/index.mjs` via `BUYER_VALUE_LEDGER_D01_ROOT`
- Remaining binding: W5-D01 owns later wrapper amendments. This ledger does not copy that kernel.

Do not require request-hash equality with evidence-records settlement documents.
