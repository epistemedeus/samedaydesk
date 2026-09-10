# R2-DISTRIBUTION-07 evidence index (pointers only)

Extends S124 / S131 / **S149** and DISTRIBUTION-01..06 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM. DEMO fixtures are synthetic request shapes — **no invented buyers, installs, or payout**. Kill when requester already has a fix. Grexal S149 cited as deliverable artifact type (list price ≠ revenue).

## S149 — Grexal PUBLIC_ACTIVE (deliverable artifact surface)

| Artifact | Absolute path / value |
| --- | --- |
| Receipt | `/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json` |
| status | `PUBLIC_ACTIVE` |
| agentId | `j970cajvv6wbrmy64s2f4ajzw18e5j2q` |
| deploymentId | `j570f14047dzpkhc0trh3fnp8s8e43sd` v1 |
| pricing | Version1 `run_completed_usd: 0.02`; `estimate_reserve_usd: 0.025` is **NOT** a charge |
| customerExecutionRevenuePayout | `false` — no customer revenue claimed |
| Agensi (same receipt) | `Free_PendingReview`, installs `0` |

## S124 — Grexal source-change evidence pack (executable artifact)

| Artifact | Absolute path / pin |
| --- | --- |
| Package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package` |
| Package README | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package/README.md` |
| Preserve tip | `53dbb7adde7dfe89f4dc1fb5efe380389b4e420d` on `codex/s124-market-packages-final-20260910` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |
| Useful job / artifact type | `samedaydesk-source-change-evidence` / `source_change_evidence_pack` |
| Note | Counterparty handoff runCommands quote local `npm test` / `pack_evidence` / `validate-manifest` — no provider login |

## Agensi S131 — PendingReview (not the DIST-07 deliverable)

| Artifact | Absolute path / pin |
| --- | --- |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |
| Package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/agensi/package` |
| Note | PendingReview; 0 installs; Root owns next — not claimed as DIST-07 revenue |

## DISTRIBUTION-01..06 — prior staging / recipes

| Task | RESULT path |
| --- | --- |
| DISTRIBUTION-01 | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/RESULT.md` |
| DISTRIBUTION-02 | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/RESULT.md` |
| DISTRIBUTION-03 | `/workspace/pilot/worktrees/r2-distribution-03-20260910/experiments/scale-r2-20260910/distribution/03/RESULT.md` |
| DISTRIBUTION-04 | `/workspace/pilot/worktrees/r2-distribution-04-20260910/experiments/scale-r2-20260910/distribution/04/RESULT.md` |
| DISTRIBUTION-05 | `/workspace/pilot/worktrees/r2-distribution-05-20260910/experiments/scale-r2-20260910/distribution/05/RESULT.md` |
| DISTRIBUTION-06 | `/workspace/pilot/worktrees/r2-distribution-06-20260910/experiments/scale-r2-20260910/distribution/06/RESULT.md` |

## Semantics enforced by this kit

- `requesterAlreadyHasFix===true` OR `unresolved===false` with fixEvidence → `killed_requester_has_fix` (empty `runCommands[]`)
- Unresolved verified request without fix → `ready_handoff` with `{ artifactRef, runCommands[], acceptanceChecks[], privacyBounds }`
- Missing requestId/requesterId/problemSummary → `blocked_missing_input`
- `unavailable` ≠ `no_users` (unavailable omits requesterCount; no_users sets it to 0)
- Reject invented revenue / broadcast / buyer fields
- No Grexal/Agensi login, price, publish, or review re-submit
- S149 list pricing 0.02 ≠ customer revenue/payout
