# VF09 Heavy receiving and hosting implementation plan

Receive tested implementation `0ea0252c31ed28909e39b4dea6cd30b17856fff5` on the existing
`codex/visitor-foundry-integration-20260926` branch, followed by its documentation
commit. [COMPOUND-RESULT.md](COMPOUND-RESULT.md) and
[compound/ports.json](compound/ports.json) describe the executed boundary. This
amendment supersedes older claims that VF05/VF08 are unreceived, that invocation
is always the JSON recipe, or that one receipt implies broad compatibility.
F93 and the maintained-evidence lifecycle remain authoritative.

## Actual host admission, first

The assignment identifies a separate Heavy current-host note as authoritative.
It was not present among the supplied adjacent plans and was requested from Root;
no replacement runtime facts were inferred from historical DEPLOY.md. This is an
explicit hosting dependency, not a source-test failure. Before changing a host,
Heavy must attach that note and record the actual repository/head, process entry,
service manager/container, architecture, Node/Python versions, writable/runtime
mounts, PostgreSQL/schema owner, secret injection, reverse proxy and shutdown
behavior. Do not assume a static site or a serverless handler supports child
process supervision. If the current host cannot supply the tested primitives,
leave portable execution disabled there and return that specific unmet seam to
Root. Do not provision an alternate service or paid resource under this plan.

Observed here: Root-launched Cursor Linux x86_64 VM; Node 22.22.2; private
PostgreSQL 16.15 with fsync and synchronous_commit on; separately started Express
hosts, CLI processes and supervised Python/Wasmtime processes; Clang 18.1.3 and an
existing Wasm linker. These observations describe receiving tests, not deployment.
The normal `services/correspondence/src/index.ts` still starts the base service.
It does not automatically enable this extension, enroll pools, run workers or
migrate the foundry schema. No homepage or three-site identity changes are needed.

## Accept exact source and preserve ownership

1. Fetch the final receiving tip with the already enrolled native Git account.
   Verify its export receipt/tree, bundle prerequisite and archive hashes. Keep
   the prior VF04, F93 and lifecycle exports. Do not merge main as part of source
   acceptance. The freeze/import checkpoint is
   `581470574579fc2c627227821a42e8b518ce16bb`; current receiving parent was
   `ca638c7ef552ebb1c55cce77f13e1c7162a29fbb`.
2. Read `compound/launch-receipt.json`: exact VF05 and VF08 terminal subtrees were
   received from Git objects. VF06/VF07 terminal RESULT and Heavy plans were read
   from their Git exports, but those optional subtrees are not imported. The useful
   task needs one component. No composition/matching acceptance is claimed.
3. Review the minimal shared join: VF02 `mutate(..., installedClient?)` accepts an
   in-process PG transaction only; HTTP never supplies it. All actual lease and
   command transitions remain VF02's. F93 full references, immutable contentId,
   separate gap schemas, supplied-evidence classification and native aliases are
   unchanged. The VF05 direct CLI/fixtures now use `cell.gap.contentId`.
4. VF08's receiving delta adds the explicit trusted F93 reference adapter and
   per-case durable callbacks; legacy standalone behavior remains tested. VF09
   owns its profile, package storage and durable joins, not a fork of the runtime,
   capability registry, validation coordinator or earned-work/payment system.

## Reproduce before mounting

Use a private checkout/database and the exact README commands. Do not run the
runtime-drift compound suite concurrently with portable tests or the read bench:
that test deliberately edits and restores this checkout's child wrapper, and
other processes correctly refuse it. `read-bench-after.tap` retains such an
interference failure; the isolated after run passes. This is not a reason to
remove the integrity check.

Build correspondence and the site; check frozen wire exports and VF03 schemas.
Set up only the pinned VF08 private runtime and rebuild the C component. Run all
306 affected tests, including 14 compound, 29 prior integration/lifecycle, six
F93 vectors, 50 VF01, 15 real-PG VF02, 65 VF03, 53 real-PG correspondence, 46 VF05,
three real-PG VF05 and 25 VF08 tests. Keep the standalone receipts and rerun the
independent Python oracle against the four frozen later cases. Missing runtime,
PG or toolchain must fail acceptance, never produce a skip.

The C source is 2,456 bytes and produces a 3,356-byte Wasm module. Verify source
SHA-256 `e278017956465f0665dceb138ea1e666591ded14b4a7cda36bd6f2e0995f8114`
and module SHA-256 `37e04d035231a179a3408e98ab6bc68c54d9a61996554de38e75554465076121`.
These establish byte identity. The receiver does not independently attest that
an arbitrary submitted binary was compiled from its claimed source, nor perform
legal review of source ownership. The installed profile explicitly admits this
MIT owner-QA reusable example only.

## Mount in the existing service

After Root's source review and a separately authorized hosting change, modify the
actual current host entry point identified above. Reuse `buildStoreFromEnv`,
`createApp`, `prepareFoundryHost` and `createFoundryExtension`. Before `createApp`,
call the preparation hook with an explicit installed extension factory; after
creating the app, mount its router on that same app. Use the same database/schema,
existing auth, rate limiting, CORS, trust-proxy policy, health endpoint and listener.
Set the existing body parser to 524,288 bytes only for this opted-in service.
`prepareFoundryHost` joins readiness and close into the base store. Do not start
`tests/fixture-host.mjs` in a host: its IPC administration and bootstrap token are
only test controls.

Supply a persistent, host-private participation HMAC key through the host's
existing secret injection; do not log it or pass it to visitors. This key binds
semantic proposal identity within the tenant. Visitor session identity keys are
separate local secrets in mode-0600 files. Origin, tenant, grant fingerprint,
terms and full command are sealed before mutation. A new origin/key/grant needs
an authenticated continuation read and new intent, not a forged replay.

For the approved database change, back up and rehearse restore first in a private
clone. Apply base/VF02 prerequisites and foundry migrations 001–004 through the
existing installed migration path, separately from server startup. 004 adds one
bounded package-byte table because existing correspondence ArtifactRef stores a
URL/label rather than binary content; it adds execution/participation columns to
existing pool/attempt/invocation rows. It adds no second event store. Existing
correspondence idempotency rows still journal VF02 commands, VF03 transitions,
HTTP intents and maintenance. Check readiness after migration, then enroll only
operator-approved projects using `enrollPortable(projectId, options)`.

Enrolled portable readiness verifies the actual installed runtime/profile bytes.
Readiness also checks current oracle, corpus and evaluator-port bytes against the
installed source pin, even while the host remains running. Readiness failure must keep the mount unavailable; it must not silently substitute
the old recipe. Profile/runtime changes require a deliberate new installed
verification generation and fresh execution. Old evidence is retained and retired.
The inert `.invalid` artifact references are content-addressed internal locators,
never fetched. A downloadable hosted source route, if wanted, must authenticate
project access and return the exact stored bytes; it must not fetch arbitrary URLs
or treat a visitor URL as an installed module.

## Authority and data flow to retain

`POST task` resolves first. An unnegotiated request or decline keeps ordinary use
available. Only current writer scope, installed terms and explicit synthetic
reusable sharing scope allow a negotiated opportunity. Missing/unknown coverage
is not silently converted to a work offer: after qualification, an unseen input
can remain unknown and has no manufactured new implementation opportunity.

`components` stores a bounded immutable source/module package. `participation`
checks current terms and grant inside the pool transaction, then calls VF02
create/claim/checkpoint/submit. Submit and canonical admission commit together.
Duplicate proposals coalesce to the existing cell, retaining its current revision
and useful checkpoint. Current terms are checked even before idempotency replay;
grant expiry is checked after waits and before commit. Lease ownership remains
with VF02. Unfunded-request support in a generic client is not funding: this
installed profile admits voluntary work only.

The installed private worker reserves through VF03/VF04, commits a supervisor
claim, and for each heldout records planned child and process identity before
releasing bytes. It rechecks current cell/source/profile between cases. Full
VF08 observations and the projected VF03 receipt persist together. Passing exact
checks still goes through VF03's limitation review gate: a separate installed
machine scope reviewer verifies exact input digests, current runtime and all
real exits, then writes an actual budgeted native review decision. This reviewer
is owner-controlled, not a human approval click or an independent organization.
Publication uses the existing outbox and writes four input-specific observations;
there is no inputDigest-null observation for this portable profile.

Cold B sends only its task, environment and normal project access. The host finds
the asset, returns a pinned manifest, reserves invocation under the same physical
pool lock used by verification, and loads the stored exact module itself. The
client never provides A's ID, history, verifier, policy or executable path.
Raw unshared invocation input is retained only as a digest; the output required
for exact replay is retained. Cleared contribution proposals retain their explicitly
shared reproducer. Result and actual exit witness commit atomically. Before returning/replaying an
output, current grant, source, manifest and evidence are checked again. An output
recorded before a concurrent retraction remains audit evidence but cannot bypass
the final refusal. The CLI now supports `use`, `decline`, `contribute`, `resume`
and `reconcile`; a continuation is a locator, never a credential.

## Scheduling, bounds, recovery and rollback

Use the existing host scheduler/worker slot to call the private reserve,
supervise, reconcile, publish and `recoverPool` ports. Do not add a second queue or
public verifier/maintenance HTTP endpoint. Persist maintenance command IDs before
calling existing configureVerification/requestRevalidation ports. A cold process
may replay those commands; a visitor grant may not perform them. Run bounded
recovery on startup and at an installed interval with per-project fairness.

The portable per-project profile has one combined physical verifier/invoker slot,
16 outstanding candidates, 256 canonical candidates, 256 stored packages, four
receiver generations per candidate, one attempt per generation, 4,096 native
commands, 4,096 HTTP keys and 4,096 maintenance keys. Verification reserves four
case children: CPU 8,000ms, wall 16,000ms, 512MiB process address space, declared
cost cap 4,000 USD_MICROS. Aggregate caps include CPU 512,000ms, wall 10,000,000ms,
cost 256,000 USD_MICROS and 64 machine reviews/64,000 declared review-ms. Invoke
has at most 64 lifetime rows, each CPU 2,000ms, wall 4,000ms, 512MiB and declared
cost cap 1,000 USD_MICROS; lower installation caps are supported. These are finite
reservations, not measured spend or billing. Renewal/recovery never refunds them.

The Wasm guest has no imports/WASI/filesystem/network, fixed memory, fuel and
bounded input/output; fresh compilation, instance and process are used per call.
The existing VF08 process limits bound compile/runtime overhead separately from
guest fuel. OS address space is not RSS or cgroup containment. This does not
establish protection against a native runtime escape. Heavy must confirm actual
process isolation/shutdown on the receiving host before opening untrusted traffic.

SIGKILL after planned/identity/partial sample retains unknown physical outcome
and holds the slot. PID disappearance, timeout, heartbeat, cancellation or receipt
expiry is never exit proof. If all four durable observations already contain real
exits, recovery reconstructs the same result without rerunning and preserves the
last original observation timestamp. An invocation still durably reserved and
unclaimed can be closed under lock with no-launch proof; a late claim loses CAS,
its task remains unknown and its budget stays charged. Claimed invocations without
witnesses stay held. Production recovery needs the current host's actual process
supervisor witness/reconciliation facility; do not fabricate exit from elapsed time.

Stop admissions/dispatch before shutdown and allow supervisors to persist real
exits. Unmount/disable on rollback; keep cells, packages, observations, receipts,
retirements and charged reservations. Migration004 down refuses any portable
history, and migration003 retains its maintained-history guard. Do not use a down
migration to erase live/uncertain work. A previously accepted asset is unavailable
after expiry, retraction, withdrawal or policy drift until an explicitly authorized
new generation actually passes. Same artifact and original evidence remain intact.

## Smallest nonfinancial public-entry adapter: specified, not implemented

Current project creation is admin-only; owner-issued reader/writer grants and the
contributor-session pack do not constitute public signup. The adapter belongs in
the existing host and uses its existing project/grant store. Proposed concrete
boundary: `POST /v1/visitor-entry` accepts a bounded task, a random persisted
request key and an optional standing reusable-contribution scope. It returns a
short-lived ordinary reader grant and task result/continuation immediately. An
explicit voluntary contribution choice can obtain a writer grant limited to that
visitor's project/session; no public response ever contains an owner, operator,
runner or reviewer credential. Root must approve actual TTL and admission quotas
from the current host capacity rather than copying fixture defaults blindly.

Heavy should implement server-side idempotent enrollment against existing
primitives: bind the entry request to one project/grant receipt, apply global and
per-origin request/inflight/byte limits before creating tenants, and record expiry
and opt-in terms. Use existing private operator enrollment for the bounded pool;
a public caller cannot choose its evaluator, capacity, budget or trusted source.
Never return a shared demo writer/owner token. Public task access must not depend
on sharing, and contribution opt-out preserves the original task result. A
capability intended for reuse across visitor projects must be explicitly shared
through the receiver's existing scoped share mechanism. No implicit global source
visibility or cross-project grant authority is allowed.

Before enabling that adapter, add real tests for dropped entry replies and exact
recovery, duplicate entry requests, quota exhaustion before tenant creation,
expired/revoked grants, cross-tenant denial, decline without a cell, private-input
exclusion, accessible ordinary use and no operator-credential leakage. A writer
can currently submit arbitrary synthetic assertions within an owner-QA project;
opening the scope to real data needs explicit permission/data-class enforcement
and source handling. The adapter is not a new identity provider, payment rail,
reward promise, public verification service or authority for production migration.

## Read cost and next boundary

The repeated HTTP workload performs eight resolve/invoke pairs at each inventory
size, with actual publication concurrent with reads, and separately witnesses a
controlled PostgreSQL row-lock wait. Unrelated version rows are declared load
fixtures; they are not claimed contributions or demand. The small implemented
change deduplicates exact profile/config integrity checks within one graph read,
never across reads or physical launches. At 512 unrelated versions/five actual
publications, median resolve fell from 249.5 to 126.1ms and invoke from 1,611.3 to
1,010.6ms. Profile checks fell from 133.1 to 30.4ms per graph read. Snapshot building
still costs about 80ms; native journal replay during publication is about 5.8ms.
The raw before/after traces and synchronous timing definitions are retained.
These are short loopback runs, not production throughput or causal economics.

Keep one store now. If the actual host's measured latency budget later requires a
projection, implement a tenant/scope projection inside the existing database:
version it against graph, candidate/cell, verification-policy, share and admission
revisions; retain all negative/expired/retracted dependency evidence; expire at
the earliest relevant time boundary; recheck exact current authority at dispatch.
On an incomplete slice, missing revision or stale invalidation, report unknown and
fall back to the authoritative reconstruction. Do not claim complete inventory
from a truncated index. Freeze the same correctness corpus and mixed workload
before comparing such a change. It remains follow-up work, not this export.

## Acceptance and honest product claims

Root reviews this coherent receiving result once. Heavy then reproduces the real
host matrix: A useful miss/private execution/contribution, fresh B without hints,
restart, lost replies at all mutations, grant/terms races, negative component,
unknown outcome, zero-use observation window, incompatible composition, source
and runtime drift, expiry/renewal and unknown physical execution. Run base service
and homepage checks with the feature disabled as well. Preserve all historical
receipts and failed-run explanations.

Demonstrated: bounded, durable owner-QA contributed-code reuse and maintenance.
Remaining: actual-host mounting/isolation, public entry, independent source/build
attestation, independently authorized real users and broader evaluator scope.
No deployment, main merge, public release, paid resources or nested workers were
performed or authorized by this source assignment.
