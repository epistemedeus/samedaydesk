# R2-DISTRIBUTION-05 evidence index (pointers only)

Extends S124 / S131 / **S149** and DISTRIBUTION-01..04 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM. DEMO fixtures mirror observed statuses — **no invented buyers, installs, or payout**.

## S149 — Grexal PUBLIC_ACTIVE (authoritative for current Grexal state)

| Artifact | Absolute path / value |
| --- | --- |
| Receipt | `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json` |
| status | `PUBLIC_ACTIVE` |
| agentId | `j970cajvv6wbrmy64s2f4ajzw18e5j2q` |
| deploymentId | `j570f14047dzpkhc0trh3fnp8s8e43sd` v1 |
| pricing | Version1 `run_completed_usd: 0.02`; `estimate_reserve_usd: 0.025` is **NOT** a charge |
| customerExecutionRevenuePayout | `false` — earnings unavailable |
| Agensi (same receipt) | `Free_PendingReview`, installs `0` |

## DISTRIBUTION-01 — Grexal staging

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `124adde1018efdaa36674ca2d9481e1c4431e167` on `codex/r2-distribution-01-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/RESULT.md` |

## DISTRIBUTION-02 — Agensi handoff

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `20c7cd2de82bc4e675a1ed99b9b59668568d5ec8` on `codex/r2-distribution-02-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/RESULT.md` |

## DISTRIBUTION-03 — Portable package catalog

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `cba09f90df37ed794042c3a019d2b3ad96d89041` on `codex/r2-distribution-03-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-03-20260910/experiments/scale-r2-20260910/distribution/03/RESULT.md` |
| Note | Catalog may still say draft_private for Grexal — **superseded by S149 PUBLIC_ACTIVE** for readback |

## DISTRIBUTION-04 — Acquisition intent links

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `af3b194c` on `codex/r2-distribution-04-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-04-20260910/experiments/scale-r2-20260910/distribution/04/RESULT.md` |

## Grexal S124 (historical self-runs — do not mutate)

| Artifact | Absolute path / pin |
| --- | --- |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |
| Preserve tip | `53dbb7adde7dfe89f4dc1fb5efe380389b4e420d` |
| Note | Free self-runs observed on prior draft; current listing state is S149 PUBLIC_ACTIVE |

## Agensi S131 (preserve — do not mutate)

| Artifact | Absolute path / pin |
| --- | --- |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |
| Product tip | `8d677a68e320cc34050d533613530d3397cae630` on `codex/s131-agensi-polish-20260910` |
| Note | PendingReview; Root owns next; S149 confirms 0 installs |

## Semantics enforced by this kit

- Grexal+Agensi only (other marketplaces rejected)
- `synthetic:true` earnings / earnings without `evidenceRef` rejected
- List pricing (`pricingObserved.run_completed_usd`) ≠ earnings/payout
- `unavailable` ≠ `no_users` (unavailable omits installCount/runCount; no_users sets them to 0)
- Missing earnings → `unavailable` (not $0 revenue)
- No Grexal/Agensi login, price, publish, or review re-submit
