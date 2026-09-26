# Explicit verification generations

The external artifact identity remains the F93 contract in `../wire/`. These
[installed maintenance ports](ports.json) change verification state only.
`../src/verification.mjs` constructs the exact current policy/runtime profile;
`../src/store.mjs` validates closed request shapes and commits transitions.
Visitors cannot invoke the maintenance methods via HTTP or supply evaluator,
source, profile, assignment, accepted state or additional budget.

The initial verification is generation 1. At most three explicit renewals may
follow on this receiver, each with one actual attempt and a fresh assignment/fence.
The native reference coordinator supports at most eight generations; this
receiver deliberately narrows that bound to four. There is no timer, free retry,
new scheduler or second event store. Finite CPU/wall/cost/backlog limits and the
4,096-command native journal may stop work before the generation limit. The
maintenance idempotency namespace is separately bounded to 4,096 keys.

## Concrete operator workflow

Use the existing private worker with existing database/schema environment
configuration. `VF04_OWNER_QA_WORKER=1` explicitly enables its owner-QA fixture
path; it is not a new login or visitor capability. Persist the JSON request and
command key before calling. Get current generation and verification ID from
project status or trusted host state. No deployment or migration is implied.

```sh
# renewal.json contains exactly:
# {"candidateId":"candidate:...","expectedGeneration":1,
#  "expectedVerificationId":"sha256:...","reason":"expiry"}
node scripts/visitor-foundry/integration/worker.mjs revalidate PROJECT renewal.json command:renewal-1
node scripts/visitor-foundry/integration/worker.mjs dispatch PROJECT
node scripts/visitor-foundry/integration/worker.mjs recover PROJECT
```

The worker also accepts `configure-verification PROJECT profile-change.json KEY`.
That file contains exactly `{expectedVerificationId,revision,validityMs}`. The
new profile is derived from the installed evaluator and immutable pool caps; it
cannot supply source bytes, runtime, scope, checks, risk, runner or spend caps.
An existing empty/legacy profile has expectedVerificationId null; this is an
explicit installation, not a migration default pretending old code was replayed.

Reasons have separate gates. `expiry` requires a prior accepted receipt whose
original validity has elapsed, including an expired pending outbox. An explicit
observation withdrawal allows `evidence_retracted`. `verification_changed`
requires a different installed profile; `retry_failure` requires a terminal
failed/unknown round. A new artifact or source version must use a new candidate
admission, not renewal. A revoked/deprecated source or cancelled/rejected cell
cannot renew. Neither expiry nor receipt retirement changes source eligibility
by itself.

Exact key replay returns historical acknowledgement. Concurrent requests for the
same prior generation and current profile coalesce to its immediate successor.
A stale request cannot skip generations; a historical success never releases a
new reservation or makes an old receipt current. Callers must inspect current
state, not treat an old acknowledgement as permission to run a new attempt.

## Evidence and physical lifecycle

Enqueue retires old compatibility through existing immutable graph mutations and
sets logical state pending. Old observations and their original timestamps and
validity stay intact. They remain visible to dependency-health computation: hiding
expired evidence can otherwise falsely revive a stale parent composition. Fresh
component evidence does not replay its parent. Negative and unknown evidence is
retained in its original attempts/receipts; supplied environment logs remain the
separate F93 non-replayed evidence path.

Every attempt and publication carries generation and a profile snapshot. Policy
changes retire old published evidence and affect newly submitted or explicitly
renewed rounds. They do not mutate a running round's policy. A queued stale-policy
round can be explicitly closed as unknown without execution, then superseded
within the same finite generation limit. A running/unknown child must first have
real termination or a durable unclaimed-reservation proof. A deadline, withdrawal,
policy change, stale receipt or repeated request does not invent exit evidence
or refund its charged reservation.

Reconciliation requires the exact current round and current installed profile.
A result from an obsolete profile is retained as audit data and yields unknown,
without publishing compatibility. Fresh passing evidence produces a separate
outbox row keyed by `(project,candidate,generation)`. Publication requires that
exact current generation, receipt, source eligibility, profile and unexpired
validity. `publish(..., generation)` defaults to 1 for existing callers; it never
silently chooses the latest round. Recovery only selects current-generation
outbox entries, preserving superseded pending history for audit.

The source artifact is pinned to the exact original preflight Git revision and
its probe-byte SHA-256. Node/host evaluator/wire-policy implementation changes can
require a new profile and real generation without rewriting immutable artifact
identity. A changed artifact implementation must receive a source/version upgrade.
The manifest's creation-runtime provenance stays historical; renewed receipts
bind the current actual installation separately. No arbitrary code executor is
introduced here.

## Reproduce and inspect limits

`run-local.mjs test` executes the original F93/durable suite and lifecycle suite
against real private PG16. Focus a lifecycle case with `VF04_TEST_NAME_PATTERN`;
this selects only the lifecycle file to avoid running the old fixture hooks when
all its tests are filtered out. Use a fresh `VF04_EVIDENCE_DIR` for receipts.

Coverage includes malformed public version input, immutable gap replay after
unrelated graph growth, real expiry and fresh evaluation, two host processes,
concurrent coalescing, lost acknowledgements at renewal/reservation/reconciliation/
publication, fresh cold CLI use, stale old receipts/fences, failed and unknown
renewal, current policy/runtime/source checks, withdrawal while alive, revoked
source, aggregate budget and generation limits, outbox expiry, dependency history,
and migration readiness/rollback/reapply. Downgrade refuses existing execution
profile/validity bindings even in generation 1, maintained rounds, or maintenance
decisions; otherwise it could reinterpret a short-lived pending receipt using
legacy one-hour validity. The portable executor, general
composition and independent job integrations remain separately owned.

Tests use short explicitly installed validity windows to exercise actual expiry
without wall-clock mutation. Runtime-drift metadata and a mismatched child manifest
are labeled fault injections; they are not claims that a different Node runtime
or a general composition executor was deployed. All observations remain owner QA.
