# VF04A result — explicit durable evidence maintenance

Implemented and executed on the same Root-launched Cursor VM, September 26, 2026.
The receiving parent is `107363a0fabaed6133235ebda812dd5f01b07d51`; the exact tested
implementation is `689233f2131669fdcb05f62f96452629dda479f3`. The subsequent commit
adds this result and the final receiving plan only. The remote-verified final tip,
tree, bundle, source archive and patch hashes are recorded in
`.scratch/vf04-lifecycle-export/export-receipt.json`. The branch remains
`codex/visitor-foundry-integration-20260926` in `epistemedeus/neomorphic-io`.

## Comparison with completed source

| Follow-up finding | Actual source and completed repair |
| --- | --- |
| Malformed runtime version can look compatible | Still present at receiving parent. The public boundary now accepts only optional `v` plus three safe decimal integer components without leading zeros. `23.not-a-version`, partials, prereleases and build tags return unknown; type errors remain typed invalid. The existing bounded range grammar is unchanged. Real public invocation and evaluator regression pass. |
| Gap projection mixes old gap with current resolver snapshot | Already repaired in F93: `toGapBinding(storedGap, ...)` derives the projection from the immutable stored source. No redundant source rewrite. A new real-PG regression mutates the graph with an unrelated version, then proves the entire replayed gap binding is unchanged and coherent. |
| Accepted semantic candidate cannot renew expired evidence | Added installed policy profiles and separate verification generations in the same transactional tables, supervisor, native journal and outbox. Exact artifact/manifest/candidate identity is preserved. Renewal requires explicit authority, current scope/source/profile, finite budget and fresh real evaluation. |

## Durable lifecycle now implemented

Private `configureVerification` installs the profile derived from exact installed
source/runtime/evaluator bytes and existing immutable pool caps. It uses expected
profile compare-and-swap and a persisted command key. Private `requestRevalidation`
requires candidate, expected generation, expected current profile and an explicit
reason: expiry, evidence retraction, verification change, or retry of a failed/
unknown round. There are no public maintenance routes, policy imports, visitor
receipt fields, refill, timer or permanent scheduler.

The receiver allows four generations total, one attempt each. A new round retires
prior positive evidence using existing graph mutations, journals the native
transition and updates generation/profile atomically. Exact keys replay; concurrent
requests for the same predecessor/current profile coalesce. A newly accepted round
has its own assignment, fence, receipt and `(project,candidate,generation)` outbox
row. Old acknowledgements, receipts, fences and publication calls cannot affect it.
An omitted publication generation still means 1, never the latest round.

Real expiry is checked using each original receipt's validity. Pending renewal,
failed renewal and unknown physical work do not renew compatibility. Original
negative/unknown attempt evidence, accepted receipts, expired observations and
withdrawal mutations remain durable. Retired observations remain in dependency
health input; a new component receipt cannot replay an old parent composition.
Current installed-profile drift fails closed during discovery, including legacy
profiles without a new explicit installation.

Every round binds current scope, exact source, actual runtime and policy. Source
probe bytes are verified against the original pinned revision. The artifact's
creation-runtime provenance stays immutable history; current verification is
bound separately. A changed implementation/recipe requires a new candidate or
source upgrade. Withdrawn/revoked/deprecated source is ineligible. A policy change
can explicitly supersede queued work without launch; live/unknown physical work
must reconcile witnessed exit or a durable proof of no launch before renewal.
No timeout, retraction, policy change or cancellation refunds charged capacity or
fabricates process termination.

Migration 003 adds profile/generation columns and generation-aware uniqueness;
there are no new tables. Existing rows keep generation 1 and null historical
profiles. It does not assert they ran this evaluator. Readiness requires the new
columns. Empty/pre-execution rollback and reapply pass on real PG. Downgrade refuses
maintained rounds, installed maintenance decisions, and recorded execution profile/
validity bindings even at generation 1. Otherwise an old short-lived pending
receipt could silently regain legacy one-hour validity. Nonempty archival/conversion
is a separate receiving operation, not a production action performed here.

## Executed receipts

All following evidence is under [evidence/lifecycle](evidence/lifecycle). The
[verification summary](evidence/lifecycle/verification-summary.json) records exact
TAP hashes, source/runtime pins and limits.

| Check | Final receipt | Passed |
| --- | --- | ---: |
| VF01 foundation | vf01-01.tap | 50 |
| VF02, real PostgreSQL | vf02-01.tap | 15 |
| VF03 including native generation regression | vf03-02.tap | 65 |
| F93 exact wire/native contract | f93-wire-01.tap | 6 |
| Durable integration and lifecycle, real PostgreSQL | integration-05.tap | 29 |
| Correspondence, real PostgreSQL | correspondence-regression.tap | 53 |
| **Total** | No failures, cancellations or skips in these final suites | **218** |

Both builds pass: correspondence TypeScript (`correspondence-build-02.log`) and
root (`root-build.log`). Generated-schema parity, independent Ajv conformance and
frozen F93 vectors pass. Source/docs whitespace checks pass; unmodified raw tool
logs retain their emitted whitespace. Node v22.22.2 and private PostgreSQL 16.15
were used with fsync/synchronous_commit enabled. Runs start/stop only their own
password-protected loopback clusters; no production service or database was used.

Actual lifecycle coverage includes:

1. Short installed validity, actual expiry, one authorized renewal through real
   evaluator/receipt/outbox and a fresh cold CLI invocation with stable identity.
2. Two hosts, 16 concurrent renewal requests and SIGKILL after committed renewal,
   reservation, reconciliation and publication before acknowledgement. Replays
   retain one round, charge, receipt and publication. Old rounds cannot release,
   finish, publish or write through a new fence.
3. Failed evaluation, withheld child exit and timeout/unknown with physical
   reservation held; explicit later retry, generation cap, unrelated usable
   capability and aggregate budget exhaustion without refill or refund.
4. Current policy changes while queued and while a real child lives; stale-profile
   result preserved as unknown; explicit subsequent current-profile evaluation.
   Source/manifest mismatch, revoked source and cancelled cell are refused.
5. Expired pending outbox retained, actual private CLI renewal and bounded recovery
   publishing only the current generation. Retraction does not stop an unrelated
   same-scope candidate. Historical dependency expiry remains authoritative during
   renewal and after fresh component evidence.
6. Additive migration repeatability, readiness failure after private rollback,
   reverse rollback/reapply preserving base/VF02 records, and no-loss downgrade
   refusals for current evidence/maintenance history.

Runtime metadata drift and mismatched child manifest are explicit fault injections;
the latter drives a real evaluator failure. A different Node binary was not
deployed. The dependency-parent regression uses an owned graph fixture, not the
VF06 executor. The installed recipe still refuses unsupported composition and
does not execute portable contributed code. No exhaustive input-domain coverage
is claimed from the small evaluator probe set.

## Retained failure and correction

`dependency-retirement-before.tap` records a real failing counterexample: filtering
historical admitted receipt IDs during renewal hid expired dependency evidence,
allowing a stale parent composition to become compatible. The correction retains
all original evidence and uses explicit retirement mutations; unavailable current
runtime/profile also derives fail-closed admission withdrawal during reads.
`dependency-retirement-after.tap` passes the focused regression, and both final
full runs 04/05 pass all 29 tests. Earlier successful runs are retained too.

The initial focused command also selected an entirely filtered original test file
whose fixture hooks remained alive. Only its two owned fixture hosts were stopped
to finish the receipt. The harness now selects just the lifecycle file when
`VF04_TEST_NAME_PATTERN` is set. No unrelated process or job was reset.

## Cost, limits and receiving ownership

The repeated real HTTP load run (`capacity-01.log`, `capacity.json`) offered 507
requests: 214 admissions, 165 semantic duplicates and 128 backlog refusals. All
33 first-round evaluations completed, with at most one held physical reservation
per project budget. This is short loopback owner QA, not sustained hosted capacity
or independent demand. Original six cold cases and renewed cold use passed;
established independently useful external tasks remain zero. Actual spend is null.

Maintenance can add at most three verification attempts per candidate. Each has
the existing 1,000 USD_MICROS declared cost cap; the default total remains 256,000,
with CPU/wall, 16 backlog, 256 records and 4,096 native-command bounds unchanged.
Maintenance keys have a separate 4,096 cap. The native reference coordinator allows
eight generations; the receiving layer and SQL narrow that to four. Installed
validity is 100ms–one hour, default one hour. Expiry is not an automatic job.
Additional retained rows/profile snapshots, scoped reads/locks, retirement mutations
and journal replay add storage and latency. This work does not establish a budget
rotation, archival regime, cgroup memory guarantee or measured economic surplus.

[CONTRACT](CONTRACT.md), [lifecycle ports](lifecycle/ports.json) and the detailed
[Heavy amendment](HEAVY-RECEIVING-PLAN.md#maintained-evidence-lifecycle-receiving-amendment)
define exact installation, private CLI, legacy handling, rollback and downstream
replay steps. The separate `.scratch/vf04-lifecycle-export/` includes full source,
verified Git bundle, follow-up/full patches and checksummed receipts. Original
and F93 exports, foundation pins and F93 vectors remain unchanged.

VF05 participation, VF06 composition, VF07 advisory allocation and VF08 portable
executor remain independently owned; no source or branch from those jobs was
changed/imported. There is no open PR to update. No subordinate models, new login,
main merge, public release, deployment, production migration or new spend occurred.
