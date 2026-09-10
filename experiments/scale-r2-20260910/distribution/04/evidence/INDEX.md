# R2-DISTRIBUTION-04 evidence index (pointers only)

Extends S124 / S131 and DISTRIBUTION-01 / 02 / 03 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM. Synthetic acquisition fixtures only — **no live clicks or buyers invented**.

## DISTRIBUTION-01 — Grexal staging

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `124adde1018efdaa36674ca2d9481e1c4431e167` on `codex/r2-distribution-01-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/RESULT.md` |
| S124 evidence | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/evidence/S124-INDEX.md` |

## DISTRIBUTION-02 — Agensi handoff

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `20c7cd2de82bc4e675a1ed99b9b59668568d5ec8` on `codex/r2-distribution-02-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/RESULT.md` |
| S131 evidence | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/evidence/S131-INDEX.md` |

## DISTRIBUTION-03 — Portable package catalog

| Artifact | Absolute path / pin |
| --- | --- |
| Worktree tip | `cba09f90df37ed794042c3a019d2b3ad96d89041` on `codex/r2-distribution-03-20260910` |
| RESULT | `/workspace/pilot/worktrees/r2-distribution-03-20260910/experiments/scale-r2-20260910/distribution/03/RESULT.md` |
| Evidence INDEX | `/workspace/pilot/worktrees/r2-distribution-03-20260910/experiments/scale-r2-20260910/distribution/03/evidence/INDEX.md` |
| Grexal availability (catalog) | `draft_private` |
| Agensi availability (catalog) | `pending_review` |

## Grexal S124 (preserve — do not mutate)

| Artifact | Absolute path / pin |
| --- | --- |
| Preserve package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package` |
| Preserve tip | `53dbb7adde7dfe89f4dc1fb5efe380389b4e420d` on `codex/s124-market-packages-final-20260910` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |

## Agensi S131 (preserve — do not mutate)

| Artifact | Absolute path / pin |
| --- | --- |
| Polished package | `/workspace/pilot/tmp/s131-agensi-polish-0910/repo/experiments/s109-marketplace-entry-trials/surfaces/agensi/package/` |
| Preserve package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/agensi/package` |
| Product tip | `8d677a68e320cc34050d533613530d3397cae630` on `codex/s131-agensi-polish-20260910` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |

## Semantics enforced by this kit

- Click / `linkActivated` ≠ buyer intent / purchase intent (forbidden fields rejected)
- `unavailable` ≠ `no_users` (unavailable omits `activationCount`; no_users sets it to 0)
- No Grexal/Agensi login, price, publish, or review re-submit
- No invented live traffic or buyers — synthetic fixtures for tests/demo only
