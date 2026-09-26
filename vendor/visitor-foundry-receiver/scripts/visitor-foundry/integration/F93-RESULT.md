# F93 same-session contract amendment result

Implemented and executed on the same Root-launched Cursor VM on September 26,
2026, in `codex/visitor-foundry-integration-20260926`. Tested source checkpoint:
`a7fe9f508f58d25312c64e11b4e6e3d258fbb975`. Receiving parent:
`377c6a86b9ac22573d7fff88b39b7db05877dfef`. Subsequent documentation commit is the
handoff tip, recorded with remote verification and export hashes in the separate
`.scratch/vf04-f93-export/export-receipt.json`.

## Review disposition against actual completed source

Read VF04A-CONTRACT-REVIEW-FOLLOWUP.md and the adjacent original Sol and Root
reviews. Their advice concerned original VF01/VF02/VF03 pins 5c38974c, 47fe95ce,
2689a197. The review metadata identifies GPT-5.6 Sol (High); it was source advice,
not a new independent executable replay or a Pro-model test receipt.

F93-01 still existed at the completed receiver's 377c6a tip: VF01 and VF02 used
one gap schema ID for different records, and direct VF03 ID/content mapping
could not represent every canonical coordinate/dependency count. The durable
host, crash reconciliation, publication outbox, scopes, cold reuse and independent
assignment gates were already implemented. They were retained and replayed.

| Finding | Implemented disposition |
| --- | --- |
| Colliding gap schemas / revision meaning | Full immutable VF01 `gap.v1` is hash-validated. VF02 uses distinct `work-cell-gap.v1`, canonical 512-unit IDs and `contentId`. `gap-binding.v1` retains and verifies both. Workflow CAS/fence integers are separate; contribution.gapRevision still means the immutable contentId. |
| Narrow VF03 reference domain | External refs remain exact `{capabilityId,version,contentId}`. Full 512 UTF-16 coordinates and 100 dependencies round-trip through a verified `validation-identity-binding.v1`; native IDs use all 64 hex digits of a coordinate hash. Original values and manifest remain durable. VF03 candidate/command dependency max is 100. |
| Silent pin loss / conflicting immutable coordinates | Transactional per-project registry compares original coordinate, content pin and native alias. Replay verifies candidate/manifest/registry bindings. Same coordinate with different content fails; aliases cannot replace original refs. |
| Installed resource narrowing | Strict `candidate-admission.v1` carries the explicit original identity. The installed recipe limit is 32 dependencies and its exact supported target. Unsupported returns HTTP 422, unchanged original, reason/limit and `accepted:false`; no candidate, identity, journal, reservation or publication is partially committed. |
| JSON storage domain | Pure wire mappings preserve lone UTF-16 surrogates; PostgreSQL JSONB cannot. Candidate/evidence and VF02 writes refuse that domain explicitly before any replacement or write. Maximum ordinary Unicode/punctuation coordinates are tested through PostgreSQL. |
| Unique visitor environment | New scoped durable evidence submission/listing ports retain the supplied exact target/environment/input/log digest. Review only adds review metadata. Replay remains not-replayed with null assignment/receipt. Compatibility, assignments and budget remain unchanged. |
| Independent job ownership | Exported executable wire schema, receiving-port registry and deterministic vectors for VF05/VF06/VF07. No branch imports, checkout edits, worker messages, assumed job completion or new authority. Allocation stays advisory. |

All shared-module edits are in this receiving branch. The original foundation
branches, source exports and original integration receipts are preserved. No
subordinate models, new login, main merge, public release, deployment, payment,
shared VM service change or production migration occurred.

## Executed receipts

All receipts below are under [evidence/f93](evidence/f93). The machine-readable
[verification summary](evidence/f93/verification-summary.json) includes TAP hashes.

| Check | Final receipt | Passed |
| --- | --- | ---: |
| VF01 foundation | vf01-01.tap | 50 |
| VF02 foundation, real PostgreSQL | vf02-02.tap | 15 |
| VF03 foundation | vf03-01.tap | 62 |
| Combined exact wire/native dispatch | wire-03.tap | 6 |
| Durable integration / crashes / F93 | integration-03.tap | 20 |
| Correspondence real PostgreSQL regression | correspondence-regression.tap | 53 |
| **Total** | No failed/skipped final tests | **206** |

Correspondence TypeScript build (`correspondence-build-02.log`), root build
(`root-build.log`), VF03 generated schema parity, independent Ajv schema conformance,
and frozen wire vector parity passed. Node v22.22.2 and private PostgreSQL 16.15
were used. Each PostgreSQL runner created/stopped only its own disposable loopback
cluster, with fsync/synchronous commit enabled; no production URL was consumed.

Combined coverage includes max 512-unit Unicode/astral coordinates and versions,
100 exact dependencies, actual native VF03 dispatch of all 100 as pending,
serialized round trips, same-coordinate conflicting content, alias substitution,
PostgreSQL restart with all 101 original refs, maximum gap ID through VF02 submit
and supported candidate admission, unsupported admission with zero durable side
effects, supported retry, and no false promotion. A cold host restarts after
supplied-log review; environment resolution remains unsupported and no extra
assignment appears. All original commit-before-ack SIGKILL, withheld termination,
physical-capacity, scope, stale fence, forged receipt and cold CLI checks still run.

`integration-01.tap` is retained: 14 pass / 1 fail because the old stale-fence test
sent fence 0, which the new explicit schema rejects before the fence gate. The
test now sends current fence + 1 to exercise the same stale-authority gate. The
source gate was not weakened. `integration-02.tap` passes 19 tests; final
`integration-03.tap` passes 20 after adding storage-domain coverage. Earlier wire
and successful foundation receipts are retained too. No failed receipt was erased.

The repeated real load run (`capacity-01.log`, `capacity.json`) offered 507
simultaneous HTTP requests across 1/8/32/128 bursts: 214 new admissions, 165 semantic
duplicates, 128 explicit backlog refusals. All 33 first-round assigned evaluations
completed; every budget held at most one physical reservation. This is short
loopback owner QA, not sustained throughput, people, demand or measured spend.
Actual spend stays null. The six cold CLI invocations remain owner/owner_qa;
independently evidenced useful external tasks remain zero.

## Receiving limits and export

[wire/README.md](wire/README.md) and the amended
[Heavy receiving plan](HEAVY-RECEIVING-PLAN.md#f93-receiving-amendment) contain the
exact port shapes, unsupported conditions, authority ownership and replay steps.
The `.scratch/vf04-f93-export/` export is separate from the preserved original
`.scratch/vf04-export/`. It contains a verified source bundle, full receiving
patch, follow-up-only patch, portable wire directory, result/Heavy documents and
SHA-256 receipt. There was no open PR for this branch at follow-up start or at
checkpoint; no existing PR required an update.

Migration 002 adds only identity/evidence tables. No pre-F93 journal or persisted
work-cell JSON is automatically rewritten into a new schema or rekeyed into new
verifier identities. Existing deployments need a separately reviewed offline
reconciliation; fresh disposable receiving namespaces have been replayed here.
A 512KiB parser is required for full-domain admission vectors (base default stays
32KiB). The native wire supports 100 dependencies; the installed evaluator admits
at most 32 and still rejects unsupported composition at execution. None of these
bounds establish VF06 composition support. VF05/VF06/VF07 require their later
actual contract replay against these final ports.
