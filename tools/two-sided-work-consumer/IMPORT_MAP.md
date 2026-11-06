# Import map

This package does not copy task-bundle-economics, result-reuse, or hosted-wallet-market fee code.

| Step | Owner | Call |
| --- | --- | --- |
| Post, claim, select, deliver, occupancy | `tools/two-sided-work-consumer` | Caller-owned journey receipt. Not a second ledger. |
| Substantive acceptance | `tools/task-bundle-economics/src/evaluate.mjs` `diagnoseFor` | Evidence outcomes stay `meets_criteria`, `refused`, and `needs_review`. Tool acceptance stays `not_decided_by_tool`. `autoAccept` stays false. |
| Effort comparison | `tools/task-bundle-economics` `compareFor` and `cli.mjs compare` | Missing measurements stay `costs_unknown`. |
| 5 percent fee | `tools/task-bundle-economics/src/economics.mjs`, which imports `vendor/hosted-wallet-market/src/fee.mjs` | Applied only when terms already have `feeBps: 500` and `feeBasis: "new_job_gross"`. Direct whole-effort quote uses `quoteEconomics` in a separate process. |
| Hosted market server | `vendor/hosted-wallet-market/src/server.mjs` | Not imported. Claim, funding, and payout remain on that rail. |
| Reusable proof | `tools/result-reuse/src/export.mjs` `exportReuse` and `cli.mjs export` | Public record is built without reward fields before export. Opt-in is required. |
| Retained lock | This package, H128 policy | No automatic unlock. Explicit fencing release only. |

Growth Loops retains `vendor/hosted-wallet-market` and `tools/result-reuse`. `tools/task-bundle-economics` stays the TE package from PR 374 and is not reopened here.
