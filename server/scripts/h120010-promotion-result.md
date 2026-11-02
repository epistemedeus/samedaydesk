# H120010 promotion result

## RESULT
Amended machine-only promotion package for aa861e980df0 to 6bde3ec4df57. The original completion remains bdbae58688b857eb8bf3ebf408768daa3a088af4. This run repeated the contained zero-value upgrade and rollback. Production was not changed. Emitted human bytes are unchanged. The published 0.3.1 descriptor was not released. A private successor descriptor was exercised and is not a public descriptor.

## Original failures
These are the gaps in the original completion at bdbae58688b857eb8bf3ebf408768daa3a088af4. They are not reclassified as success.
- Candidate continuity was not established. Acquire with the published descriptor against candidate code returned acquisition_profile_mismatch. That run resolved the lost baseline POST before promotion and then read it back with the same published descriptor. The mismatch was a real refusal, not successful candidate continuity.
- applyBundle validated each member while writing earlier members. A corrupt late member could leave a mixed tree that neither install nor rollback accepted. Writing the pin last was not atomic, and there was no task progress journal.
- The reviewed pair was baked into helper source constants, so each promotion required an edit of those constants.

## Corrected outcome
- The published client stayed byte-identical (accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9, 30187 bytes). Wrong repository and wrong commit still return acquisition_source_mismatch before a request.
- The lost baseline POST stayed unresolved in the client journal until after the code promotion. Journal state before promotion: unknown. No readback was performed in that phase.
- After promotion, the published descriptor still returned acquisition_profile_mismatch. That stale-descriptor refusal is a positive control. publishedDescriptorContinuity: false.
- Acquire and the retained readback then used the private successor descriptor 2edea980c57909e8715cac1c899c1e4886f418614a71a79e50df113e4bd28d25. The same idempotency key was read back with no second POST. Task count stayed 1. Readback evidence: atomic_operation; originalBodyRecorded: true.
- After code rollback, the successor descriptor returned acquisition_profile_mismatch. The baseline descriptor was restored, acquire succeeded, and the same key was read back again. Task count stayed 1.
- File repair now validates the complete bundle and the destination before the first payload write. Interrupted progress can finish the exact candidate or return to the exact predecessor. pinLastAloneAtomic: false. Credentials, obligations, terms, and database authority stay outside that repair.
- The checked-in release contract binds this pair. A wrong, missing, or contradictory contract fails before writes.

## Source
- Repository: https://github.com/epistemedeus/samedaydesk.git
- Baseline commit: aa861e980df0f75a782ff30996450cf15870f2e7
- Candidate commit: 6bde3ec4df57df5f0783fec38f39eacbadfb6d9e
- Promotion head at the run: bdbae58688b857eb8bf3ebf408768daa3a088af4
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
- Progress owner: h120010-apply. Final progress phase: complete. Final progress role: baseline.

## Release contract
- File: docs/machine-promotion/release-contract.json
- SHA256: 2add3bff8f4b565b5523ef4eb385b49ed1065fe874150cb23e853a297b7beea2
- Paths are caller inputs. The helper does not trust whichever files happen to be present.
- Frozen flags stay off. Runtime and desk commits are bound by the contract.

## Two-artifact order
- Order: code-bundle then acquisition-descriptor.
- Descriptor publication: after-measured-candidate-identity.
- Partial code repair: progress-journal.
- Schema 011: separate-sql-not-dropped-on-code-rollback.
- Rule: Install the code bundle only onto a tree that still measures as the baseline identity. Publish the acquisition descriptor only after that tree measures as the candidate identity named here. A baseline descriptor on candidate code, or a candidate descriptor on baseline code, fails closed with acquisition_profile_mismatch. That refusal is not continuity. An interrupted code install finishes to the exact candidate or returns to the exact predecessor from the task progress journal. Pin-last is not atomic. File repair does not touch credentials, obligations, terms, or database authority. Schema 011 is applied once as SQL and is not dropped when code rolls back. If code is rolled back, restore the baseline descriptor in the same decision.

## Human comparison
- Build: server/scripts/publish-preserved-client.mjs
- viteInvoked: false
- Baseline exit: 0
- Candidate exit: 0
- Inventory: 6f3cb5cde8366402812394d549d592a3003168f51f274b901f153880d0f302a5
- Files: 352
- Bytes: 59951737
- byteEqual: true
- preservedInventoryAgrees: true
- Projection: unchanged
- The published descriptor still requires source 5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2 and host 4c0614fc44913b35278757904647b62e0dc35fe6fe0f18a49eae4c9f7b3e4177. That refusal is unchanged and is not a human-byte change.

## Contained receiving
- Wrong repository and wrong commit: acquisition_source_mismatch before any request, on the baseline, candidate, and restored baseline.
- Lost post response: exit 2, code unknown_outcome, nextAction readback. Journal remained unknown until after promotion.
- Idempotency key hash unchanged across promotion and rollback: true.
- Candidate readback reused that stored key. Task count stayed 1. secondPost: false.
- Fund while the lost post was unresolved: not called. Candidate code after readback: qualified_selection_required, paidWork false. Restored baseline code: selection_required, paidWork false. No funding row was written.
- Money stayed unfunded and signerAuthority stayed false. Qualified capability was not set.
- Account count stayed 1 after signup. Legacy obligation count stayed 1.
- Financial digest equal across before, candidate, and rollback: true
- 011 tables after migration: capability_selection, capability_selection_receipt, voluntary_predecessor_binding
- 011 tables after code rollback: capability_selection, capability_selection_receipt, voluntary_predecessor_binding

## Rollback
- File role baseline restored the measured installed identity 5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2.
- The private successor descriptor was refused with acquisition_profile_mismatch.
- The restored baseline descriptor acquired successfully and the same account readback succeeded.
- No schema was dropped.

## Private descriptor
- File: docs/machine-promotion/evidence/private-successor-descriptor.json
- SHA256: 2edea980c57909e8715cac1c899c1e4886f418614a71a79e50df113e4bd28d25
- Published: false
- Client source provenance: epistemedeus/neomorphic-io b79f985e83e829288a675407a4b4124e58a11f3a clients/cold-requester-0.3.1.mjs
- Required profile source: 8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6
- Required profile host: a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3
- Public endpoints in the descriptor were not changed.

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
- docs/machine-promotion/release-contract.json
- docs/machine-promotion/bundle/
- docs/machine-promotion/evidence/

## Boundaries
- Source package: this branch. It is not an installed release.
- Contained receiving: disposable private Postgres, destroyed before this receipt was sealed.
- Actual deployment: not performed. Root owns production credentials and the install root.
- Financial activation: not performed. Accepted money logic was not edited.
- Descriptor publication: not performed. The successor file is private evidence.
- Outside use: not performed. No external user task and no human publication.
- Revenue: none.

## NEXT
Root installs the code bundle only onto a tree that still measures as the baseline identity, then applies schema/011_capability_composition.sql once. Root publishes the acquisition descriptor only after the installed tree measures as the candidate identity in the release contract. Until that publication, clients fail closed. Pin-last is not atomic: an interrupted install is finished or returned from the task progress file, and that repair does not touch credentials, obligations, terms, or the database. If code is rolled back, Root restores the baseline descriptor in the same decision and does not drop schema 011. The recorded SOURCE.json constant remains a nonauthoritative disagreement. No default merge.
