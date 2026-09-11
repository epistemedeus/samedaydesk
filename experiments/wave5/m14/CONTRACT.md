# W5-M14 preview contract

**Version:** `samedaydesk.wave5.m14.result-preview.v1`

Thin consumer of SDS PR52 `runPaidOffer` / `bin/cli.mjs`. Default stdout is JSON.
This package does not own the wrapper kernel, catalog, or a clean-env package.

## Commands

```bash
node experiments/wave5/m14/bin/preview.mjs quickstart
node experiments/wave5/m14/bin/preview.mjs choose --files <path> [path...]
node experiments/wave5/m14/bin/preview.mjs choose --job <job-id>
node experiments/wave5/m14/bin/preview.mjs preview --job <job-id> [--before …] [--format text]
```

Exit 0 means a useful delivered analysis (including no-change, partial, and refused artifacts) or a successful choose/quickstart. Exit 2 means wrapper refuse, transport/engine failure, incomplete delivery, or choose could not recommend a job.

## Fields

| Field | Meaning |
| --- | --- |
| `layer` | `useful-delivery` \| `wrapper-refuse` \| `engine-failure` \| `transport-failure` \| `incomplete-delivery` |
| `transport` | Process/kit lifecycle. Not analysis usefulness. |
| `analysis` | Domain status from engine JSON when the process produced JSON. |
| `delivery` | Expected artifact names present from this run. |
| `payment` | `fundingState`, `sold` (always false here), `sample`. |
| `hashes` | `engineDigest`, `inputsDigest`, `outputsDigest`, `firstOutputSha256` stay distinct when their values differ. |

On SDS52, `transport` / `analysis` / `delivery` are derived by this consumer. If a later D01 result already carries `samedaydesk.paid-useful-jobs.execution.v1` fields, those kernel fields are used. This kit does not claim untested D01 behavior.
