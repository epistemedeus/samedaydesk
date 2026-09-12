# CW65 H7 slice status (parent-owned harness)

Runtime pin consumed: `8a811bbadba7edc6c926b319b0839cd2f01e5896` (useful-jobs 1.4.3 unpublished). Previous `6007fcfa` evidence remains historical. Rebind probe: `evidence/h7-pin-8a811bba-vendor-001` (`d16-current-vendor` pass).
PG 55595: **untested** (not required by executed cases).
Do not git-commit from this file; parent commits.

## Harness repairs on this pin

- `lib/oracle.mjs`: nested `receipt.executionId` is optional; a present nested id must match the envelope. This was a harness contract mismatch, not an engine regression (`body.executionId` is populated; receipt.v1 omits it).
- `test/controls.test.mjs`: absent nested id is accepted; contradictory nested id is rejected.
- `experiments/wave5/d20/current.mjs` `verifyPickup`: current mailbox pickup exposes `outDir` plus `{name,bytes,sha256,ok}` and omits per-artifact `path`. Bytes are read from `join(outDir, basename)`.
- `run.mjs`: `--only` never sets global `ready`; selected-case status is reported separately. Uncommitted runtime paths refuse; sibling H7 consumer dirtiness is recorded.
- Ledger/outbox cases remain **incomplete** independent gates (sibling H7 slices exist; this harness does not treat their presence as CW65 acceptance). HTTP adapter still has no authenticated principal contract.

Original D16–D20 historical files were not rewritten. Foundation-smoke failure directory is preserved.

## Executed on this VM (each `--only` run also re-runs the 9 controls)

| Case | Status | Evidence |
| --- | --- | --- |
| controls (9) | pass, readinessCredit 0 | `evidence/h7-controls-001`, each probe `controls.tap` |
| d16-current-vendor | pass | `evidence/h7-vendor-probe-001` |
| d16-current-lockfile | pass | `evidence/h7-d16-current-lockfile-001` |
| d16-current-refusals | pass | `evidence/h7-d16-current-refusals-001` |
| d16-staged-input-mutation | pass | `evidence/h7-d16-staged-input-mutation-001` |
| d19-http-body-and-key | pass | `evidence/h7-d19-http-body-and-key-001` |
| d19-http-principal-boundary | incomplete | `evidence/h7-d19-http-principal-boundary-001` |
| d19-current-ledger | incomplete | `evidence/h7-d19-current-ledger-001` |
| d20-current-outbox | incomplete | `evidence/h7-d20-current-outbox-001` |
| d18-sequential-different-jobs | pass | `evidence/h7-d18-sequential-different-jobs-001` |
| d18-simultaneous-same-publication | pass | `evidence/h7-d18-simultaneous-same-publication-001` |
| d20-mailbox-wrong-body-key-and-bytes | pass | `evidence/h7-d20-mailbox-wrong-body-key-and-bytes-001` |
| d20-corrupt-order-no-rerun | pass | `evidence/h7-d20-corrupt-order-no-rerun-001` |
| d18-current-verifier-corruption | pass | `evidence/h7-d18-current-verifier-corruption-001` |
| d18-publication-rollback | **fail (runtime witness)** | `evidence/h7-d18-publication-rollback-001` |
| d19-simultaneous-orders | pass | `evidence/h7-d19-simultaneous-orders-001` |
| d19-distinct-orders | pass | `evidence/h7-d19-distinct-orders-001` |
| d20-order-interrupt-reserved | pass | `evidence/h7-d20-order-interrupt-reserved-001` |
| d20-order-interrupt-completed | pass | `evidence/h7-d20-order-interrupt-completed-001` |
| d20-order-interrupt-before-complete | **fail (runtime witness)** | `evidence/h7-d20-order-interrupt-before-complete-001` |
| d20-mailbox-interrupt-before-commit | pass | `evidence/h7-d20-mailbox-interrupt-before-commit-001` |
| d20-mailbox-interrupt-after-commit | pass | `evidence/h7-d20-mailbox-interrupt-after-commit-001` |

`--only` summaries: `ready: false`, `selectedOnly: true`, `runtimeUnchanged: true`. Failures exit 2.

## Preserved runtime witnesses (do not rewrite assertions; do not edit core)

1. `d20-order-interrupt-before-complete`: engine completed then SIGKILL before `store.complete`. Reopen ran a **second** real engine (`executions.jsonl` 1→2, `replayed: false`, distinct execution IDs `3e7c7cb7…` vs `570252db…`). Owner: managed-order/runtime, not CW65.
2. `d18-publication-rollback`: CLI refused (`ok: false`) but still overwrote a preexisting caller artifact at the publication alias. Owner: wrapper publication, not CW65.

Incomplete gates: HTTP has no authenticated principal; ledger/outbox sibling slices are not CW65 acceptance. PG 55595 untested. No CW60–62/70 product edits.
