# VF12 executed entry-to-reuse result

Cold visitor A now obtains bounded correspondence credentials through VF10,
contributes the maintained VF09 C/Wasm component through VF05/VF02, and receives
independent canonical verification. After a real host restart, fresh visitor B
registers separately, discovers the accepted implementation and executes it with
no A candidate ID or transcript. This is controlled synthetic QA, not independent
commercial demand. No production activation, main merge, new login, model worker
or spend occurred.

The same receiving branch is `codex/visitor-foundry-integration-20260926`.
Implementation checkpoint: `089d52861841b58aae7aa4895ae7f776b682217a`.
Tested source with prefixed-host and invocation-process evidence:
`f2b4ce6c3df23508774319350c72fbdbe8e852c0`.
Its following documentation/receipt commit is the final exported receiving head;
`.scratch/vf12-export/export-receipt.json` records the full head/tree and hashes.

## Exact inputs and ownership

- Continued VF09 `72d957522a0ef078955a25eab768a51bcfe770fb` on the existing branch.
- Fetched exact VF10 `f207af75396b3fbf1b0c6e53b24bba825baf40cf` from Git; received
  only `scripts/visitor-foundry/entry/` at
  `74e6a49fcf9e586c4e6fdd1c594eadfa3fc96a49`.
- Preserved F93 full references, original/gap-binding distinctions, transactional
  VF02 submit/admit, VF03 reviewer policy and resource ledger, VF08 executable
  profile and VF09 lifecycle/recovery. VF11 replay optimization remains separately
  owned. No VF06/07 demo was manufactured and no other checkout was used.
- The original VF04/F93/lifecycle/VF09 exports are preserved. Final export checks
  compare all 92 prior files and local nonreceiving branch refs.

## Implemented binding

The versioned contribution addon preserves the original VF10 installation row,
maximum enrollment count and charged registrations. Existing v1 registrations
retain their exact terms, private-only scope, grant IDs and event budget. Alias,
new secret, restart, reinstall or addon rename cannot reset the budget. Owner
preimages are discarded; cold clients receive only scoped reader/writer grants.

`EntryReceiver` reserves a complete finite allocation under one host row lock
before installing a pool. Its binding contains the charged request, registration,
project, entry terms/profile, host configuration and installed evaluator. Pool
configuration digest, current evaluator validation and exact allowance are checked
on ready readback and canonical pool operations. A stale stored ready marker
cannot substitute for current proof.

The once-only begin marker remains. Read performs no mutation. Private recovery
completes a committed pending allocation in the canonical enrollment transaction,
or records a declined tombstone when no begin reservation exists. A delayed begin
cannot revive that tombstone. Expired pending allocations stay charged; known
absence can decline without inventing a pool. Recovery never creates a second
registration, project, grant set or allowance.

All entry pools share an aggregate physical reservation check over actual durable
attempt/invocation rows. Unknown launch or exit retains its slot. VF09's existing
supervisor, child witnesses, unclaimed-invocation recovery and evidence renewal
remain authoritative. This reserves additional entry-cohort capacity; unrelated
owner pools and other host workloads still need their own host allocation.

The public scope gate admits only bounded task/resolve/invoke, terms/cell/status
reads, participation/components, decline/observe and terminal withdrawal. It
refuses direct work-cell mutations, candidate injection and operator/verifier/
funding/configuration routes. Sharing requires both exact entry and contribution
terms. Registration alone does not authorize sharing. Private correspondence and
anonymous decline remain available when contribution is unavailable or declined.

The entry client persists proof, authority, task, VF05 intents and exact invocation
body before send. The existing VF05 replay seal binds origin/tenant/fingerprint;
its private key is purpose-separated by registration and both term hashes. Tokens
are derived only in memory. Public hints remain secret-free and read-only.

## Measured result and finite limits

See [measurements.json](evidence/entry/measurements.json) for exact measured CPU,
wall time, fuel, peak RSS and HTTP bytes, and [journey.json](evidence/entry/journey.json)
for real PG attempt/invocation witnesses and output identities. Source remains
2,456 bytes; Wasm remains 3,356 bytes with SHA-256
`37e04d035231a179a3408e98ab6bc68c54d9a61996554de38e75554465076121`.
Four frozen later inputs execute exactly; only the structured observed result is
counted useful. The error/unknown/unsupported cases retain their honest outcomes.
An unseen input remains unqualified.

The installed QA example allows 12 private registrations, three event intents each,
one-hour renewable grants and fixed one-day workspaces. Contribution admission
reserves at most four pools; each gets four candidates, 16 packages/gaps, four
cells, 24 normal cell commands plus at most one cancellation per cell, 48 HTTP
receipts, 128 native/maintenance commands, 48 manifests and eight invocations.
Normal exhaustion never consumes the reserved terminal cancellation path.

Aggregate contribution reservation is 16 candidates, 64 packages/gaps, 16 cells,
112 cell commands including cancellation, 192 HTTP receipts, 512 native and 512
maintenance commands, 192 manifests and 32 invocations. Verification caps total
128,000 CPU ms, 256,000 wall ms, 16 reviews/16,000 review ms, and 64,000 USD_MICROS
of internal cost allowance. Invocation caps total 64,000 CPU ms, 128,000 wall ms
and 32,000 USD_MICROS. One physical slot bounds this cohort to 512 MiB configured
address space at a time. These are reservations, not measured charges or money
spent. Actual financial cost is unknown; no settlement is enabled.

Eight concurrent registrations through two separate hosts with three configured
allocations yield exactly three ready pools and five contribution declines, with
all eight private workspaces intact. No capacity is refunded by alias, expiry,
revocation or unknown outcome. These are explicit configured QA choices, not
claims about production capacity.

## Verification and defects closed

[verification.json](evidence/entry/verification.json) records receipt hashes and
source hashes: **345 passing tests, zero failures or skips** in the final suites.
This includes 20 combined VF12, 19 VF10, 14 VF09, 29 previous integration/lifecycle,
six F93, 50 VF01, 15 real-PG VF02, 65 VF03, 53 real-PG correspondence, 46 VF05,
three real-PG VF05 and 25 real-runtime VF08 tests. Correspondence build, site build
(81 pages), entry/participation/validation checks and frozen wire export check pass.

Combined tests use real PG16 with durable commits, independently started HTTP/CLI
processes, the `/api/correspondence` prefix and actual maintained Wasmtime runtime.
Eight SIGKILL boundaries cover before entry, charged entry, project and writer grant
commits, begin marker, host reservation, enrollment completion and response loss.
Further deaths cover each VF05 mutation, completed invocation ACK, reserved
invocation and child identity commit. SQL counts, exact response identities and
physical child witnesses are reconciled; fixture callback counters are not proof.

The implementation also closes nested-submit receipt overrun by checking capacity
again before the outer receipt commit; its failing transaction rolls back both
VF02 submission and VF03 admission. Non-actionable negotiation cannot accumulate
unbounded gap rows. Wrong standing terms refuse before registration; stale terms
and grants after real lock waits cannot commit sharing. Withdrawal and explicit
operator evidence renewal preserve source identity and old publication history.

Earlier failed runs are retained and identified in verification.json. Final suites
use corrected test expectations for existing `accepted`/`leased` states and the
unrecoverable owner-hash grant row. A VF05 PG run initially lacked its specific
binary environment variable; the real configured run passed without skips.

## Remaining hosting boundary

The default service does not mount this addon or start a worker. Heavy owns
packaging and actual host wiring; Root owns any later activation. The source does
not attest a deployed SDS runtime, arbitrary source-to-binary compilation, legal
ownership, general input compatibility, identity independence or economic demand.
The [Heavy receiving delta](VF12-HEAVY-RECEIVING-DELTA.md) supplies the concrete
mount/migration/recovery and acceptance steps without activating production.
