# Heavy receiving implementation plan — VF01 into VF04

This is remaining implementation work, not a claim of hosted acceptance. VF01
is executable and tested locally on the assigned Cursor VM. VF02/VF03 retain
their owned paths and authority. No changes to those paths, public routes,
payment flows or deployment were made by VF01.

## 1. Receive the isolated foundation and freeze the cross-module contract

1. Fetch `codex/visitor-capability-graph-20260926`; inspect the final RESULT and
   `git diff 28924aac2a33cdf58bc9049a2198ab1ce9866f0f..HEAD --stat`. All committed
   changes must be under `scripts/visitor-foundry/capabilities/`. Apply the branch
   commits to the receiving integration checkout; if main has moved, resolve only
   additive import/path conflicts and rerun the commands below. Do not replace
   S04's catalog with the demo inventory.
2. Run `npm test --prefix scripts/visitor-foundry/capabilities`, `npm run demo
   --prefix scripts/visitor-foundry/capabilities`, and `npm run holdouts --prefix
   scripts/visitor-foundry/capabilities`. Keep the exported snapshot/request/policy/
   gap/verification-target examples as the first sibling compatibility vectors.
3. Read actual accepted VF02/VF03 exports before modifying sibling code. Bind
   their references to VF01's `{capabilityId,version,contentId}` and its
   `snapshotId/resolutionId/policyId` fields. If a sibling uses a different field
   name, add one boundary mapping in receiving integration, not parallel IDs or
   a second semantic implementation. Export and fixture-test that mapping.
4. Reserve authenticated envelope authority explicitly: VF01 owns usability and
   manifest identity; VF02 owns voluntary cells/leases/fencing; VF03 owns receipt
   admission, verification capacity and promotion; existing earned-work/payment
   modules own money. VF01's `reuse-observation.v1` producer is a synthetic
   example, so reconcile it with VF03's final incoming schema rather than making
   it a second authoritative reuse ledger.

Deliverable: receiving contract tests that import all three accepted modules,
round-trip VF01 examples and fail on revision drift, missing source/content pin,
misclassified fixture, forged admission policy and unknown-as-gap conversion.

## 2. Materialize from existing catalog and artifact evidence

Existing source seams verified on the base pin:

- `scripts/scale-lab/capability-market/src/catalog.mjs`, `validate.mjs`,
  `match.mjs`, `journey.mjs` supply catalog, input checks, match/correction and
  disclosures. Site wrapper is `scripts/capability-market/index.mjs`.
- `src/pages/api/lab/capabilities.json.ts` currently returns a static
  `neomorphic.capability-market.v1` fixture-clock document. Browser page is
  `src/pages/lab/capabilities.astro`. Both remain unchanged in VF01.
- `packs/capability-preflight/src/trust.mjs` keeps claims, content binding,
  execution and acceptance separate; `SOURCE.txt`, `LICENSE`, package metadata
  and imported SOURCE-MAP retain the original Pilot lineage.

Implement a **server-only materializer** adjacent to receiving integration:

1. Read S04 records at one explicit source revision and call `adaptS04` with
   authoritative rights and environment declarations. Preserve all adapter
   disclosure objects, original source IDs, historical/demo flags, actionability,
   funding kind and quote time. Unsupported declarations enter a rejected-source
   report; do not silently remove their constraints to get hits.
2. Seed maintained reusable packages by their existing npm/source coordinate and
   full repository revision through `adaptPackage`. Compute/verify actual artifact
   bytes in the VF03 runner; the VF01 manifest hash is not a downloaded-byte hash.
   Validate MIT scope using the preflight sample allowlist; do not extend it to
   company assets or unrelated packages. Rights unresolved means unknown.
3. Load authenticated observation/mutation envelopes and references from the
   existing correspondence-backed integration. Validate then `createSnapshot`.
   Mark coverage complete only for fully ingested outcome scopes at the pinned
   event high-water mark. Failed or truncated ingestion must set incomplete.
4. Publish immutable snapshot artifacts with provenance back to that source and
   high-water mark. Persist/cache snapshot ID, source hash and last applied
   correspondence sequence. Do not use mutable URLs as identity or infer funding
   from quotes, OPEN labels, model tokens or historical awards.

Acceptance: replaying identical records in shuffled/overlapping pages produces
one snapshot ID; unknown input semantics refuse; an old demo advertisement with
a price never becomes an actionable funded job. After restart, the same event
prefix reconstructs identical content and scope.

## 3. Persist projections in the existing correspondence service

The current service exposes `/v1/projects/:projectId/events`, grants, replay and
idempotency through `services/correspondence/src/app.ts` and
`src/store/{types,postgres,memory}.ts`. Existing SQL tables are
`correspondence_projects`, `correspondence_grants`, `correspondence_events`,
`correspondence_idempotency` in migration `001_init.sql`. Event kinds are bounded
(`request,reply,artifact,correction,needs_human,resolved,reopened`), text is 8,000
characters and artifact URLs 2,048. A full snapshot does not fit an event's text.

Implementation order:

1. Reuse VF02's accepted extension/transaction boundary; inspect its actual table
   names and migration numbering first. Store permission-cleared immutable JSON
   artifacts in the existing artifact host or Git-backed package surface, then
   append existing `artifact` / `correction` references with small metadata.
   Do not inject arbitrary event kinds without changing the existing schema and
   shared validation through the receiving owner.
2. Add derived indexes in the same Postgres database only if VF02 does not already
   provide them. Logical keys: `(project_id,capability_id,version)` with unique
   content ID; `(project_id,observation_id)`; `(project_id,target_key,revision)`
   with previous mutation ID; reverse dependency index over exact child reference;
   `(project_id,scope_id,snapshot_id)` cache with high-water mark and coverage.
   These are reconstructible projections of the existing event/artifact history,
   not another registry or authoritative event store.
3. Within one project-scoped transaction: compare `expectedSnapshotId`, validate
   immutable IDs and mutation predecessor, append authorized event/reference,
   update derived projection, save response to existing idempotency mechanism.
   Same key + same canonical body returns stored response; same key + changed
   body is 409; stale snapshot/predecessor is 409 and caller reloads. Use row locks
   on affected projection/cell, never a process-global lock.
4. Authorize all reads/pages and writes by existing project grants. Reader sees
   only that project's permitted projection. Lifecycle mutation requires
   maintainer/owner authority, observations require VF03 provenance, and original
   private task input stays outside public projection. Public curated views use
   an explicit publication allowlist, not all project grants.
5. Keep stable old snapshots available for a documented cursor TTL. Cache
   resolution by `(snapshotId,requestId,policyId,now)` with a policy-owned time
   slice that never spans the nearest evidence expiry. Authenticate before cache
   access and include tenant/publication scope in the cache key. Expiry changes
   verdicts without changing snapshot bytes; wrong clock must invalidate cursors.
6. Use `dependencyImpact` to schedule local reprojection of changed exact versions
   and dependents; persist checkpoint/high-water mark after each bounded batch.
   Recompute after evidence expiry as well as event writes. Schedule work through
   VF02/VF03 bounded queues, not direct all-to-all messages. A failed replay marks
   freshness unknown until restored; never retain a stale compatible answer.

Required remote PG tests: crash/restart between event and cache writes; duplicate
request retries; two concurrent corrections to one target (one wins); unrelated
project writes proceed; denied/revoked grants cannot read cursors; projection
rebuild after cache deletion; 100-item pages with duplicated source pages; snapshot
replacement during cursor traversal; expiry at exact boundary; reverse-dependency
fanout bounded by admitted verification capacity. Collect offered/completed work,
p95 latency, conflicts, queue delay and CPU/memory separately. No throughput or
commercial claims before these runs.

## 4. Admit verification without letting contributors supply authority

1. VF02 contribution records reference the exact Gap, source revision, artifact
   digest, rights, known limitations and proposed tests as data. Pass
   `verificationTarget(snapshot,target)` to VF03. The target has no automatic
   execution hook and no promotion flag.
2. VF03 assigns execution identity outside contributor control and records policy
   revision, environment, observed time, expiry, exact target and outcomes. Do not
   accept request-provided `observerId`, `admittedObservationIds`, `accepted:true`
   or preflight binding as authority. Validate the result against authenticated
   assignment and candidate revision before deriving a VF01 observation.
3. Scope a positive observation to exact input digest unless the evaluator policy
   actually establishes whole-contract coverage. Exact environment keys are
   required. A new environment remains unknown until measured. Proposed tests
   must be reviewed as data and translated into runner-owned checks; this wave
   supplies no arbitrary contributed-code sandbox.
4. Store VF03 admission decision IDs and construct the server-only policy list.
   Positive and negative observations use the same authentication boundary.
   Corrections retain original receipt refs and move through a revision stream;
   replacement must retain exact version/scope. Scope changes require explicit
   retraction plus a separate observation. Unadmitted negatives cannot poison hits.
5. On dependency negative/expiry/retraction/correction, set affected parent
   composition evidence stale. Queue a new independent composition check. Do not
   classify it as universally incompatible without invocation mapping. A receipt
   strictly after the change may restore usability; a revoked dependency requires
   a newly pinned version. Promotion and registry acceptance remain VF03 decisions.
6. Observe VF03 backlog/risk policy: deterministic low-risk replay may proceed
   without Root approving every event, while ambiguous rights/high-impact scope
   use its review path. Return backlog/decline next steps; do not bypass capacity
   by placing a passing-looking receipt in the snapshot.

Required adversarial tests: forged/self-authored receipt, aliased contributor and
verifier, mismatched candidate revision, broadened input scope, missing environment,
old admitted receipt after dependency change, duplicate submission budget reuse,
conflicting receipts with equal timestamps, replay after retraction, and a clean
unrelated capability version still resolving.

## 5. Connect existing discovery and voluntary work cells

1. Add a server-only projection import to the existing API/service integration.
   Avoid re-exporting Node crypto/filesystem into S04's browser bundle. Keep the
   current catalog schema/fields and disclosures; add an opt-in `foundry` envelope
   or response negotiation for qualified resolver metadata. Do not silently
   replace S04 outcome-overlap semantics with VF01's exact single-outcome query.
2. Use the existing correspondence host for authenticated dynamic resolution,
   following its grant/body-limit/CORS conventions. A receiving handler may be
   `/v1/projects/:projectId/capabilities/resolve`; this is a proposed addition,
   not an endpoint implemented here. Server obtains `now`, inventory, publication
   scope and admitted policy. Client sends only bounded request and cursor.
3. Display usability and original actionability separately. Compatible demo means
   a usable demo. Known incompatible includes exact reason/target; unknown asks
   for missing environment/verification; missing identifies snapshot scope and
   source pin. Stale quotes remain visible in their existing price lane.
4. Only after explicit visitor opt-in and permission-cleared reproduction call
   `createGap`, then the accepted VF02 cell API with the same Gap ID/content digest
   as idempotency key. Unknown and partial ingestion cannot create a genuine-gap
   claim. A voluntary contribution is optional; a compatible service remains
   usable without contributing. Default voluntary funding is not a payout promise.
5. Map `candidateFailures` to the cell's constrained work description and retain
   `resolver` pins. Store the authorized reproducer reference rather than private
   request inputs. Checkpoint/resume/lease/fencing continue through VF02; never
   duplicate its lifecycle or earned-work ledger inside the resolver.

Acceptance: browser and machine callers see the same typed verdict/provenance;
unknown has an information-gathering continuation, scoped miss has optional
voluntary contribution, and existing demo/historical/unfunded labels survive both.
Repeat H15's historical/demo-as-actionable regression at this composed boundary.

## 6. Complete the two-visitor receiving experiment

Use one owner-controlled project first, then label independent operator runs
separately. Do not count the fixture as external demand.

1. Freeze existing catalog, rights, coverage and independent evaluation policy.
   Visitor A requests a supported-class behavior absent from that scope (for
   example a separately declared compound-engine-range behavior, beyond the
   existing preflight probe's supported grammar). Produce a genuine Gap using a
   synthetic reproducer. Keep preflight's existing unsupported-range behavior
   unknown; do not relabel it a functional failure.
2. A opts into a voluntary VF02 cell, adapts an existing package in its isolated
   revision, saves a durable checkpoint and submits artifact/rights/limitations.
   Force worker restart and resume from checkpoint without chat-history replay.
3. VF03 authenticates a separately assigned evaluator, runs repository-owned
   deterministic checks against that exact revision, charges verification budget
   once, and admits only the resulting scoped observation. Source-only low-risk
   code follows the accepted runner policy; no arbitrary proposed-test execution.
4. Add the accepted immutable version to the same existing discovery projection.
   Visitor B in a cold session, on a distinct held-out task, traverses pages and
   resolves exact version/environment before invoking it. Record an actual
   invocation result separately from the compatible resolver answer.
5. Write VF03 ReuseObservation with B's task ID, original target, declared
   relationship/independence, outcome source, adaptation effort, verification and
   maintenance costs. Unknown effort/cost/independence remain unknown. Pair it
   with the frozen no-network baseline using the same task/output checks.
6. Add an admitted negative on an exact dependency after B's first receipt.
   Confirm only dependent composition receipts go stale, cold B sees unknown,
   unrelated version remains compatible, and a later independent composition
   replay/correction restores the appropriate scope. Revoke a dependency and
   verify replay alone cannot override revocation.

Deliverable: one executable receiving journey and restart/HTTP/PG tests, exact
artifacts and receipts, cohort table of successful later tasks per accepted
contribution, sharing/verification/maintenance costs and uncertainty. VF01's
six synthetic holdouts demonstrate measurement plumbing, not this hosted loop.

## 7. Receiving validation, rollout and rollback

Before a hosted rollout, run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test --prefix scripts/visitor-foundry/capabilities
npm run test:capability-market
npm run test:scale-compose
npm test --prefix packs/capability-preflight
node --test --test-concurrency=1 tests/capability-preflight*.test.mjs
```

Run the last two sequentially: the public archive test recreates the source pack.
Keep temporary/cache paths isolated. This VM's installed Chrome exits SIGTRAP
before layout assertions, including a direct-binary retry; retain that failure
and rerun layout on a working receiving browser. Do not kill shared Chrome jobs
or modify system profiles to fix an unrelated UI check. Add VF02's real-PG suite
and VF03's admission/backpressure/cohort suites using their actual accepted commands.

Then have a separately assigned remote reviewer inspect the combined diff,
authority boundaries, source/rights pins and two-visitor evidence. Deployment is
through the existing service host and Root's established release process, not
VF01 publication. Start with an explicit opt-in project/feature flag, existing
public discovery unchanged by default, and a bounded inventory/verification
budget. Observe unknown rates, true gaps, conflicts, expiry lag, useful reuse and
cost rather than catalog size or message count.

Rollback disables the hosted foundry adapter and resumes the existing S04 path;
immutable artifacts and correspondence history remain available. Rebuild derived
indexes from the last good event prefix. Never erase adverse evidence, undo
payment records, or convert stale compatible caches into current authority.
