# H120010 promotion result

## RESULT
Closed machine-only promotion package for aa861e980df0 to 6bde3ec4df57. The synthetic zero-value private upgrade and rollback ran in a disposable database. Production was not changed. Emitted human bytes are unchanged. Public 0.3.1 stays bound to the installed profile until Root issues a successor descriptor.

## Source
- Repository: https://github.com/epistemedeus/samedaydesk.git
- Baseline commit: aa861e980df0f75a782ff30996450cf15870f2e7
- Candidate commit: 6bde3ec4df57df5f0783fec38f39eacbadfb6d9e
- Runtime pin: 427f5a08e3b294a8f15fb9d148f7de46ca7cb538
- Desk pin: 0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556 (publicEnabled left false)
- Measured candidate source: 8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6
- Measured candidate host: a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3
- Recorded SOURCE.json constant: 458c129b2397099200be163ea6b11be61926114f9d6842897607cfcb9a771ba8
- recordedSourceConstantAuthority: false
- recordedSourceConstantAgrees: false
- native-debt.mjs byte-identical across the two commits: true
- Original obligation id oobl_izUh7nn9vd_APjsR remains in that unchanged source constant. This run did not read or write the production row.
- Synthetic continuity obligation obl_legacy23410001 stayed present. Authority digest 91d81dd367a181880318a19f3f308e65576d19b8f1b9d707da7a0666f1bf5f01.

## Bundle
- Location: docs/machine-promotion/bundle
- Manifest digest: a59b8fe3f9c9a5140d600e88cbeeca517d4fcd6d313d7124a6e761f1aaa5d2d9
- Members: 19
- Excluded from the machine closure: 35
- Human paths in the payload: none
- Schema 011 is additive and was applied once. Rollback restored code bytes and left the 011 tables in place. Schemas 006-010 were not reapplied.

## Human comparison
- Build: server/scripts/publish-preserved-client.mjs
- viteInvoked: false
- Baseline exit: 0
- Candidate exit: 0
- Inventory: 6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5
- Files: 352
- byteEqual: true
- preservedInventoryAgrees: true
- Projection: unchanged
- Separate receiving decision: the public descriptor still requires source 5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2 and host 4c0614fc44913b35278757904647b62e0dc35fe6fe0f18a49eae4c9f7b3e4177. After the candidate boot, acquire returned acquisition_profile_mismatch. After code rollback, acquire succeeded again. That is a profile binding, not a changed human file.

## Contained receiving
- Wrong repository and wrong commit: acquisition_source_mismatch before any request, on the baseline, candidate, and restored baseline.
- Lost post response: exit 2, code unknown_outcome, nextAction readback.
- One readback reused the stored idempotency key. Task count stayed 1. No second post was sent.
- Readback evidence: atomic_operation; originalBodyRecorded: true.
- Fund on every phase: paidWork false, HTTP 409. Baseline and restored baseline code: selection_required. Candidate code: qualified_selection_required. No funding row was written.
- Money stayed unfunded and signerAuthority stayed false. Qualified capability was not set.
- Account count stayed 1 after signup. Legacy obligation count stayed 1.
- Financial digest equal across before, candidate, and rollback: true
- 011 tables after migration: capability_selection, capability_selection_receipt, voluntary_predecessor_binding
- 011 tables after code rollback: capability_selection, capability_selection_receipt, voluntary_predecessor_binding

## Rollback
- File role baseline restored the measured installed identity 5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2.
- Public 0.3.1 acquire succeeded again on that restored tree.
- The same account readback succeeded and the task count stayed 1.
- No schema was dropped.

## Installed boundary
- Live source remains aa861e980df0f75a782ff30996450cf15870f2e7.
- Live runtime remains 427f5a08e3b294a8f15fb9d148f7de46ca7cb538.
- Live desk remains 0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556.
- Linked installation id remains 01a19731-bfd7-7095-9ec8-7c3218fb8aec.
- Public, funded, payment, and human-asset flags stay off.
- This assignment did not deploy, sign, grant, fund, pay, publish, or merge.

## Commands
- phase-before: exit 0
- install: exit 0
- phase-migrate: exit 0
- phase-after: exit 0
- rollback: exit 0
- phase-rollback: exit 0
- phase-destroy: exit 0

## File inventory
- server/scripts/h120010-promote.mjs
- server/scripts/h120010-receive.mjs
- server/scripts/h120010-promotion.test.mjs
- server/scripts/h120010-promotion-result.md
- docs/machine-promotion/README.md
- docs/machine-promotion/ROOT-COMMANDS.md
- docs/machine-promotion/BOUNDARY.md
- docs/machine-promotion/bundle/
- docs/machine-promotion/evidence/

## Boundaries
- Source package: this branch. It is not an installed release.
- Contained receiving: disposable private Postgres, destroyed before this receipt was sealed.
- Actual deployment: not performed. Root owns production credentials and the install root.
- Financial activation: not performed. Accepted money logic was not edited.
- Outside use: not performed. No external user task and no human publication.
- Revenue: none.

## NEXT
Root applies the bundle only to a tree whose measured identity is still the baseline, then applies schema/011_capability_composition.sql once and boots the candidate. Root does not reapply schemas 006-010 and does not drop 011 on code rollback. Root separately decides whether to publish a successor 0.3.1 descriptor for the measured candidate hashes, and whether to correct the recorded SOURCE.json constant. Neither decision is made here. No default merge.
