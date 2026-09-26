# S151 / BOT-S159 finding dispositions

Branch: `codex/r2-exchange-s151-amend-20260910` (from `2ee4cbc` s152/s155 integration).  
Review pin preserved: `17236cd` on `codex/r2-exchange-08-20260910`.

| ID | Pri | Disposition | Where |
|---|---|---|---|
| F1 | P1 | **Fixed.** Journey outcome gate: `needs_amendment` / `needs_review` / `accepted` / `stopped`. Lifecycle `result_submitted` only when outcome allows completion. Corrected artifact re-admitted with actual byte lengths before re-attach. No fabricated `completed`. | `08/src/journey.mjs`, `08/src/outcome.mjs` |
| F2 | P1 | **Fixed.** Deep-clone bound brief/proposal/artifact; `assertBoundIntegrity` re-fingerprints; `acceptRevision` rejects cross-task rebind; prior deliverables archived historical. | `03/src/agreement.mjs` |
| F3 | P1 | **Fixed.** Bound proposal required for applied acceptance; unknown/foreign → `rejected_unbound`; withdrawn/stale/cancel → late dispositions; `task_opened` does not revive cancel; duplicate `resultId` ignored; withdrawn resubmit → stale. | `06/src/reducer.mjs` |
| F4 | P1 | **Fixed.** Artifact present → always recompute checks; imported `priorCheck` labeled `imported_unverified`; incomplete imports cannot clear required criteria. Packet same provenance rule. | `05/src/correct.mjs`, `07/src/packet.mjs` |
| F5 | P1 | **Fixed.** `UNEXPECTED_FILE` in blocking set; status `rejected` when extras present and `allowExtraFiles=false`. | `04/src/admit.mjs` |
| F6 | P2 | **Fixed.** Reference-only claims → `unverified_evidence`, not `meets`. | `02/src/compare.mjs`, `02/src/constants.mjs` |
| F7 | P2 | **Fixed.** Path reader uses own-property checks only (`hasOwnProperty`). | `01/src/path.mjs` |
| F8 | P2 | **Fixed.** CLI `run <input.json> [--receipt out.json]`; versioned portable receipt; fresh-process replay covered by test. | `08/src/cli.mjs`, `08/src/receipt.mjs` |

## E2E gate

Caller JSON → selected proposal → failing artifact → correction → readmit actual bytes → checks → unresolved subjective stays `needs_review` → explicit local requester decision bound to correct artifact/revision → lifecycle `completed`. Fresh-process receipt replay. No invented acceptance/payments.

Proof: `node --test experiments/scale-r2-20260910/exchange/*/tests/*.test.mjs` → 49/49 pass.
