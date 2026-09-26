# VF03 RESULT — independent verification and useful reuse

**Status: done for the assigned source foundation. Hosted integration remains VF04.**

Implemented and tested on the assigned Cursor VM checkout using native Astra, with no
subordinate model workers. All committed changes are under
`scripts/visitor-foundry/validation/`. Shared reference sources were read-only; no VF01/VF02
path, other VM job, global authentication, public release or deployment was changed.

- Repository: `epistemedeus/neomorphic-io`
- Assigned branch: `codex/visitor-validation-reuse-20260926`
- Starting main: `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`
- Completed implementation/evidence commit: `1a517dd40160b8101dc8a9372d905ed6dc1c8ab5`
- Earlier checkpoints: `c44e4a4` before suites; `0eaa2c3` before the broader build.
- This report and the receiving plan follow in a documentation commit. Resolve final delivery
  with `git rev-parse HEAD`; the final response supplies its exact SHA and push/patch evidence.
- Existing authorized account: `epistemedeus`; commit identity configured locally with its
  GitHub ID-based noreply address. No login or global Git/auth changes.

## Delivered behavior

`ValidationService` provides atomic, revision-checked admission in one Node process. A host
installs authenticated principal handles, scope policies, independent runner assignments,
known dependency refs and finite limits. Bodies cannot authenticate themselves. A copied
handle, unassigned runner, contributor receipt, extra authority field, same-group verifier,
wrong revision/environment/dependency/policy or expired attempt cannot promote a candidate.

Candidate claims remain separate from runner observations. Every required check must be
present exactly once and pass. Low-risk deterministic replay with no unresolved limitation
can establish scoped acceptance. Ambiguous/high-impact or limited evidence needs an independent
review within a bounded review allocation. Recommendation/promotion is a separate operation.
Neither acceptance nor recommendation implies invocation, usefulness, demand or payment.

Corrections submit a new immutable capability revision, retain the old claims/receipt and
invalidate dependents of the old exact version. Receipt/candidate/dependency revocations
propagate transitively without affecting unrelated revisions. Immutable mutation events retain
payloads/digests, actor and sequence; current projections cannot erase that evidence.

Admission bounds outstanding work, per-scope backlog/concurrency, total concurrency/memory,
attempt CPU/wall/currency caps, review count/time, records and command journal. Dispatch
charges the full authorized cap before execution. Duplicate requests and receipt replays
cannot charge it again. Eligible scopes are scheduled by least recently served, with FIFO
within a scope. Retries are delayed, bounded, newly fenced and separately budgeted. Receipt
admission rejects overdue leases even before a maintenance tick. A reported cap breach fails
the evidence and halts further dispatch pending host reconciliation. Failures return a specific
`code` and `nextAction`; status views expose relevant deadline/retry time.

Reuse observations bind an exact capability revision, distinct later task, input/environment,
source, adaptation, relationship, declared result and nullable effort/cost. Corrections and
retractions do not multiply uses. Unknown independence stays unknown; owner QA, sponsorship,
external usefulness and settlement stay separate. The evidence reader port requires separate
host authority and exact observation binding. Fixture attestations never establish external
usefulness. Wallets and aliases have no inference role.

The accepted contribution inventory includes versions with zero later reuse. Cohorts require
matching frozen manifest cases **and exact task-input digests**, capability/environment,
task class, holdout/metric versions, purpose, relationship and all requested arms. Missing,
extra, duplicate or incompatible trials produce `incomparable`; the reporter never chooses a
favorable intersection. Unknown outcomes/effort suppress affected rates/deltas. Costs use
exact integer-string currency buckets; unknown attempts, timeouts and review costs stay
unknown. Reserved caps are not treated as measured spend or invented token estimates.

## Existing-source reuse decisions

| Source and exact pin | Actual reuse / retained boundary |
| --- | --- |
| Neo `28924aac2a33cdf58bc9049a2198ab1ce9866f0f`, `packs/exchange-townsquare` | Direct import of `exchange/01/src/run-checks.mjs` for installed bounded JSON checks. Read exact journey replay/receipt, objective/requester gate and supplied-input tests. No new objective-check engine or false external completion. Contributor proposals never become executable tests. |
| Same Neo pin, `packs/terms-lifecycle` | Read immutable terms, correction and fixture-honesty sources/tests; keep new scope/acceptance and payment boundaries separate. No earned-work kernel copied. Full existing suite passes. |
| Same Neo pin, `packs/contributor-desk` | Read authority and owed-versus-paid implementation/tests. No paid flag, payout key, IOU conversion or settlement inference added. Full existing suite passes after its required dependencies/build. |
| Pilot `4f5f631ec32d4738e8dee4cc5964ce4b5ecb55a6`, `tools/ops/three-site-settlement-join` | Read join/records/tally/merchant evidence semantics. `attachEvidenceJoin` preserves the real v2 result and its digest beside reuse, without recalculating accounting. Tested against actual pinned owner-QA, merchant-classified and dishonest-skip fixture outputs. External authority remains unestablished. |
| Same Pilot pin, `experiments/commons-20260909/task-memory-contract` | Read epistemic status, exact source version, immutable correction lineage, owner scope and `execute:false`. Do not fork its contract or equate attribution with independent identity. Receiving mapping must respect its HTTP(S) source and 128-character ID bounds. |
| SameDayDesk `8c7968360d64cc36f3b89486e01293c6553927cc`, `tools/result-reuse` | Read projection/export/omission and boundary tests. Real conformance invocation preserves opt-in, `user_selected_unverified`, incomplete rows and `publicSafeCertified:false`. Exported observation validates against Neo's existing task-memory parser. |
| Same SameDayDesk pin, `tools/recurring-job-recipes` | Read immutable prior, cost, payment guard and export-boundary tests. Invoke pinned cost/payment guard during conformance: costs_unknown and payment_replay_blocked remain intact. No new recipe/payout engine. |

Sparse reference copies are under ignored `.local/pilot` and `.local/samedaydesk`; their
HEADs and clean source status were checked before conformance. Only needed modules and
transitive imports were fetched. Hashes of reviewed source files are retained in
`evidence/reference-conformance.log`. They are optional test references, not vendored runtime
dependencies. No source was changed in either reference repository.

## Schemas, APIs and authority

Runtime exports: `src/index.mjs`; closed schema definitions: `src/contracts.mjs`;
portable schemas: `schema/*.v1.json`. Prefix is `neomorphic.foundry.`:

| Schema suffix | Main fields / binding |
| --- | --- |
| `candidate.v1` | id, scope, capability id/revision, sourceRevision, artifactDigest/ref, taskId, exact dependencies, rights, claimed evidence/limitations, supersedes |
| `verification_assignment.v1` | assignment/candidate/runner IDs, all content/policy/environment bindings, requiredChecks, assignment evidence, attempt, assignedAt/deadline, resource reservation, provenance mode |
| `verification_receipt.v1` | assigned attempt, exact candidate/source/artifact/dependencies/evaluator/environment, observedAt, observed checks/limitations, nullable measured usage |
| `validation_policy.v1` | one immutable scope policy, evaluator/environment, risk, deterministic flag, required checks, attempt caps/retry limits, review allocation |
| `validation_limits.v1` | finite aggregate/per-scope backlog/concurrency/memory/cumulative resource/cost/review/journal bounds |
| `validation_command.v1` | id, expectedRevision, type, closed conditional payload for the chosen command |
| `reuse_observation.v1` | exact later task/capability/input/environment, relationship/purpose, declared outcome/source, adaptation, effort/cost, cohort binding, supersedes |
| `cohort_manifest.v1` | frozen baseline source, exact applicability/stratum, full case IDs/input digests and selected arms |
| `baseline_trial.v1` | separately supplied no-network trial, exact task/input/case binding, result/source and nullable measurements |

`new ValidationService(config)` exposes `dispatch(handle, command)` and `snapshot()`.
Commands: submit, assign, receipt, expire, review, promote, invalidate, observe, attest,
retractObservation. Successful command IDs are scoped to the host subject and idempotent
by material payload; changed payload conflicts. Failed commands make no state change and
may retry. Expected revision is excluded from the material key so an uncommitted stale
request can retry against the current revision. Historical idempotent results are flagged;
current consumers must reread status before relying on an old acceptance.

Projection APIs: `projectReuse(snapshot)`, `compareCohorts(snapshot, manifest, baselineTrials)`
and `attachEvidenceJoin(projection, pilotResult)`. All take host-owned/internal or explicitly
offline data; a copied JSON snapshot does not grant authority. The join adapter refuses
caller-written authority upgrades and retains original accounting unchanged.

Runner APIs: `createFixtureJsonRunner({evaluator, environmentDigest, brief})` returns an
installed JSON replay function; `checkCard(rule, card)` runs the bounded demonstration rule.
The runner cannot use production mode and refuses regex/arbitrary code. Trusted runner and
source/evidence ingestion adapters must be installed by the receiving host, as specified in
the receiving plan. Artifact refs are never fetched/executed by the admission module.

Dates are UTC RFC3339 at second/millisecond precision. Opaque IDs are namespaced. Money is
canonical integer strings plus explicit unit/currency; no floats or conversions. Refer to
schemas for exact limits and nullability. The independent Ajv check compiled all nine exported
schemas, validated real fixture instances, and rejected unknown fields, mismatched command
payloads, non-UTC timestamps and floating costs.

## Executable cold example

```sh
node scripts/visitor-foundry/validation/cli.mjs example
```

Or follow the three explicit `seed`, `replay`, `reuse` commands in `README.md`. No npm install
is required for this example or the 62 focused tests. The cold replay uses the existing
Exchange evaluator. A separate later process replays the serialized evidence before applying
the exact accepted card rule to a distinct task. The older permissive baseline also executes.

Measured final run: 3 processes; accepted fixture candidate; later task succeeded; matching
baseline/reuse-only/contribution fixture arms; repeated task suppressed; established external
useful tasks = 0; total effort/cost unknown. Output is retained in
`evidence/cold-{candidate,verified,reuse}.fixture.json`, plus `cold-cli-final.{json,log}`.
These are synthetic owner-controlled artifacts, not production receipts, paying customers,
independent operators, benchmark savings, or proof of generic code execution.

## VM verification and measured evidence

Node `v22.22.2`. Exact expanded commands, cwd, UTC start/end, exit and wall duration are in
each `evidence/*.json`; full logs sit beside them. CPU and total currency cost are null when
not measured. All test temporary directories were redirected into this checkout.

| Check | Final result | Measured wall | Evidence prefix |
| --- | --- | --- | --- |
| VF03 adversarial state/receipt/reuse/cohort/CLI tests | 62 passed, 0 failed/skipped | 702 ms | `focused-final-v3` |
| Existing Exchange/townsquare complete suite | 107 passed, 0 failed/skipped | 1,831 ms | `exchange` |
| Existing contributor desk complete suite | 59 passed, 0 failed/skipped | 5,761 ms | `contributor-ready` |
| Existing terms-lifecycle suite | 38 passed, 0 failed/skipped | 1,532 ms | `terms-ready` |
| Existing task-memory contract suite | 20 passed, 0 failed/skipped | 503 ms | `task-memory-ready` |
| Standard repository build | exit 0; 81 pages; no deploy | 2,609 ms | `build` |
| Exact pinned Pilot/SDS conformance | exit 0 | 192 ms | `reference-conformance` |
| Independent exported-schema validation | exit 0 | 175 ms | `schema-conformance` |
| Current cold three-process CLI | exit 0 | 153 ms | `cold-cli-final` |
| Offered-burst capacity probe | exit 0 | 240 ms | `capacity` |

There are **286 passing tests** across the five final suites; repeated intermediate runs are
not added to this count. Focused acceptance cases cover forged/unassigned/self/same-group
verifiers, all revision bindings, duplicate commands/receipts, empty/skipped checks, revoked
candidate/receipt/dependencies, correction cascades, capacity/budget exhaustion, review limits,
lease timeout/backoff/fencing, unknown costs/independence, repeated reuse, cold processes,
contradictory cohort strata/denominators and differing inputs under the same case name.

Initial failures are retained honestly: `/usr/bin/time` was absent (tests did not run, exit
127); the Node recorder replaced it. The first contributor run passed 39/59 because its CLI
requires local tsx and its page test requires built dist. Initial terms passed 35/38 because
child CLIs could not resolve tsx. Task-memory could not load zod. Locked existing dependencies
and the standard build resolved all those failures; source files were not weakened or changed.

Relevant reproduction commands from repository root:

```sh
node --test --test-concurrency=1 scripts/visitor-foundry/validation/tests/*.test.mjs
node scripts/visitor-foundry/validation/scripts/check.mjs
npm run test:exchange-townsquare
npm test --prefix packs/contributor-desk
npm test --prefix packs/terms-lifecycle
npm test --prefix inputs/pilot-task-memory-20260909
npm run build
node scripts/visitor-foundry/validation/scripts/capacity-probe.mjs
node scripts/visitor-foundry/validation/scripts/schema-conformance.mjs
node --import ./packs/terms-lifecycle/node_modules/tsx/dist/loader.mjs \
  scripts/visitor-foundry/validation/scripts/reference-conformance.mjs
```

Existing suite setup: `npm ci --ignore-scripts` at root, `packs/terms-lifecycle`, and
`inputs/pilot-task-memory-20260909`, with an owned local npm cache and no auth changes.
Build before the contributor page test. Reference conformance needs the exact sparse pinned
checkouts (optional positional roots); the script refuses wrong pins or changed sources.
The Node measurement wrapper is `scripts/measure.mjs OUTPUT_PREFIX COMMAND [ARGS...]`.

The synchronous capacity probe offered 1/8/32/128 fixture candidates and admitted 1/8/16/16;
refused 0/0/16/112 with `backlog_full`. Peak running assignments were 1/2/2/2. Eight eligible
scopes each received service in the first round. Per-scenario measured wall was
5.687/20.976/70.592/105.639 ms. Charged caps were 1,000/8,000/16,000/16,000 USD_MICROS
**capacity units**; these are authorized fixture caps, not actual expenditure. No client
concurrency, external traffic, commercial scale, latency guarantee or demand is inferred.

## Heavy receiving plan and current limits

The complete receiving design is [HEAVY-RECEIVING-PLAN.md](./HEAVY-RECEIVING-PLAN.md), with
explicit adapter contracts, trust boundary, PostgreSQL transaction/outbox requirements,
runner enforcement, scoped scheduling, corrections, baseline protocol and rollout tests.

The receiving sequence is concrete:

1. Root accepts VF01/VF02/VF03 contracts; map stable source/capability IDs without inventing
   another registry. Wire a genuine miss into an optional voluntary VF02 work cell and a
   permission-cleared contribution. Ordinary service use stays available without contributing.
2. Verify upstream grants, fence, artifact/rights/source authenticity, then admit VF03 candidate
   claims under a host-owned risk policy. Independent installed runners return exact observed
   evidence; bounded review handles ambiguity/impact. Acceptance and promotion remain separate.
3. Persist transitions, dedup, resource reservations and outbox atomically in existing
   correspondence/PostgreSQL. Replace this single-process aggregate with scoped host
   transactions; preserve its invariants without a global lock or new general event store.
4. Connect exact candidate/dependency invalidation events to VF01 cache/status projections,
   including shared-dependency authorization and fail-closed propagation. Preserve history and
   known negative evidence; corrected dependencies do not silently migrate consumers.
5. Run a cold B through the existing resolver/service, then admit declared later-task evidence.
   Independently authenticate usefulness/relationship sources before any external-use claim.
   Preserve SDS opt-in, source disclosure and task-memory epistemic/lineage constraints.
6. Freeze the no-network baseline, exact held-out inputs, environment, metric, relationship,
   purpose and full denominator before trials. Include accepted contributions with zero reuse;
   report actual effort, validation and maintenance measurements or explicit unknowns.
7. Prove real PostgreSQL restart/concurrent-client behavior and enforced runner cancellation,
   then obtain independent receiving review and use the existing service-host deployment flow.
   Owner QA and a later independent-operator experiment are separately labelled results.

Material remaining limits: no hosted endpoint/credential resolver, no durable service restart,
no distributed transaction/runner supervisor, no runtime sandbox, no real independent visitors,
no paid execution and no production evidence admission was demonstrated here. Principals,
risk enrollment, source/rights authenticity, external attestations, shared-scope publication,
retention and budget-window rotation require the existing host's authority. The local schema
and state machine cannot supply that authority from JSON. E01/PR109 and CW53/payment acceptance
remain separately gated; no Postgres earned-work or payout claim is made.

The single synthetic holdout establishes behavior of this bounded recipe, not task-network
uplift. The pure cohort reporter does not authenticate experiment preregistration. Actual
costs can remain unknown after success, review, failure or timeout. No blanket human review
is required for deterministic low-risk replay; high-impact decisions retain proportionate
review. These limits are explicit integration seams, not substitutes for the shipped code.

## Delivery evidence

The full implemented files, tests, closed schemas, measured logs, fixture outputs, checkpoints
and this detailed receiving plan are committed on the assigned branch. No tracked file outside
VF03's owned directory differs from the supplied base. The branch is pushed using existing
Git authorization; the final response records the verified remote tip. An exact Git patch
series and checksum are also preserved under owned ignored `.local/delivery/` for Root.
No public release, merge, PR, payment, login or subordinate worker was created.
