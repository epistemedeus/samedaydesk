# S171 — 6Pro S165 residual dispositions

Base: `9c3d000f7f896ab46d88a64a0b46914598c0190a`  
Branch: `codex/r2-exchange-s171-final-20260910`

NL-EXCHANGE-03 parked at `9599dcfa570931363791eb20730380f2fe174c9b` (`docs/CHECKPOINT-S171.md`).

| # | Reproduced? | Fix |
|---|---|---|
| 1 | Yes — `ok:true` with foreign/empty lifecycle `proposal_pending` | Require `lifecycleCompatible`: completed + bound task/proposal + applied accepted result. `ok` no longer OR `lifecycleMayComplete`. |
| 2 | Yes — reject ignored with zero subjective; accept without revision | Reject first; accept requires matching `artifactSha256` **and** `revisionSha256`; no silent auto-accept. |
| 3 | Yes — under-reported `byteLength` admitted; foreign contract unchecked | Coerce encoded JSON bytes; stop on foreign `fileSetContract.taskId`; fulfillment requires `admission.status === admitted`. |
| 4 | Yes — outcome-only receipt match | Receipt v2: match inputFingerprint + version + task/proposal/agreement identities. CLI `run` uses `Date.now()`; `--clock` for demos. |
| 5 | Yes — second resubmit after withdraw revived active; foreign resultId poisoned dedup | Terminal withdrawal sticky; identity disposition before dedup; dedup key `proposalId::resultId`. |
| 6 | Yes — inspect shared nested deliverable | `inspectAgainstBrief` deep-clones deliverable/proposal/boundBrief snapshots. |
| 7 | Yes — imported_unverified → `none_needed` | Status `needs_verification`; clear acceptedParts unless artifact recomputed. |

E2E preserved: fail→correction→readmit→needs_review→bound accept→compatible completion→fresh-process receipt.  
No escrow/payment/publication.
