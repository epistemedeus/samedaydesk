# R2-DISTRIBUTION-06 evidence index (pointers only)

Extends S124 / S131 / **S149** and DISTRIBUTION-01..05 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM. DEMO fixtures mirror observed statuses — **no invented buyers, installs, or payout**. Opt-in reuse only; no unsolicited broadcast.

## S149 — Grexal PUBLIC_ACTIVE (marketplace surface for the useful job)

| Artifact | Absolute path / value |
| --- | --- |
| Receipt | `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json` |
| status | `PUBLIC_ACTIVE` |
| agentId | `j970cajvv6wbrmy64s2f4ajzw18e5j2q` |
| deploymentId | `j570f14047dzpkhc0trh3fnp8s8e43sd` v1 |
| pricing | Version1 `run_completed_usd: 0.02`; `estimate_reserve_usd: 0.025` is **NOT** a charge |
| customerExecutionRevenuePayout | `false` — no customer revenue claimed |
| Agensi (same receipt) | `Free_PendingReview`, installs `0` |

## S124 — Grexal source-change evidence pack (useful job)

| Artifact | Absolute path / pin |
| --- | --- |
| Package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package` |
| Package README | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package/README.md` |
| Preserve tip | `53dbb7adde7dfe89f4dc1fb5efe380389b4e420d` on `codex/s124-market-packages-final-20260910` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |
| Useful job | `samedaydesk-source-change-evidence` / `source_change_evidence_pack` |
| Note | After-delivery continuation reuses documented `pack_evidence` commands under opt-in only |

## Agensi S131 — provenance compare alternate useful job

| Artifact | Absolute path / pin |
| --- | --- |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |
| Package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/agensi/package` |
| Product tip | `8d677a68e320cc34050d533613530d3397cae630` on `codex/s131-agensi-polish-20260910` |
| Note | PendingReview; Root owns next; S149 confirms 0 installs |

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
| Note | Catalog may still say draft_private for Grexal — **superseded by S149 PUBLIC_ACTIVE** for marketplace surface |

## DISTRIBUTION-04 — Acquisition intent links

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `af3b194c` on `codex/r2-distribution-04-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-04-20260910/experiments/scale-r2-20260910/distribution/04/RESULT.md` |

## DISTRIBUTION-05 — Marketplace readback collector

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `45cccda3` on `codex/r2-distribution-05-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-05-20260910/experiments/scale-r2-20260910/distribution/05/RESULT.md` |

## Semantics enforced by this kit

- `reusePolicy.optInRequired === true` (reject `false`)
- `reusePolicy.broadcast === false` (reject `true` and broadcastAudience/blastList/…)
- `jobRef.kind` must be a concrete useful job with evidence/source path (reject `version_alert`)
- Missing opt-in / jobRef → `blocked_missing_input`
- `unavailable` ≠ `no_users` (unavailable omits priorDeliveryCount; no_users sets it to 0)
- No Grexal/Agensi login, price, publish, or review re-submit
- S149 list pricing ≠ customer revenue/payout
