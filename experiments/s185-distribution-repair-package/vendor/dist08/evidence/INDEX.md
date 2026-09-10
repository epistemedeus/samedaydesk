# R2-DISTRIBUTION-08 evidence index (pointers only)

Extends S124 / S131 / **S149** and DISTRIBUTION-03..07 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM. DEMO fixtures are synthetic acquisition↔useful-output join shapes — **no invented buyers, clicks-as-intent, conversion, or payout**. Grexal S149 list price ≠ revenue.

## S149 — Grexal PUBLIC_ACTIVE (marketplace state only)

| Artifact | Absolute path / value |
| --- | --- |
| Receipt | `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json` |
| status | `PUBLIC_ACTIVE` |
| agentId | `j970cajvv6wbrmy64s2f4ajzw18e5j2q` |
| deploymentId | `j570f14047dzpkhc0trh3fnp8s8e43sd` v1 |
| pricing | Version1 `run_completed_usd: 0.02`; `estimate_reserve_usd: 0.025` is **NOT** a charge |
| customerExecutionRevenuePayout | `false` — no customer revenue claimed |
| Agensi (same receipt) | `Free_PendingReview`, installs `0` |

## S124 / S131 — useful-job lineage (not conversion proof)

| Artifact | Absolute path / pin |
| --- | --- |
| S124 package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package` |
| S124 TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |
| S131 TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |
| Note | Self-run / PendingReview lineage — not customer conversion or independence proof |

## DISTRIBUTION-03..07 — prior staging / acquisition / readback / recipes

| Task | RESULT path |
| --- | --- |
| DISTRIBUTION-03 (catalog active_public) | `/workspace/pilot/worktrees/r2-distribution-03-20260910/experiments/scale-r2-20260910/distribution/03/RESULT.md` |
| DISTRIBUTION-04 (acquisition intent links; click≠intent) | `/workspace/pilot/worktrees/r2-distribution-04-20260910/experiments/scale-r2-20260910/distribution/04/RESULT.md` |
| DISTRIBUTION-05 (readback; earnings unavailable) | `/workspace/pilot/worktrees/r2-distribution-05-20260910/experiments/scale-r2-20260910/distribution/05/RESULT.md` |
| DISTRIBUTION-06 (repeat-use recipe) | `/workspace/pilot/worktrees/r2-distribution-06-20260910/experiments/scale-r2-20260910/distribution/06/RESULT.md` |
| DISTRIBUTION-07 (counterparty handoff) | `/workspace/pilot/worktrees/r2-distribution-07-20260910/experiments/scale-r2-20260910/distribution/07/RESULT.md` |

## Semantics enforced by this kit

- Join **only** when `provider` / `sourceTag` / `jobRef` / `sharedEvidenceId` are compatible; else `unjoined[]` with reason
- `causationKnown` defaults **false** unless matching `sharedEvidenceId`
- `customerIndependenceKnown` defaults **false** unless matching `independentCustomerRef`
- `unknowns[]` lists exactly what is unknown (causation, independence, conversion, revenue)
- click/activation ≠ conversion; list pricing ≠ revenue; reject synthetic revenue / buyerIntent
- `unavailable` ≠ `no_users` (unavailable omits counts; no_users sets zeros)
- No Grexal/Agensi login, price, publish, or review re-submit
