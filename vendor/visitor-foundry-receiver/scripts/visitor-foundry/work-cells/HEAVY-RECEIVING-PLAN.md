# Heavy receiving and deployment plan — VF02

This is an integration handoff for the receiving Heavy/VF04 owner. VF02 is an
implemented source foundation, not an already hosted feature. It changes only
`services/correspondence/src/visitor-work-cells/`, its uniquely named migration
subdirectory, and `scripts/visitor-foundry/work-cells/`. Existing homepage,
correspondence entrypoint, paid-work kernel and other founder paths are unchanged.

## 1. Receive the exact source and independently establish the baseline

Use the branch/commit and remote object verification recorded in RESULT/final
handoff. Starting source is Neomorphic
`28924aac2a33cdf58bc9049a2198ab1ce9866f0f`. Do not cherry-pick only documentation:
receive the full extension, migrations, test harness, client and evidence.
The branch has several checkpoints; merge the final branch or cherry-pick its
whole commit range. No new account login or public release is required.

```sh
git fetch origin codex/visitor-work-cells-20260926
git diff --stat 28924aac2a33cdf58bc9049a2198ab1ce9866f0f..origin/codex/visitor-work-cells-20260926
git diff --check 28924aac2a33cdf58bc9049a2198ab1ce9866f0f..origin/codex/visitor-work-cells-20260926
npm ci --prefix services/correspondence --no-audit --no-fund
npm run build --prefix services/correspondence
node scripts/visitor-foundry/work-cells/run-local.mjs test
node scripts/visitor-foundry/work-cells/run-local.mjs demo
node scripts/visitor-foundry/work-cells/run-local.mjs regression
```

Use README's private PG extraction or explicitly set VF02_PG_BIN. All three
commands create their own disposable cluster, so the original correspondence
schema-isolation tests cannot touch the host service database. Run benchmark
separately from other tests and busy host jobs. Compare *outcomes* as well as
latency; shared hardware will not reproduce the exact recorded timings.

Receiving acceptance:

- Current service build passes; focused suite and original service suite pass
  against actual PG without skips. Recheck source pins if service grants/schema
  changed after September 26.
- One live lease under contention; stale session cannot checkpoint/renew/submit;
  expiry/revocation permits authorized takeover with checkpoint intact.
- Kill the HTTP process, reload using a newly authorized session, reconcile a
  lost response, and submit without replaying a conversation.
- Foreign tenant/reader/expired grant cannot mutate. Independent same-project
  cells progress while a different cell row is deliberately locked.
- Synthetic fixture receipt cannot be confused with production authority. A
  mounted production resolver must come from the VF03 trust boundary.

## 2. Align the VF01/VF03 seams before enabling a route

VF02's exported validators are the exact accepted contract, not a requirement
that other owners rename their native types. Add receiving adapters with explicit
provenance mapping. Keep their source pins with the composed experiment.

| VF01 fact | VF02 projection | Receiving obligation |
| --- | --- | --- |
| gap identity | gap.id | retain exact opaque namespaced ID, do not mint an unrelated package identity |
| immutable gap/version identity | gap.revision | digest the immutable descriptor; preserve original version in the referenced descriptor |
| matching/miss snapshot | gap.resolverSnapshot | immutable URI+digest pointing to full authorized provenance |
| permission-cleared reproducer | gap.reproducer + permission | preserve synthetic/authorized-reusable classification; remove private visitor input before projection |
| funding classification | gap.fundingKind | only voluntary/unfunded-request here; do not infer money from listing, examples, model tokens or acceptance |
| visitor chosen subtask | workScope | stable declared scope, not automatic all-to-all fanout |

Create a cell only as the visitor's explicit optional continuation. A successful
service use, resolver hit, or visitor declining to contribute still completes its
normal flow. A gap can remain an unfunded request indefinitely. No claim UI may
present a work-cell lease as a paid-work reservation or reward entitlement.

For VF03, implement a host-owned `ReceiptResolver` that looks up an already
admitted immutable result. It receives the exact cell and submission (including
source and artifact digests). It must:

1. Resolve only through the configured VF03 admission store/client; never fetch a
   caller-controlled URL as executable policy, and never trust receipt JSON posted
   by the contributor. Verify the passed reference URI and digest against that
   store's admitted receipt.
2. Preserve exact candidate revision, artifact digest, submission/cell/project,
   evaluator policy/version, execution assignment identity, environment,
   limitations, outcome and next step. If identity or independence is unknown,
   preserve that uncertainty; do not upgrade aliases to independent operators.
3. Apply VF03's capacity/budget/dedup rules before returning accepted/rejected/
   deferred. The VF02 callback is a lookup, not a new verification scheduler.
   Respect its 750ms abort signal and avoid unbounded downstream work.
4. Map a genuine backlog to deferred with a concrete next step/retry interval.
   The work cell remains submitted, without retaining a worker lease. Repeated
   exact VF02 retries return the prior receipt without calling the adapter again.
5. Keep registry publication/recommendation/promotion and later invalidation in
   VF01/VF03. VF02 accepted is a historical candidate disposition, not universal
   capability safety or perpetual validity. Do not overwrite history when later
   evidence invalidates a capability.

Known self-contributing owner grants are rejected before receipt lookup. Recorded
contributor grant IDs are checked against executionIdentity, but identity aliases
can evade equality; trust must derive from VF03's independent assignment, never
from this string comparison alone. If no trusted resolver is installed, leave it
undefined and accept 503 verification_unconfigured as the honest next step.

## 3. Prepare schema and connection budget on the existing host

Use the same Postgres database and namespace as correspondence. The shared SDS
host uses `pilot_correspondence`; preserve its existing mounted URL/schema
validation. No VF02-specific server, database vendor, identity store or event
journal is needed. Establish the base migration before applying VF02.

Inventory per-replica connection counts first. This extension owns a bounded
additional pool (1–4, proposed 2); it cannot access the existing store's private
pool without changing another owner's internals. The test configuration used
one base + two VF02 connections per process, two processes total. On the actual
host account for all existing pools, replicas, migration clients and reserved
connections. Start at one or two VF02 connections; do not enlarge pools based on
128 offered HTTP clients. Pool acquisition is 3s, DB statements 3s, lock wait
1.5s, idle transaction 5s, in-process admission 128 pending operations per store.

Before schema changes, export/backup the selected schema, inventory existing
correspondence tables and estimate the idempotency table/index size. The additive
migration creates one projection table and one partial unique index on existing
idempotency receipts. It does not modify existing event kinds, grants or projects.
The ordinary index build may block writers; the built-in short timeout may fail
on a large existing table. Use a quiet deployment window. If Heavy needs an
online concurrent index build, review that as a separate migration change and
verify its predicates/uniqueness; do not remove timeouts blindly.

```sh
# Environment supplied by existing secret management; never echo the URL/token.
# CORRESPONDENCE_DATABASE_URL and CORRESPONDENCE_PG_SCHEMA must both be explicit.
node scripts/visitor-foundry/work-cells/migrate.mjs --apply
```

The CLI applies only the extension migration. It does not bootstrap the base
schema or expose routes. Its migration path is relative to the built extension;
shipping `dist/` without `migrations/visitor-work-cells/` will fail. Include the
SQL directory in the existing service artifact/container image. Build and package
checks should assert both files exist. Repeating migration is tested.

## 4. Mount and stage the existing service

Add a receiving-owned feature flag, disabled by default. Under that flag, build
`WorkCellStore` with the validated database/schema, selected pool budget and
trusted VF03 resolver. Call `cells.checkReady()` before accepting work-cell
traffic. Mount `createWorkCellRouter(cells)` **on the existing createApp result**
so base JSON limits, CORS, rate limiting and proxy rules already ran. Prefix is
`/v1/projects/:projectId/work-cells`; existing reverse-proxy mounting may prepend
the service prefix. Keep the complete prefix in client baseUrl/config.

The source fixture demonstrates mounting, but `tests/fixture-host.mjs` and its
`VF02_FIXTURE_RECEIPTS` resolver are local tests only. Do not ship or mount them
as production entrypoints. No new public listener is part of the receiver plan.

Wire host lifecycle explicitly:

- Readiness aggregates base store plus `cells.checkReady()`; existing `/healthz`
  only probes the base and must not be cited as proof VF02 migration is ready.
- Shutdown stops intake, drains bounded requests, then closes both stores. A hard
  process kill rolls back unfinished transactions; ambiguous commits use exact
  retry. No journal replay into a second store is required.
- Keep 24KiB command ceiling (base transport ceiling is 32KiB), bounded 50-receipt
  page maximum, and existing CORS/admin bootstrap restrictions. Configure host
  rate limits intentionally; the benchmark's 20,000/min fixture limit is not a
  production recommendation.
- No automatic execution of artifact/testProposal/checkpoint content. Keep
  private inputs out of project-visible checkpoint summaries and reusable refs.

Canary using a project with synthetic fixtures and short-lived writer/reader
 grants. Exercise create → claim → checkpoint → transfer/restart → submit;
verify submitted remains distinct from accepted. Try expired/revoked/foreign
credentials and a stale fence. Wire actual VF03 only after negative receipt
admission checks pass. Then enable for an explicitly bounded voluntary pilot.

## 5. Compose the receiving two-visitor experiment

1. Visitor A tries maintained existing capabilities through VF01. A compatible
   hit ends normally. A genuine supported gap offers optional contribution.
2. With permission-cleared inputs, create/pin the gap and chosen scope under the
   existing correspondence project. Issue a project writer grant using existing
   owner authority; no wallet or paid-work credential is needed.
3. Visitor A persists its attempt before each mutation, claims with
   voluntaryOptIn:true, and checkpoints an immutable synthetic artifact. Every
   mutation binds revision; lease writes also bind fence.
4. For explicit handoff, the owner authorizes the receiving session, the live
   holder transfers to that grant after checkpointing, and the new holder reloads
   from the service. For crash recovery, wait for expiry or owner revoke, then
   fresh-session claim. Grant revocation and lease expiry are separate clocks;
   expiry is capped to grant lifetime. Do not share the original token as a
   substitute for session transfer.
5. Submit the exact source/artifact/rights/test proposal/checkpoint. Use
   WorkCellClient's persisted attempt and exact reconcile after unknown outcome;
   do not turn a dropped response into a new key or assume an empty 201 succeeded.
6. Independently assigned VF03 verification records its result; the trusted host
   attaches the immutable receipt with the current work-cell revision. Backlog
   stays submitted and returns a usable next step. Rejection/cancellation remain
   explicit terminal history.
7. VF01/VF03 publish/promote only under their separate validated rules. A distinct
   later Visitor B resolves the accepted capability version for a separate task.
   Record VF03's reuse observation, relationship, effort/cost and outcome source.
   VF02's cold demo proves handoff/restart, not this final useful-reuse result.

Execute one deterministic composed fixture and then one held-out task before
claiming an end-to-end hosted network. Preserve owner-controlled versus independent
operator labels, unknown cost, uncertain independence and private-input rights.
Downloads, HTTP operations and synthetic acceptance are not revenue or usefulness.

## 6. Observe, rollback and maintain

Record operation/action/status, latency, conflict codes, pool saturation, lock
waits, stale-fence denials, expired grants, receipt backlog and process restarts.
No raw tokens, SQL URLs, private input payloads or artifact contents in logs.
Measure accepted **mutations** separately from accepted **contributions** and
from later reuse. Sample bounded per-cell replay for incidents; no broadcast scan
of all conversations is needed. Alert on unconfigured verification in an enabled
flow and on sustained 503/lock-wait backlog, not just healthz.

First rollback is to disable/unmount work-cell routes and drain/close its pool;
leave data in place. Existing correspondence can continue on its original schema
and events. Already issued grants remain governed by existing owner controls.
Capture current projections and all `vf02:cell:%` idempotency rows together before
any destructive database reversal. Restoring only projections or deleting keys
breaks replay/dedup. Never truncate the shared idempotency/event tables.

If an approved teardown requires deletion, execute
`services/correspondence/migrations/visitor-work-cells/001_vf02_work_cells.down.sql`
in the explicitly selected namespace after all VF02 writers stop. It deletes
only `vf02:cell:%` receipts, its index and projection table. The disposable
reversal test verifies base grants and an unrelated sentinel survive, then
reapplies the up migration. This is destructive to work-cell history; archive
and restoration rehearsal precede it. No production reversal was run in VF02.

Current limitations requiring receiver decisions:

- Existing project grants are the entire authorization boundary; no per-gap ACL
  or organization identity expansion. Use distinct projects for privacy scopes.
- Lease holder equality is session authority, not proof of different people.
  Handoff has a 32 contributing-session cap. Transfer receivers need an owner
  issued grant for that intended handoff; this foundation has no separate
  invitation/acceptance UX.
- Receipt snapshots/key history grow with mutations. Read pages are bounded but
  disk retention is not. Plan quotas/archival without deleting dedup tombstones;
  this foundation does not add a global scheduler or collector.
- No list/search UI, notifications, execution sandbox, real VF03 integration or
  registry publication is deployed. VF01 retains cell IDs or derives them with
  exported cellIdFor; discovery remains its responsibility.
- Accepted/rejected/cancelled cells are terminal; revisions/appeals need a new
  declared scope and preserved refs. Later capability invalidation lives in
  VF03/VF01, not an in-place rewrite of the historical acceptance.
- Benchmarks are short bursts of 128-byte claim commands. They do not measure
  hours of load, WAN latency, disk-failure recovery, artifact verification cost,
  database failover, production capacity or useful network effects.
