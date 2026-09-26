# VF12 Heavy receiving delta: bounded entry to real reuse

Receive one exact final head from `codex/visitor-foundry-integration-20260926`.
Tested source is `f2b4ce6c3df23508774319350c72fbdbe8e852c0`; the final documentation
commit and exact source tree are recorded in `.scratch/vf12-export/export-receipt.json`.
This delta follows [VF09's hosting plan](VF09-HEAVY-RECEIVING-PLAN.md),
[VF10's received plan](../entry/HEAVY-RECEIVING-PLAN.md) and
[the executed result](ENTRY-RESULT.md). It supersedes their statements that entry
uses only an injected receiver or that visitors require owner-minted credentials.
It does not supersede F93, resource accounting, verifier isolation, source rights,
private recovery, evidence lifecycle or independent job ownership.

## 1. Source receipt and current-host boundary

VF09 input is `72d957522a0ef078955a25eab768a51bcfe770fb`; VF10 owned-module input is
`f207af75396b3fbf1b0c6e53b24bba825baf40cf`, imported at
`74e6a49fcf9e586c4e6fdd1c594eadfa3fc96a49`. The real binding checkpoint is
`089d52861841b58aae7aa4895ae7f776b682217a`. Fetch exact Git exports into Heavy's
own receiving branch and verify the final head/tree, bundle prerequisite,
archive, patch reconstruction and SHA256SUMS. Do not import VF10's assembled old
parents over the final shared receiver. Preserve earlier exports and branches.
No main merge, deployment, external account or resource purchase is authorized by
this document. VF11 remains separately owned; this change adds no replay cache.

The received VF10 plan records source inspection of SDS
`8c7968360d64cc36f3b89486e01293c6553927cc`, specifically
`server/lib/correspondence-mount.js`: it loads the canonical vendored service,
creates the PG store, assigns `state.app = service.createApp(store, config)` and
dispatches `/api/correspondence`. That is a historical source pin, not an assertion
about the currently deployed head/runtime. Heavy must compare its actual current
SDS source and Root's current-host note before editing that mount. Retain its
disabled/unavailable behavior, startup race handling, retry policy, and other
jobs. No alternative listener, host or homepage/product surface is needed.

Observed receiving runtime: existing Cursor Linux x86_64 VM, Node 22.22.2,
disposable PostgreSQL 16.15 with fsync/synchronous_commit enabled, separate HTTP
and CLI processes, Clang 18.1.3 and maintained VF08 Wasmtime 49.0.0. Final combined
tests exercise the actual `/api/correspondence` mount prefix. No deployed TLS,
reverse proxy, service manager, database or filesystem observation is claimed.

## 2. Package one canonical implementation

Keep the repo-relative layout required by `entry/src/deps.mjs`, integration,
VF01/VF03/VF05/VF08 and the maintained runtime. Extend VF09's already reviewed
vendoring to include both `scripts/visitor-foundry/entry/` and
`scripts/visitor-foundry/integration/entry/`, including migrations/examples.
Use the final receiving `services/correspondence` bytes, including migrations
001–004 and the trusted VF02 shared-transaction seam. Add
`migrations/visitor-foundry/005_vf12_entry.sql`; never replace newer shared files
with VF10's old parents. The CLI also imports `scripts/correspondence/`, safe-io,
and contribution helpers. Keep all imports pointing at the same canonical service
module so `ApiError`, store and transaction identity are not duplicated.

Rebuild the canonical vendored correspondence service using its locked dependency
workflow. Preserve the pinned runtime/wrapper/oracle/held-out files; runtime or
evaluator drift must make readiness fail. The source archive does not contain
node_modules, PG binaries or the private Wasmtime installation. VF09's setup and
pinned wheel/hash instructions remain required. The export includes the exact
3,356-byte Wasm artifact as a receipt, not permission to trust arbitrary uploads.
The host installs evaluation; a visitor cannot select or replace it.

## 3. Reserve finite resources before installation

Read `entry/private-profile.example.json` and `entry/host-profile.example.json`.
They are the tested choices: 12 private registrations with three event intents,
3,600-second grants and fixed 86,400-second workspaces; at most four contribution
allocations and one physical slot across them. The host profile derives the full
aggregate vector and immutable config ID from installed evaluator/runtime pins.
Each admitted registration charges one complete allocation before pool enrollment.
Do not decide quotas from caller aliases, task text or claimed identity.

The aggregate vector is in `evidence/entry/measurements.json`: verification
128,000 CPU ms / 256,000 wall ms / 64,000 USD_MICROS internal cost allowance,
16 machine reviews / 16,000 review ms; invocation 32 lifetime rows / 64,000 CPU ms /
128,000 wall ms / 32,000 USD_MICROS internal allowance. A shared slot is bounded to
512 MiB configured address space. Storage/command limits cover candidates,
packages, gaps, cells, HTTP receipts, native/maintenance commands and manifests.
Normal command exhaustion leaves at most one existing terminal cancellation per
cell. Nested submit/admit receipt counts are checked again before commit.

This vector bounds the new entry cohort in one correspondence namespace. It is
not a measurement of all memory/CPU on the host and does not reserve resources
for unrelated owner pools or independent jobs. Debit this explicit additional
reservation against Heavy's existing total host envelope before enabling it;
preserve the other allocations. If that envelope cannot supply it, leave this
addon uninstalled/disabled. Do not increase host size or spend under this task.
Internal USD_MICROS limits are accounting caps, not payment or a spending request.

Connection accounting is separate: combined tests use base=1, entry=2,
VF02=2, VF04=2 pools per HTTP process; two hosts plus the private receiver stay
inside the disposable 24-connection maximum. Heavy must reserve its process-count
multiplier and worker connections against the existing PG envelope. Do not treat
one pool's `poolMax` as the complete service budget. HTTP rate/body/CORS/trust-proxy
limits stay with the existing service; bounded POST bodies use VF09's 524,288-byte
host parser limit and narrower operation limits.

## 4. Explicit migrations and immutable profile installation

Perform this only in an independently authorized disposable/staging environment;
Root separately owns any production migration. Startup imports do not migrate.
Back up/inspect the existing namespace and serialize the private migration pass.

1. Apply the canonical base correspondence migrations and VF02 migration through
   existing methods. Apply final VF04 migrations 001–004 through its existing
   boundary method. These remain additive and preserve history.
2. Call `EntryStore.migrate()` for VF10 001 plus 002. Migration 002 snapshots the
   original profile and receiver ID on old registrations before installing any
   addon. It does not change the original profile, max_enrollments or charged.
3. Call `EntryReceiver.migrate()` for 005. This creates the singleton immutable
   host profile and registration-bound allocation table. It is deliberately not
   part of a default VF04 migration because it requires VF10's tables.
4. For a new namespace, install the explicitly selected original private profile
   with receiver disabled. For an existing installation, use its original exact
   profile/terms; do not apply an example over it or relabel it as a fresh cohort.
5. Bind the real `EntryReceiver` and call `entry.enableContribution({expectedTerms,
   id:'vf10:contribution-v2', binding:receiver.binding()})`. This holds the existing
   installation lock and atomically installs the host reservation configuration
   and addon profile. A different addon or changed config is refused. An existing
   non-disabled incompatible receiver is refused and needs its own reconciliation;
   there is no force/replace switch.
6. Record hashes, original charged count, active terms, config ID and aggregate
   vector. Re-run installation exactly to prove idempotence and compare counts.
   Never delete rows, reset charges, rotate profile IDs or transplant one namespace
   to manufacture fresh capacity.

Private installer sketch using the canonical mounted objects, before serving:

```js
await mounted.extension.cells.migrate();
await mounted.extension.integration.migrate();
await mounted.entry.migrate();
await mounted.receiver.migrate();
// For first installation only, or exact replay of the original private profile:
mounted.entry.receiver = null;
const original = await mounted.entry.install(originalPrivateOptions);
mounted.entry.receiver = mounted.receiver;
await mounted.entry.enableContribution({
  expectedTerms: original.termsHash,
  id: 'vf10:contribution-v2',
  binding: mounted.receiver.binding(),
});
await mounted.checkReady();
```

This is a trusted local installation operation. None of these methods gets a
public route or an operator bearer key. Grants are created only by VF10's existing
registration transaction using native PostgresStore methods; the receiving owner
does not mint A/B credentials. A failed installer must close its local pools.

## 5. Replace the existing app mount, preserve lifecycle

At the current SDS `tryEnable` seam, after obtaining the existing base store and
config, use `createEntryReuseMount` instead of mounting raw `createApp` alongside
it. Pass installed configuration and the existing private participation key.

```js
const mounted = await createEntryReuseMount({
  enabled: true, databaseUrl: config.databaseUrl, schema: config.pgSchema,
  correspondence: store, config: { ...config, bodyLimitBytes: 524288 },
  hostProfile: installedHostOptions, participationKey: existingPrivateHostKey,
  poolMax: 2,
});
await mounted.checkReady();
state.app = mounted.app;                 // existing /api/correspondence dispatch
state.entryReuseMount = mounted;         // existing shutdown/startup-failure paths
```

The mount creates no listener, performs no migrations/installation and starts no
worker. It serves the bounded correspondence proxy first; the visitor scope gate
runs before the canonical foundry router. Mounting a raw correspondence app in
parallel would bypass event reservations and is invalid while visitor grants
remain active. Case variants of work-cell/foundry paths retain the scope gate.

SDS startup must check the addon as well as base storage. Its recurring readiness
must compose the original `store.checkReady` with `mounted.checkReady`; preserve
the original bound method to avoid recursion. Existing base `/healthz` alone is
not a proof of addon configuration. Close `state.entryReuseMount` before
`state.store` in shutdown and startup failure, including local objects that have
not yet been assigned. Preserve SDS closed-state races and all other applications.
Drain/stop supervision according to the existing durable reservation contract;
process shutdown or timeout is not proof that a child exited.

## 6. Cold client authority and bounded public routes

Distribute only the existing endpoint, task and previously authorized exact scope/
entry terms/contribution terms to the controlled visitor. It owns its 0600 private
continuation directory. Reading a descriptor does not confer consent. Use
`entry/visitor.mjs`; it needs no host key, owner grant or manual A/B token issuance.
The entire existing VF05 session and actual VF09 builder are reused.

VF10 proof and entry attempt are fsynced before POST. Both terms are persisted,
and the VF05 HMAC identity uses an explicit separate purpose including registration
and both terms. Its seal still binds canonical prefixed origin, tenant and grant
fingerprint. Mutation intents are durable before send. Exact invocation requests
and manifest IDs are persisted before invocation, permitting fresh-process replay
without another execution after lost ACK. Public hints carry only a cell ID.

Only the necessary bounded foundry routes pass the visitor gate. New sharing
requires current writer authority plus `x-foundry-entry-terms` and
`x-foundry-contribution-terms`, also checked against the immutable host binding.
Canonical methods check current contribution terms and grants within the same
transaction after lock waits. There are no public install/enroll/verify/publish/
revalidate/configure/funding endpoints or direct work-cell mutation escape.
Never put profile files, proof, bearer headers, private event text or local client
state into a public sidecar or access/APM log.

Anonymous decline writes nothing and returns `continue_original`. A refused
contribution allocation still gives the already charged private workspace. Changed
terms do not revoke private correspondence or silently grant new sharing consent.
Expired grants renew only through the same registration/proof; IDs, scope and
workspace deadline are unchanged. Revoked grants cannot renew. Withdrawal uses
existing canonical cancellation authority; expiry/revocation may require trusted
host withdrawal under the original policy, never newly minted public authority.

## 7. Private recovery and lifecycle table

| Durable state | Allowed private action | Capacity effect |
| --- | --- | --- |
| Entry charge, project or grant commit lost | Reconcile exact saved entry attempt/proof | Reuses native rows; no new charge |
| Begin marker committed; no admission | Read reports unknown; `receiver.recover` writes declined tombstone | No invented pool; delayed begin fenced |
| Admission pending and charged | `receiver.recover` completes exact canonical enrollment transaction | Existing reservation retained |
| Pending allocation expired | Recovery declines | Full allocation remains charged |
| Enrollment committed; response lost | `receiver.read`, then exact entry reconciliation | Same project, grants and pool digest |
| VF05 mutation ACK lost | Reconcile persisted sealed intent, then read current cell | Same native receipt/admission |
| Invocation reserved, never claimed | Existing `recoverPool` proves durable no-launch | Physical slot freed; lifetime charge retained |
| Claimed child identity; no full exit/outcome | Existing private supervision/readback only | Slot remains held; no PID/timer inference |
| All child exits/results committed | Existing canonical reconcile/publish | No new execution; exact existing generation |
| Evidence expired/retracted | Existing operator `configureVerification` / `requestRevalidation` | New bounded generation, old history preserved |
| Source withdrawn | Existing cell cancellation and graph invalidation | No further discovery/invocation/publication |

`receiver.read` and `receiver.recover` take `{registrationId,projectId}` from
trusted installed operations and prove the charged request and configuration.
They are never public methods. Do not reset `receiver_started`. A read failure or
missing row is unknown, not ready. A stale ready marker with mismatched current
pool proof reports unknown; repairing the exact configuration restores readback.
No automatic replay of `begin` exists. Host cleanup/archive is a separate policy,
not a reason to delete charged history or drop migration tables.

Within the admitted cohort, canonical pool locks take the global host reservation
lock before pool locks; reserve/invoke count actual outstanding attempt/invocation
rows across all entry projects. Do not create another scheduler or release slots
from elapsed deadlines. Source-sharing rows expose only accepted reusable code/
evidence across the installed cohort, not private correspondence or grant tokens.

## 8. Acceptance before any separately authorized activation

Reproduce the 345-test receipt set in `evidence/entry/verification.json` against
Heavy's packaged bytes. First build correspondence. Run the VF12 PG runner and
VF10 entry suite, then all affected prior suites listed in ENTRY-RESULT. Supply
`VF10_PG_BIN` and `VF05_PG_BIN` separately when using the existing extracted PG16
binaries. Missing PG/runtime/toolchain fails acceptance. The VF09 drift suite must
run separately from portable runtime tests because it intentionally modifies and
restores runtime/oracle files. Preserve historical receipts in isolated directories.

Required hosted staging acceptance adds the actual SDS lifecycle and transport:

- Existing prefix/proxy/CORS/body/rate behavior; disabled addon leaves independent
  jobs healthy; no raw app bypass; startup-failure cleanup and repeated shutdown.
- Preexisting v1 records/grants/charges survive addon migration. Wrong terms or
  aliases refuse; repeated install/restart/secret changes never reset either cap.
- Cold A and B begin with no project/grants, run separate CLI processes, and retain
  private checkpoints. A contributes the exact permitted source; the private
  host verifies it; fresh B discovers and uses it without A's candidate ID.
- Repeat real process deaths on both sides of the entry/admission/enrollment
  commits and each VF05 mutation. Compare actual PG registration/project/grant/
  pool counts and full invocation/child witnesses after exact reconciliation.
- Two host processes concurrently exceed the installed total admission cap.
  Cross-project verifier/invocation contention respects one shared slot; unknown
  claimed work continues to hold it. Original private service survives declines.
- Exercise current terms and grant expiry after lock waits, revocation, foreign
  grants/hints, receipt/gap/manifest exhaustion, transactional submit rollback,
  explicit evidence renewal and source withdrawal. Do not infer business demand
  or global compatibility from these controlled tests.

Retain exact source/tree, config/terms, migration counts, PG settings, process
identity/exit receipts, outputs, unknown/refusal states, resource reservations and
actual measured usage. Measured CPU/wall/fuel/RSS are reported separately from
financial cost, which remains unknown. The receiving VM trial observed four
verified and four cold-use child exits with exact outputs; it is not a production
capacity certification.

## 9. Availability rollback and handback

Keep the bounded correspondence facade for existing visitor grants. To stop new
entry/contribution admission, disable those routes through the existing host
availability control, preserving the database. Keep private correspondence within
its original caps until grant expiry or authorized revocation. Do not restore a
raw base app over live visitor grants. Do not drop 002/005 or reset installed
budgets; there is no destructive down migration. Already claimed work still needs
real exit reconciliation, and published source needs the existing withdrawal/
evidence policy rather than silent deletion.

Return to Root one exact SDS receiving head, the accepted Neo export head/tree,
packaging diff, resource reservation decision, staging tests and any precise
current-host mismatch. Root decides later activation. This task's delivered result
is tested source and this executable receiving delta only.
