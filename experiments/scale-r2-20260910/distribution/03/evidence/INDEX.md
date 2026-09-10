# R2-DISTRIBUTION-03 evidence index (pointers only)

Extends S124 / S131 and DISTRIBUTION-01 / 02 RESULT paths. Does **not** duplicate reporting stacks. Absolute paths on this VM.

## Grexal S124 (source-change evidence)

| Artifact | Absolute path / pin |
| --- | --- |
| Preserve package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package` |
| Preserve tip | `53dbb7adde7dfe89f4dc1fb5efe380389b4e420d` on `codex/s124-market-packages-final-20260910` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/runtime/TERMINAL.md` |
| local npm 33/33 | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/receipts/local-npm-test-after-restore.txt` |
| validate | `/workspace/pilot/receipts/scale-bot-0909/bot-s124-activation-0910/receipts/validate.txt` |
| DISTRIBUTION-01 RESULT | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/RESULT.md` |
| DISTRIBUTION-01 tip | `124adde1018efdaa36674ca2d9481e1c4431e167` on `codex/r2-distribution-01-20260910` |
| DISTRIBUTION-01 evidence | `/workspace/pilot/worktrees/r2-distribution-01-20260910/experiments/scale-r2-20260910/distribution/01/evidence/S124-INDEX.md` |

Draft state (from S124 TERMINAL): status=`draft`, visibility=`private`, pricing=`unset`, deployment v1. Public listing **not** observed → catalog `draft_private`.

## Agensi S131 (offline Free skill)

| Artifact | Absolute path / pin |
| --- | --- |
| Polished package | `/workspace/pilot/tmp/s131-agensi-polish-0910/repo/experiments/s109-marketplace-entry-trials/surfaces/agensi/package/` |
| Preserve package | `/workspace/pilot/tmp/s124-root-0910.dYRsYW/agensi/package` |
| Product tip | `8d677a68e320cc34050d533613530d3397cae630` on `codex/s131-agensi-polish-20260910` |
| ZIP sha256 | `7d27bdec35d16e0faf62909e14e0e65a4dcece758aaf50d3c2c3dace7bbcfbeb` |
| TERMINAL | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/TERMINAL.md` |
| DEMO | `/workspace/pilot/receipts/scale-bot-0909/bot-s131-polish-0910/task-exchange/DEMO.md` |
| DISTRIBUTION-02 RESULT | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/RESULT.md` |
| DISTRIBUTION-02 tip | `20c7cd2de82bc4e675a1ed99b9b59668568d5ec8` on `codex/r2-distribution-02-20260910` |
| DISTRIBUTION-02 evidence | `/workspace/pilot/worktrees/r2-distribution-02-20260910/experiments/scale-r2-20260910/distribution/02/evidence/S131-INDEX.md` |

Provider review: **PendingReview** (Root owns next). Local Free skill use needs **no account**. Public accepted listing **not** observed → catalog `pending_review`.

## Semantics

- `unavailable` ≠ `no_users` (same as DISTRIBUTION-01/02)
- No Grexal/Agensi login, price, publish, or review re-submit from this kit
- No package rebuild — cite existing pins/paths only
