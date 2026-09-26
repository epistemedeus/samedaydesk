# Heavy receiving plan — durable VF04A into the existing host

Current VF09 receiving amendment: [compound result](COMPOUND-RESULT.md),
[executed ports](compound/ports.json) and [Heavy hosting plan](VF09-HEAVY-RECEIVING-PLAN.md).
It adds actual VF05 participation and bounded VF08 contributed-code execution;
F93 identities and the durable revalidation lifecycle remain in force. Earlier
sections below retain their historical scope and receipts.

This plan continues executable source at the lifecycle tested implementation pin
`689233f2131669fdcb05f62f96452629dda479f3`, received directly from F93 final tip
`107363a0fabaed6133235ebda812dd5f01b07d51`. The F93 tested implementation was
`a7fe9f508f58d25312c64e11b4e6e3d258fbb975`. The original durable implementation
was `81daa872941534e0ea796ba4ed4c2c601f0b7a61`; the
[F93 amendment below](#f93-receiving-amendment) supersedes its identity mapping.
All are actual executed source checkpoints. The
[maintained-evidence amendment](#maintained-evidence-lifecycle-receiving-amendment)
is current and supersedes the earlier lifetime-attempt, expiry and migration
instructions where indicated. F93 identity and supplied-evidence semantics stand.
Receive the final remote-verified tip of
`codex/visitor-foundry-integration-20260926`, which includes this plan/results.
Root adjudicates the foundations and parallel independent review. This worker
did not launch reviewers or subordinate models, deploy, contact operators, add
credentials or migrate production. Existing E01/H36/earned-work/payment owners
retain their authority.

## 1. Receive and independently reproduce the concrete boundary

1. Fetch the receiving branch using the existing Git account. Check that all
   three exact foundation pins in RESULT are ancestors. Review the delta from
   receiving merge `c239d99` separately from the original foundation diffs.
   New runtime files are in `scripts/visitor-foundry/integration/` and additive
   correspondence `visitor-foundry/` directories. F93 also applies authorized
   minimal shared-module deltas to VF01/VF02/VF03 in this receiving branch only.
   Lifecycle adds three scoped VF03 transitions with immutable round policy and
   regression tests; VF05/VF06/VF07/VF08 remain outside this receiving delta.
2. Read CONTRACT and the actual `store.mjs`, `manifest.mjs`, `recipe.mjs`,
   `supervisor.mjs` and `recover.mjs`; examine the real migration constraints.
   Read each foundation's original contract/results and independent review.
   No foundation adversarial gate was removed to make this journey pass.
3. Run the exact README test commands on an isolated remote checkout with private
   PG binaries, Node 22 and Linux prlimit. The original receipt was 15 integration,
   50 VF01, 15 VF02, 62 VF03 and 53 correspondence tests, plus affected package
   suites/builds (363 original tests total). F93 independently replays the
   affected suites plus new combined coverage: 206 passing tests (see below).
   Current lifecycle replay totals 218 tests, including 29 integration and 65
   native validation tests, both builds and frozen F93 vectors. Keep failed runs
   and source pins; the retained dependency-retirement failure is part of review.
4. Independently scrutinize authority (grant→actor→assignment), supervisor
   termination evidence, source/runtime pinning, grant expiry after lock waits,
   scope sharing, cell withdrawal and lost-ack replay. Treat a source hash as
   identity, not proof of rights or independence.
5. Review `evidence/journey.json` against TAP, rather than using a pass count as
   proof of commercial usefulness. The six cold B invocations and all operator
   controls are explicitly owner QA. No customer/independent operator exists yet.

Do not merge a public discovery adapter before Root has reconciled any independent
foundation-review findings against this receiving implementation and replayed
affected tests. Keep other founder branches/jobs intact.

## 2. Preserve the field-level contract decisions

Use the receiving adapters, not new near-duplicate IDs or JSON trust flags:

- `wire.mjs` retains and verifies the entire exact VF01 triple. Native IDs
  hash the full coordinate; native revision pins contentId. The full manifest
  and durable registry preserve the originals. VF02 sourceRevision binds the source descriptor;
  artifactDigest binds the contributed data separately.
- `admit()` reads the actual submitted VF02 row under scope/fence authority.
  Contributor claims/testProposal remain data. The canonical semantic tombstone
  survives changed request IDs, cell names and restarts.
- VF03 committed transitions replay from existing correspondence idempotency
  rows; fresh installed object handles supply authority. Public JSON cannot
  provide principals, policies, snapshots or accepted receipts.
- `resolveReceipt()` translates an admitted VF03 underscore-schema receipt into
  the distinct VF02 hyphen-schema disposition. Its HTTPS `.invalid` references
  are local owner-QA locators, never fetched and never represented as hosted
  artifact URLs. Before hosted publication, replace only locator construction
  with the existing authorized artifact route while retaining exact digests.
- Publication is a durable separate outbox. It creates scoped compatibility and
  candidate acceptance, not recommendation, external usefulness or settlement.
  A promotion adapter needs a separate scoped VF03 decision; do not infer it.
- Resolution binds exact transitive refs and evidence. The installed recipe
  rejects dependency-bearing compositions because it has no execution mapping.
  Do not weaken that check to demonstrate a chain of individually passing parts.

If the independent review requires a foundation fix, change the receiving branch
with a regression and explicit rationale. Do not rewrite an original worker
branch or silently reinterpret an evidence schema.

## 3. Prepare packaging and the existing host lifecycle

The core imports existing repository MJS modules plus built correspondence JS.
Shipping just `services/correspondence/dist/` is insufficient. The existing
deployment artifact must include:

| Path | Why required |
| --- | --- |
| correspondence `dist/`, package dependencies | Existing app/store/grants, VF02 and new boundary/lifecycle code |
| correspondence `migrations/visitor-work-cells/` and `visitor-foundry/` | Explicit migration tooling; neither normal listener nor worker auto-migrates |
| `scripts/visitor-foundry/{capabilities,validation,integration}/src/` | Actual contracts, resolver, VF03 state machine and integration runtime |
| `packs/capability-preflight/src/probes.mjs` and its normal source dependencies | Installed useful bounded probe |
| `packs/exchange-townsquare/exchange/01/src/` and existing transitive imports | VF03's existing module exports load the Exchange runner dependency |
| Linux `/proc`, `/usr/bin/prlimit`, matching Node binary | Installed subprocess identity, real CPU/wall control and exact environment pin |

Use the existing host build/container process; do not start a new provider or
public service. Make a packaged smoke test import the extension and perform the
ordinary loopback journey. The current Dockerfile was deliberately not changed;
Heavy owns its reviewed packaging delta and existing deployment route.

`prepareFoundryHost(baseStore,{enabled:false})` is the default. Under an explicit
host flag, construct `createFoundryExtension({enabled:true,databaseUrl,schema,
poolMax:2})`, before createApp so readiness and close are composed. Mount the
returned router after existing middleware. Existing `/healthz` must check the
base store, VF02 and all ten integration tables. Drain the same listener before
closing pools. Do not accidentally expose fixture-host IPC controls as HTTP APIs.

Existing project grants remain the tenant/privacy boundary. A first canary has
one synthetic enrolled project, short-lived writer/reader grants, and an explicit
installed verifier authority. Hosted independent identities require evidence of
actual organizational separation; different grant strings alone cannot provide
it. Preserve null/unknown relationships until the authority exists.

## 4. Apply the additive migration deliberately

Before any approved hosted migration, inventory and back up the selected existing
schema and its correspondence idempotency table. Check connection budgets across
all service replicas and unrelated existing owners. The tests used two hosts,
each pools 1 base + 2 cells + 2 integration, and a harness pool 2, with PG limit24.
That measurement is not permission to add those connections to a busy shared host.

Apply existing base/VF02 first, then run with secret-managed values:

```sh
npm run build --prefix services/correspondence
node scripts/visitor-foundry/integration/migrate.mjs --apply
```

Initial SQL is `services/correspondence/migrations/visitor-foundry/001_vf04_integration.sql`.
Package/apply 001, 002 and 003 in that order using the same migration entry point.
001 adds ten domain tables and a partial unique index on existing idempotency
project/revision for scope `vf04:transition`. It does not replace grants, project
events, VF02 keys or payment tables. Migration-only advisory locking is scoped to
the schema. An ordinary index build can contend on a large shared idempotency
table; estimate its size and use an appropriate maintenance window or separately
review an online index migration. Do not disable lock/statement limits casually.

No automatic TTL/pruning may delete `vf04:transition`, `vf04:http`, `vf04:maintenance`, or VF02
idempotency rows. They are authority/dedup history, not disposable HTTP caches.
Archive designs must preserve semantic and command tombstones, exact transitions,
receipts and pool charging. A projection-only restore is insufficient.

Initial pool limits are intentionally finite: backlog16, running1, records256,
commands4096, one attempt/generation and four explicit generations/candidate,
no refill/rotation. The native reference cap is eight; receiving SQL narrows four.
Maintenance idempotency also has a separate 4096-key bound. The constructor computes
installed environment pins; reenrollment with changed config is refused. Before
larger hosted use, design versioned capacity-window rotation and server-owned
checkpoint/archive validation, with adversarial replay tests. Do not add a public
snapshot import as a shortcut. Long per-budget histories increase replay cost.

## 5. Operate the runner and recover unknowns safely

Use the installed operator worker on enrolled project IDs. It is not a public
dispatcher or arbitrary job runner. One bounded pass is enough for cron/an
existing host job supervisor; no new scheduler vendor is necessary.

```sh
VF04_OWNER_QA_WORKER=1 node scripts/visitor-foundry/integration/worker.mjs recover PROJECT_ID
VF04_OWNER_QA_WORKER=1 node scripts/visitor-foundry/integration/worker.mjs dispatch PROJECT_ID
```

`recover` drains reconciled results and pending publication, and safely terminates
never-claimed reservations using the prelaunch invariant. `dispatch` first
recovers, then requests one assigned attempt. Two callers cannot claim the same
attempt; DB CAS precedes the sole owned child execution.

The worker keeps one attempt reserved through running, unknown and result-unacked
states. Only `reconciled` frees physical concurrency. Full reserved capacity stays
charged regardless of actual usage. Actual cost remains null unless measured.
Late receipts, wrong source/artifact/dependencies/evaluator/environment, forged
runner, stale fence or changed result cannot be made acceptable by replay.

If the supervisor itself dies after claim, retain the claimed unknown row and
stop that budget's new dispatches. Do not infer cancellation from host restart,
heartbeats, elapsed time, PID absence, or an unacknowledged result. This source
records boot/PID/start identity but deliberately does not implement adoption of
arbitrary orphan processes. For hosted unattended recovery, connect to the
existing process supervisor's durable execution/termination journal; it must
reconcile the exact assignment and process identity before the installed trusted
port can record outcome. Exercise a real supervisor crash in that environment.

The current owned deterministic child has bounded data, no network calls or
descendants, 2s OS CPU cap, 64MiB V8 heap cap and deadline SIGKILL with exit awaited.
The 128MiB reservation is not an RSS hard limit. Before accepting other runtimes
or code classes, use the existing approved isolation system with actual memory,
egress and resource enforcement; it is a new reviewed scope. Never let a
testProposal, URI, manifest script or JSON field choose a command/evaluator.

## 6. Connect ordinary discovery and the voluntary continuation

Use existing capability API/page adapters (`src/pages/api/lab/capabilities.json.ts`,
the capability-market wrapper and correspondence host) as the eventual entrypoint.
Current public pages remain unchanged. Add a server-owned foundry envelope or
explicit negotiation rather than replacing S04 semantics/disclosures silently.

1. Visitor supplies its need/environment to `/foundry/resolve`. Show compatible,
   unknown, known-incompatible and complete-scope missing distinctly. Preserve
   demo/historical/actionability/funding facts. A usable demo is still a demo.
2. For a genuine supported-scope gap, offer a separate voluntary action. Hosted
   reproducer clearance must replace the current owner-QA frozen-input allowlist.
   Require deliberate authorization and a scrubbed synthetic reproducer; do not
   persist private raw input or transcript. The existing public gap endpoint is
   intentionally restricted to enrolled cleared original tasks.
3. Reuse VF02 create/claim/checkpoint/transfer/submit routes and its durable
   client. Contribution decline and ordinary reuse finish without any work-cell
   obligation. A lease or 1000-unit fixture cap is not funded work or a reward.
4. Publish the exact canonical candidate status and bounded recovery next step.
   The existing service has no invitation UX or cross-organization enrollment;
   manually issued grants must stay disclosed in the canary.
5. After accepted outbox publication, cold visitor B must start from its task,
   environment and ordinary access path. Do not inject an artifact ID or ranked
   answer into B's config. Invoke through the stored manifest so expiry/retraction
   is checked at the actual use boundary. Its task ID is durable invocation identity.
6. Use `/observe` only for the current frozen owner-QA cohort. A hosted beneficiary
   declaration/evidence-reader adapter needs its own source and relationship
   authority. Preserve failed/unknown/declined/zero-reuse rows. A read-only user
   can already invoke; do not require a contribution to obtain ordinary service.

Shared publication is currently a direct explicit source→consumer allowlist.
Only scoped source rows are read, with sorted source locks and live invalidation.
There is no public cross-tenant graph or transitive share delegation. If Root
approves broader publication, add exact rights/tenant allowlists, quotas and
indexed reverse-dependency projections; retain the fail-closed barrier during
any asynchronous propagation. Never hide an expired source behind a cache hit.

## 7. Canary, observations and rollback

Before an approved existing-host rollout, repeat the private test and then a
packaged canary covering: disabled flag/readiness, actual two-host restarts at
all four commit/ack boundaries, lost receipt/publication response, semantic retry
under a new key, stale grant/fence, withheld live runner acknowledgement,
dependent evidence expiry/retraction, mismatched composition, withdrawal before
launch and use, and an unrelated supported branch. Preserve the test parameters.

Monitor project/assignment/semantic IDs, queue age, admitted/declined/backlogged
counts, unknown physical attempts, deadline-to-reconciliation time, outbox lag,
replay length, pool/lock wait, grant failures and source-validity refusals. Log no
bearers, DB URLs, private task input or transcripts. Use task outcomes and cost
completeness separately from HTTP/request counts. Measured offered 128 does not
establish sustained throughput, fair global scheduling, demand or profitability.

First rollback: disable/unmount the foundry intake/discovery adapter, stop new
dispatch, drain the listener, retain known supervisor reconciliation, and close
extension pools. Keep all tables, exact receipt history, unknown reservations and
publications for recovery. Existing correspondence and money paths continue.
Do not erase adverse evidence or refund capacity because a response was lost.

Only after an explicitly approved teardown, writers stopped, and verified export
of all twelve VF04 tables plus all three idempotency scopes should reversal be
considered. Reverse order is 003, 002, 001. 003 refuses recorded execution profiles,
maintained rounds or maintenance decisions: use an independently reviewed archival
design, not bypass of that guard. 001/002 delete only their VF04 tables/index and
original `vf04:http`/`vf04:transition` records; never truncate the shared idempotency
table. The pre-execution private reversal test retained
base/VF02 plus an unrelated sentinel and reapplied successfully. Production
rollback/reversal was not executed here. Rehearse restoring transitions, pool
config, candidates, attempts, receipts and dedup together before relying on backups.

## 8. Minimum first independent-operator experiment

After source review and the packaged canary, enroll two genuinely distinct
operators for one maintained compatibility family. Root authorizes recruiting
and communication; this task sent no messages to potential participants.

Freeze before either evaluation: original A task, held-out B inputs/expected
outcomes, environment/runtime/policy pins, source rights, scope coverage, limited
no-network baseline, complete case denominator, three arms, adaptation rubric,
observation window and cost fields. Use separate fresh tasks/sessions in baseline,
reuse-only and voluntary-contribution arms. Retain all task IDs; no favorable
common-subset selection after seeing outcomes. Give B only its own task and the
ordinary endpoint. Give A a visible decline path. Do not assign hidden sharing
labor as a condition of service.

The first experiment may be small (one independently contributed artifact and
three fixed B cases plus one unrelated need), but it must include a valid existing
reuse case, an unknown/unsupported environment, a failed case and accepted output
with no later reuse if that occurs. Operator independence needs explicit evidence
and permission; otherwise mark it unknown/sponsored/affiliated. Owner QA receipts
do not become external outcomes by changing grant names.

Collect task completion, extra packaging/sharing time, verifier/reviewer resource
usage, adaptation effort, maintenance/retraction burden, time to first later
useful task, accepted-with-zero-reuse denominator and all eligible/declined/failed
opportunities. Keep absent costs unknown and reserved caps separate from spend.
The current baseline is deliberately limited and cannot establish causal model
uplift. Join any future revenue only to the existing authenticated delivery and
settlement owners, never to a download, accepted candidate or wallet alias.

The first decision is whether independently useful later tasks justify this
specific compatibility binding and its validation/maintenance burden. If the
benefit is only packaging, measure that honestly; if compatibility evidence
prevents repeated failures, expand that evidence scope. If visitors cannot find
the path, improve the existing embedded adapter. Broader composition planning,
verification federation or maintained paid execution follows evidence and stays
with its established owners, not this fixture's successful HTTP count.

## F93 receiving amendment

Receive tested checkpoint `a7fe9f508f58d25312c64e11b4e6e3d258fbb975` plus its
subsequent result/plan commit from this branch. The remote-verified final tip,
bundle prerequisites and export checksums are in the follow-up export receipt.
The prior 377c6a tip and original export remain available for exact comparison.
F93-01 was real in that tip; the other reviewed durable lifecycle obligations
already existed and were replayed. Source review advice is not an independent
operator run; all executed observations here are owner QA.

### A. Freeze and distribute the exact contract

Consume `src/wire.mjs` (`validateWire`), `wire/receiving-ports.json`,
`wire/conformance-vectors.json`, and `wire/README.md` as one versioned contract.
Do not use VF03's internal ref as an external identity. The whole original
`{capabilityId,version,contentId}` is required, including 512 UTF-16-unit values
and all 100 refs. Full SHA-256 aliases have original-context verification; they
are not reversible alone and must never be exported as the only identity.

Use `gap-binding.v1` to carry the immutable `gap.v1` and distinct
`work-cell-gap.v1`. The immutable digest is `contentId`; the gap's numeric 1 is
its format revision. `contribution.gapRevision` means that digest. Cell CAS
`revision`/`expectedRevision`, admission `workflowRevision` and lease fences
remain ordinary bounded integers. These names are not interchangeable.

Native VF03 dependency schemas now accept 100 refs. This is representational
capacity, not installed composition support. VF04's installed recipe cap is 32;
explicit unsupported is a normal outcome. Preserve the unchanged `original`
field and precise reason/limit; never retry under a shortened or substituted
identity. The pure adapter also round-trips lone surrogates; actual PostgreSQL
writes explicitly refuse them because JSONB cannot preserve them.

### B. Package and apply only additive receiving storage

Package both migration files 001 and 002 and the actual wire source imported by
the runtime. The private receiving migration takes the existing migration lock
and applies both in order. Readiness checks both added tables. Identity registry
and candidate/journal/idempotency writes commit under the same project pool lock.
The registry compares full original coordinates/content and native alias values;
replay checks persisted aliases against the whole original identity. Retain these
rows as immutable dedup/provenance, even after candidate invalidation.

Migration 002 is additive DDL, not a legacy data converter. Do not automatically
rewrite old embedded gap records, immutable journals, accepted receipts or aliases.
This amendment changes the installed wire/evaluator pin; reenrollment with an old
pool configuration is refused, and old candidate aliases fail verified replay.
Before connecting an existing nonempty installation, inventory old cells,
journals, receipts, live attempts and graph publications. Root must separately
review an offline archival/conversion design that retains the original exact
pins and receipt provenance and reconciles physical runners first. This worker
has not performed or authorized that production operation. Fresh disposable
receiving namespaces, repeated migration and reverse rollback (002 then 001)
were actually tested; unrelated correspondence/VF02 records survived rollback.

Set the opted-in existing host parser to 524288 bytes for max-domain admission
vectors; leave unrelated app defaults alone. The wire admission cap is 512KiB;
VF02 commands still have a 24KiB cap. A smaller deployed transport limit must
remain an explicit HTTP 413 refusal, never truncated parsing or accepted identity.

### C. Replay the exact checks before downstream integration

Use an isolated remote checkout, existing native account, Node 22/Linux and
private PG16 binaries. Rebuild correspondence first. Set `VF04_EVIDENCE_DIR` to a
new directory to retain all old receipts. Run:

```sh
npm run build --prefix services/correspondence
node scripts/visitor-foundry/integration/wire/export.mjs --check
node --test scripts/visitor-foundry/integration/tests/wire.test.mjs
node --test scripts/visitor-foundry/capabilities/tests/*.test.mjs
node --test --test-concurrency=1 scripts/visitor-foundry/validation/tests/*.test.mjs
node scripts/visitor-foundry/validation/scripts/check.mjs
node scripts/visitor-foundry/validation/scripts/schema-conformance.mjs
node scripts/visitor-foundry/work-cells/run-local.mjs test
node scripts/visitor-foundry/work-cells/run-local.mjs regression
node scripts/visitor-foundry/integration/run-local.mjs test
node scripts/visitor-foundry/integration/run-local.mjs bench
npm run build
```

Actual final counts are 50 VF01 + 15 VF02 + 62 VF03 + 6 combined wire + 20 durable
integration + 53 correspondence = **206 passing tests**. Independent Ajv schema
validation, frozen exports and both builds also passed. Preserve the initial
14/15 integration failure: the stale-fence test had sent 0, now a schema error;
current fence + 1 correctly tests stale authority. Do not weaken either gate.

The additional required cases are executable: 512-unit Unicode/astral refs;
100 dependencies through actual VF03 submission as pending; JSON/PG restart;
same coordinate/different content; forged alias after restart; full gap IDs across
VF02 submission; unsupported admission with no durable writes; correct supported
retry; and evidence review without graph or budget change. The original four
commit-before-ack crash points, real evaluator subprocesses, termination ambiguity
and cold CLI cases remain in that same suite. This is not a test-only substitute
for the durable boundary.

The repeated 507-offer load run served 214 admissions/165 duplicates and refused
128 for backlog. All 33 first-round evaluations completed with at most one held
reservation per budget. Use the raw receipt for latency, not an old benchmark:
identity checks add replay work. The result covers short loopback bursts only,
not sustained hosted load, network conditions or external demand.

### D. Preserve supplied environment evidence without execution claims

Mount POST/GET `/foundry/environment-evidence` behind the existing project grants.
POST requires writer authority and idempotency; GET is scoped to authorized
readers. It stores the full supplied target, environment, input digest, HTTPS log
reference/digest, timestamp, claim and permission in a separate bounded table.
It does not fetch the URI. Host-added grant/time/review fields are not accepted
from clients. Its `replay.status` stays `not-replayed`; assignment/receipt remain
null. The installed review method has no public visitor route.

A supplied-log review may say what was inspected but must not say an evaluator
executed it. The observation remains useful context even when the installed
Linux/Node evaluator cannot reproduce the environment. Do not add it to admitted
graph observation IDs or relax the environment digest. A future installed replay
must take the ordinary assigned verifier and budget path and produce a separate
bound receipt. The actual regression demonstrates unchanged incompatible
resolution and exactly zero extra assignments across review and cold restart.

### E. Receive separately owned VF05/VF06/VF07 work later

No source from those jobs was imported or modified in this amendment. Give their
receiving owner these exact port files and vectors, then replay their completed
source against this final branch; do not claim compatibility from their earlier
fixture pins. Keep the original scopes:

- VF05 uses participation/discovery/work-cell ports and preserves voluntary
  opt-in, declines, grants, immutable identity and current CAS/fence state.
- VF06 proposes exact dependencies and composition mappings. A component's
  acceptance does not verify a composition. The installed recipe still fails
  dependency-bearing execution; a new executor requires its own complete bound
  checks without weakening current expiry/retraction/invalidation behavior.
- VF07 may recommend work; its offers cannot reserve work or verifier budget.
  Recheck project scope, current identity, lease fence, dependency evidence,
  capacity and independence at the actual receiving ports. Tests reject extra
  allocation/accepted/verifier fields, forged native aliases, copied handles,
  stale fences and foreign grants. Reuse the existing reservation/assignment
  machinery; do not create an allocation-owned scheduler or authority ledger.

Their later combined replay must add actual stale/aliased offer journeys using
their final source. That remains their receiving task, not evidence fabricated
here. Preserve owner/affiliated/unknown relationships in cohort observations,
unknown costs and not-yet-reused inventory. No network uplift, independent demand,
production release or measured economic surplus is established by this amendment.

## Maintained-evidence lifecycle receiving amendment

Receive tested implementation `689233f2131669fdcb05f62f96452629dda479f3` and its
subsequent result/plan commit. Its direct parent is F93 final tip
`107363a0fabaed6133235ebda812dd5f01b07d51`. The current remote tip/tree, checksums,
patch-apply result and verified foundation ancestry are in the separate
`.scratch/vf04-lifecycle-export/export-receipt.json`. Preserve both earlier export
directories. [LIFECYCLE-RESULT](LIFECYCLE-RESULT.md) records actual tests and limits;
[lifecycle/ports.json](lifecycle/ports.json) defines the installed maintenance ports.

### 1. Compare the final source before integrating other jobs

The public runtime-version boundary now rejects unsupported/malformed grammar as
unknown. `23.not-a-version` no longer gets compatibility for `>=22.5`. Supported
versions are optional `v` plus three safe decimal components with no leading zeros;
partial/prerelease/build forms are deliberately unsupported. The underlying range
function remains unchanged. Check the public HTTP regression as well as the real
evaluator checks; enumerated probes do not establish exhaustive domain coverage.

F93 already repaired gap projection: `toGapBinding(storedGap, ...)` reads the
original immutable snapshot. The new regression creates unrelated graph growth
and proves exact replay of the full source and cell projection. Do not replace
that stored evidence with a new snapshot or rename numeric workflow/CAS revisions
into content digests. All F93 max-domain vectors and identity aliases remain intact.

Review `verification.mjs`, candidate/attempt/publication joins in `store.mjs`, the
three native commands and migration 003 together. A generation is verification
state, not a capability version, content identity, work-cell revision or semantic
dedup key. Source/manifest/artifact are immutable across renewal. The native policy
snapshot is per round, so later installed policy changes cannot reinterpret an
old journaled assignment or receipt.

### 2. Package migration 003 and handle existing state explicitly

Include `003_vf04_revalidation.sql` and `.down.sql` alongside 001/002; readiness now
checks actual added columns. The existing schema-scoped migration lock orders all
three migrations. 003 adds no table or scheduler:

| Existing object | Additive change and receiving duty |
| --- | --- |
| Pools | Nullable current installed `verification` JSON; immutable base config and aggregate caps remain. |
| Candidates | `generation` defaults 1, SQL bounded 1–4; separate current profile. Preserve exact manifest, candidate, artifact, source cell and semantic key. |
| Attempts | Generation and frozen profile; unique `(project,candidate,generation)` replaces one lifetime attempt. Preserve every original assignment, fence, result and exit witness. |
| Publications | Generation and frozen profile; primary key becomes `(project,candidate,generation)`. Keep old pending/published/withdrawn rows and original receipt validity. |
| Existing idempotency | New bounded `vf04:maintenance` namespace, installed actor signature and durable acknowledgement; no second event log. Native transitions still use `vf04:transition`. |

Fresh disposable migrations, repeat application and pre-execution reverse rollback/
reapply passed on private PG16. Base/VF02 and unrelated idempotency sentinel survived.
Downgrade refuses any maintained generation, execution profile on an attempt or
publication (including generation 1), or maintenance decision. This is deliberate:
dropping the validity profile from a short-lived pending receipt could make old
code publish it for one hour. Keep unknown physical reservations and history;
rollback the application by disabling intake/dispatch first, not dropping tables.

For an existing F93 installation, inventory current pool policy, journals, candidates,
publication validity, cell states and all physical attempts before maintenance.
Migration assigns no invented historical runtime/profile. Existing null-profile
observations fail closed under the current installed runtime until explicit
maintenance. Reconcile any live/unknown physical work with actual witnesses.
Use the private configure port with expected profile null to install the actual
current profile; then request eligible `verification_changed` rounds. Existing
old manifests can keep creation-runtime provenance if every other manifest/source
field matches the installed recipe and canonical content hash. Do not rewrite
original rows or pretend prior evidence was replayed. Pre-F93 alias/gap conversion
still requires the distinct archival/reconciliation described in the F93 amendment.
This worker did not migrate a nonempty production namespace.

### 3. Use the explicit installed workflow

Use existing private worker/database/schema configuration and installed authority.
No visitor route mounts these methods. The current CLI is gated by
`VF04_OWNER_QA_WORKER=1`; production operator integration remains a separately
received existing-host function, not a visitor or allocation privilege. Persist
request JSON and its command key before sending, and inspect current trusted
project status for candidate generation and verification ID.

1. If policy/runtime installation changed, call
   `configure-verification PROJECT profile-change.json KEY`. The closed shape is
   `{expectedVerificationId,revision,validityMs}`. Expected null is only initial
   legacy installation. Revision is 1–256 characters and validity is 100–3600000ms.
   Source/runtime/evaluator/checks/scope and risk/caps are derived from installed
   code and immutable pool config. This command cannot import executable policy
   or refill a budget. It journals a scoped native policy change and retires old
   published evidence atomically.
2. Call `revalidate PROJECT renewal.json KEY`, with the closed shape
   `{candidateId,expectedGeneration,expectedVerificationId,reason}`. Distinguish
   actual expired accepted receipt (including pending outbox), explicit evidence
   withdrawal, profile change and terminal failed/unknown retry. A changed recipe
   is a new candidate; a changed implementation is a source/version upgrade.
   Cancelled/rejected cell or revoked/deprecated source cannot renew.
3. Inspect the acknowledgement and current status. Exact keys return the original
   decision. Concurrent distinct keys for the same predecessor/current profile
   coalesce to its immediate successor; stale requests cannot skip rounds. A
   historical acknowledgement is not fresh execution or physical-release authority.
4. Run one `dispatch PROJECT` pass, then bounded `recover PROJECT` as needed.
   The normal reservation, installed supervisor, real child result/exit and
   reconciliation produce the new receipt. Recovery only selects pending outbox
   rows matching the current generation. Use explicit generation in direct
   `publish(project,candidate,generation)` calls; default 1 never means latest.
5. Verify fresh ordinary discovery/invocation with a cold caller that knows only
   task/environment and ordinary grants. It must not receive a hand-selected
   artifact or old manifest as a hint. Keep owner QA separate from independent use.

Private methods serialize transitions with the project pool lock and exact source
locks. Native `configurePolicy`, `revalidate` and `finishUnknown` require scoped
operator handles. Visitors, evidence reviewers and advisory allocators cannot
install policies, assign verifiers, admit receipts or change aggregate limits.
Public F93 supplied environment evidence remains permanently non-replayed unless
a separate future ordinary verifier run produces its own bound receipt.

### 4. Preserve evidence and physical uncertainty across generations

Renewal appends existing graph retirement mutations and changes logical state to
pending. Original observations retain their verdicts, timestamps and expiry, and
original failed/unknown attempts retain result/termination data. Keep those rows
in dependency-health input. A retained regression exposed a concrete bug in the
first implementation: excluding historical admitted IDs hid expired dependency
evidence and revived a stale parent composition. The repaired source keeps history
and retires admission explicitly. Fresh component evidence does not validate the
old parent. Read-time current-runtime/profile failure also derives a withdrawal
without mutating history or claiming an execution took place.

A current receipt binds exact assignment, candidate, source revision, artifact,
dependencies, evaluator, environment, policy, scope and profile. The source probe
is checked against pinned bytes from `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`:
`sha256:85dbdc32d1f97715ef06c075b54c42487b8ec156a08857d8cad73e74b24d1c69`.
This tested Node22/Linux installation has runtime pin
`sha256:47b5279e628a0a14a40cf64edc08723ec31be8a09c7d0933be80973e8d50b051`.
A new installation derives its own profile and requires real revalidation; it
cannot stamp a new timestamp on an old receipt or rewrite creation provenance.

The physical reservation remains held until the assigned supervisor proves actual
exit or the database proves a reservation was never claimed for launch. Policy
change during a live child retires old evidence immediately but does not terminate
or refund it. Its eventual stale-profile result stays audit data and closes unknown.
Only then may an explicit current-profile round be requested. A queued obsolete
round can close unknown without launch and consume a generation, with no invented
charge or exit. Withdrawal/revocation removes eligibility while retaining any live
physical reservation. Old reconcile calls, runner fences and receipts cannot
release or publish a newer round.

### 5. Replay actual acceptance and distinguish injected boundaries

Run the F93 amendment commands above, setting `VF04_EVIDENCE_DIR` to a new directory
for each receiving run; do not overwrite prior receipts. Include all new lifecycle
and native generation tests automatically selected by the current runners. Rebuild
correspondence first. The final executed totals are:

- 29 real-PG integration tests (`evidence/lifecycle/integration-05.tap`).
- 50 VF01, 15 real-PG VF02, 65 VF03, 6 F93 wire and 53 real-PG correspondence tests.
- 218 total, zero final failures/skips; both builds, generated schema parity,
  independent Ajv validation and frozen full-domain F93 vectors pass.
- Repeated 507-offer HTTP load: 214 admissions, 165 duplicates, 128 explicit backlog
  refusals, 33 first-round evaluations and at most one held reservation per budget.

Inspect the actual expiry→renewal→evaluator→outbox→cold CLI case; 16 concurrent
requests through two hosts; four commit-before-ack SIGKILL points; old receipt/
fence/publication attempts; live policy change; source withdrawal/revocation;
failed/unknown renewal; pending outbox expiry; unrelated same-scope capability;
finite aggregate budget and generation caps; dependency-history regression; and
migration reversal guards. The private CLI itself is exercised, not just its store
method. Short explicitly installed validity windows cause real expiry without
clock mutation. Runtime metadata drift is an injected mismatch, not deployment
of another Node binary. The mismatched child manifest causes a real evaluator
failure. Parent dependency coverage is an owned graph fixture, not VF06 execution.

Preserve `dependency-retirement-before.tap` and its passing focused/full successors.
The initial focused run also exposed a fixture-hook hang when the original suite
was entirely filtered; only its two owned hosts were stopped. The harness now
selects just the lifecycle file under `VF04_TEST_NAME_PATTERN`. Preserve that
receipt and the repair, without treating other jobs as disposable test processes.
Raw logs retain tool-emitted whitespace; source/docs whitespace checks pass.

### 6. Account for finite maintenance and leave later ownership intact

A candidate can receive at most four generations (three additional rounds), one
attempt each. The native reference allows eight; SQL and receiver narrow four.
Attempts use existing resource caps: 1000 USD_MICROS per reservation, default
256000 aggregate, one physical reservation, backlog16, records256, native
commands4096, aggregate CPU512000ms/wall10000000ms. Maintenance adds an independent
4096-key idempotency cap and profile/retirement journal entries; limits may stop
work before four rounds. Default validity remains one hour, installable between
100ms and one hour. No timer runs and no automatic renewal, refill, archive or
capacity rotation was added. Short validity windows are for tests, not a claim
that such frequency is economical for a hosted service.

Additional costs are real: repeated evaluator processes, fresh assignments/results/
publications, per-round profile snapshots, retirement mutations, extra current
profile/publication queries, scoped lock time and longer replay. All failed and
unknown rounds retain their cap charge. Aggregate observed spend remains unknown,
not the sum of reservation caps. Load evidence is short loopback bursts; no
sustained WAN latency, commercial savings, independent demand or economic surplus
is established. The six original cold invocations plus renewed cold use are owner
QA. General archive/rotation, independent observations and deployment need their
own receiver work before claiming ongoing production maintenance.

Give VF05/VF06/VF07/VF08 their existing F93 ports and these additional installed
maintenance contracts for their later actual replay. VF05 retains opt-in and
ordinary grant/cell flow; VF06 must verify each composition separately; VF07 is
advisory and cannot schedule/charge by proposing offers; VF08 owns portable-code
execution and must supply a separately bound installed evaluator. None owns this
maintenance authority merely by using a port. Do not widen the current JSON recipe,
import their unfinished work, change their branches or invent their receipts.

The final lifecycle delta stays in integration, the minimal VF03 coordinator/schema/
tests, correspondence boundary and migration003. Foundation/F93 evidence, source
branches, independent jobs, payment authority and public deployment remain intact.
No main merge, deployment, production migration, new account/spend or subordinate
model workers were part of this completed assignment.
