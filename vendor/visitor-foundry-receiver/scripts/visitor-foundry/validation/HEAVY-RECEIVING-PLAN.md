# Heavy receiving plan: VF04 combined visitor journey

## Receiving contract and boundaries

Receive VF03 from `codex/visitor-validation-reuse-20260926` after Root reconciles VF01/VF02
contracts. VF03 owns only `scripts/visitor-foundry/validation/`. No sibling foundation,
correspondence service, frontend, earned-work kernel or external reference source was edited.
This plan reserves implementation for the existing receiving owner; no subordinate workers
or duplicate integration jobs were launched.

The shipped executable foundation is admission, capacity accounting, exact invalidation,
reuse/cohort projection, a bounded JSON fixture evaluator, and adversarial tests. Hosted
credentials, durable queues, source collection, deployment, and real independent operators
are receiving work. Do not label fixture acceptance as hosted acceptance while wiring it.

Read `README.md`, the closed schemas, and `RESULT.md` before applying adapters. Upstream
VF01/VF02 field names are not presumed: use their received schema exports, write one explicit
mapping per contract, and reject missing bindings. Preserve upstream identities/source pins.

## 1. Assemble one voluntary two-visitor journey

1. Visitor A supplies a task through the existing discovery/agent entry. VF01 resolves
   against its exact environment, required input/output and license constraints. A compatible
   hit is usable without contributing. Preserve a genuine miss or unknown result and its
   resolver snapshot; absence of evidence is not a funded request.
2. Offer contribution as an explicit continuation after a supported-class miss. Keep original
   private task input out of published evidence. Use a permission-cleared synthetic reproducer,
   reusable artifact, rights grant and exact source revision. No tokens, price example, OPEN
   label, historical award or wallet activity may imply funding.
3. VF02 creates/claims a voluntary scoped work cell with existing session grants, lease and
   fence. Store checkpoints there, including negative results. `submit` must be called only
   after the host verifies the actor can submit this cell's exact fenced revision and artifact.
   A proposal for a test is untrusted data. The submitted artifact never selects a shell command.
4. Map VF02's accepted submission to VF03 Candidate. Copy stable capability ID and immutable
   revision from VF01, exact source/content references, original task ID, declared dependencies,
   permission evidence, limitations and claims. Map authenticated host subject/group separately;
   do not take `contributor`, group, roles, policy, environment, risk or verifier identity from
   the submission. Registry membership and source/rights authenticity remain host checks.
5. Enroll the supported artifact family in a trusted policy scope. Low-risk JSON/data recipes
   can use deterministic replay with nonempty checks. A change to executable behavior, access,
   sensitive data, payment, ambiguous acceptance or other high-impact behavior gets an
   appropriately restrictive policy and independent review. A low-risk scope must not be an
   unrestricted route for any artifact kind.
6. Queue finite validation. Return the actual status and next action to the work cell:
   queued, capacity refusal, waiting for an eligible verifier, timed retry, needs correction,
   pending review, accepted or invalidated. No infinite polling or unbounded submission retry.
7. An independently assigned existing runner replays the pinned artifact under its installed
   evaluator. The host admits only observations from that assignment and live lease. Low-risk
   deterministic evidence can accept automatically. High-impact/ambiguous/limited coverage waits
   for a scoped independent reviewer. Bind review to the exact active receipt.
8. Publish acceptance evidence to VF01 through an idempotent outbox. Acceptance only means
   this exact capability revision was checked under this policy/environment. Keep usability,
   acceptance and recommendation distinct. A separate authorized decision may promote it.
9. Start Visitor B in a fresh process/session with no A transcript. Resolve normally through
   VF01, fetch the authorized immutable artifact and invoke the maintained service/recipe.
   Reusing must not require contributing or sharing private inputs. If B observes another
   unsupported environment, keep it scoped evidence, not expanded compatibility by assertion.
10. Record B's distinct later task, exact input/environment/capability, relationship declaration,
    outcome source, adaptation, effort/cost and applicable cohort case. Owner-controlled B stays
    owner QA; a sponsored operator stays sponsored evaluation. Preserve unknown independence.
    Separate beneficiary declarations from authenticated outcome/independence attestations.
11. Attach the resulting reuse projection beside the original Pilot evidence join. Show
    useful external outcome and settlement independently. Do not change recognized-revenue
    amounts, classification buckets, source-event IDs, paid/owed semantics or accounting.

First reproduce the checked-in cold CLI as an owner-controlled mechanics run. Then perform
this journey through the receiving hosted service with separately assigned operators and a
frozen holdout protocol. Hosted independent evidence is a new result, not a relabelled fixture.

## 2. Existing correspondence persistence and authorization

The reference service owns a bounded in-memory aggregate. Its object handles cannot cross
process boundaries. Treat its `snapshot()` as internal state only; never return it to a
public caller or accept a client snapshot as restored authority.

Use the existing correspondence service's authenticated scoped grants and PostgreSQL
transaction boundary. Do not create a second general event store, identity census, ledger
or scheduler. Persist these domain records using the host's existing versioned artifact/
event conventions, plus additive indexes/projections as needed:

| Logical record | Required binding / invariant |
| --- | --- |
| Candidate | Unique immutable capability revision; source/artifact/dependency/rights refs; contributor scope; policy pin |
| Command admission | Unique `(host principal, command ID)`; payload digest; original committed response and revision |
| Queue/assignment | Candidate; scope; attempt fence; runner; policy/environment; deadline; reservation |
| Receipt | Unique receipt ID and assignment material; immutable observations, metering and source refs |
| Capacity window | Approved policy/budget version; consumed cap; running memory; review allocations; explicit expiry |
| Current status | Derived candidate acceptance/promotion/invalidation, with revision; never receipt-controlled flags |
| Reuse revision | Unique task/capability within scope; supersession chain; original declared relationship/outcome |
| Attestation | Exact observation digest; source/evidence-reader identity; outcome and independence decisions |
| Outbox | Host sequence; exact affected revisions; idempotent receiver key; acknowledgement/cursor |

Choose scheduling pools no wider than the actual budget/tenant boundary. The current aggregate
CAS is a reference implementation, not permission to introduce a global PostgreSQL lock.
Extract/host the same transitions under candidate, pool-budget and per-scope row locks, using
consistent lock ordering. Use uniqueness constraints for semantic dedup and fencing. Retry
serialization conflicts with the same idempotency key and current revision; never replay an
external execution just because the transaction retry is ambiguous.

Commit queue acceptance, reservation, assignment fence, command outcome and outbox together.
A crash after reservation must leave a recoverable charged attempt. Restart must reload the
same lease/deadline; do not create new capacity, reassign live work or lose dedup history.
The foundation intentionally offers no client snapshot import or automatic budget reset.
Trusted host recovery requires a reviewed persistence adapter and its own restart tests.

Historical idempotency responses have `historical:true` when a later mutation occurred.
A previously accepted response can therefore outlive a revocation. Current resolver and
status reads must consult the current projection, never an old cached response as authority.

## 3. Trusted runner interface

Resolve the existing host runner credential to a handle and installed principal record.
Credentials never appear in candidate data, receipt JSON, files, public responses or audit
text. The administrator records the independent assignment evidence and known group
relationship; a different wallet, handle or claimed `verifierId` is insufficient. Unknown
contributor/verifier independence produces `independent_runner_unavailable`.

Dispatch the exported `VerificationAssignment` exactly. It includes candidate/version,
source revision, artifact/dependency digests, evaluator revision, environment digest,
required check IDs, attempt/deadline and resource/cost reservation. The runner adapter must:

- Check artifact content identity at retrieval and execution; retain an immutable evidence
  reference. Source/ref strings never authorize network fetches by themselves. Apply existing
  fetch policy, size bounds and disclosure/rights rules in the owning service.
- Run only a host-installed, version-pinned evaluator. Do not load code, regexes, tests or
  commands supplied by contributors. VF03's runner admits bounded JSON and refuses regex.
  It does not pretend to provide a general sandbox or a production process supervisor.
- Verify the actual execution environment against the assigned environment pin; a runner
  merely echoing a supplied digest is not measurement. Bind image/runtime/recipe dependencies
  through the real runner's existing execution receipts.
- Enforce CPU, wall time, memory, egress/API cost and cancellation externally. Bound stdout,
  result bytes, callback time and outstanding futures. Use the existing runner facilities;
  do not implement a new universal runtime in VF04.
- Report every required check as pass/fail/skip/incomplete with its evidence reference,
  limitations and observed timestamp. Include measured usage only when obtained from a real
  meter. Unknown CPU/currency costs remain null; token counts are never invented.
- Return results over the authenticated assigned-runner channel. The host checks exact
  bindings and fence again immediately before atomic receipt admission. Late receipts fail
  even if `expire` has not yet run. Record transport loss/timeout without treating it as pass.

A dispatch consumes the full authorized cap, including on crash, timeout or invalidation.
This is conservative capacity accounting, not recognized spend. Measured actual costs may be
less, greater or unknown. A cap breach retains failed evidence and halts new dispatch; the
host must reconcile physical enforcement before authorizing a new pool. Meter review work
separately; fixture review allocation is not a claim of actual reviewer time/cost.

## 4. Finite admission and fair scheduling

Set policy/limit records before taking public work. The sample's numeric caps are fixtures,
not production capacity recommendations or quoted prices. Calibrate with runner measurements.
Use finite bounds for total and per-scope outstanding work, active workers, running memory,
per-attempt resources, cumulative currency budgets, retry attempts/delay, review capacity,
stored records and event/idempotency retention. Apply host ingress byte/rate limits as well.

Eligibility uses independent runner availability, active dependencies, per-scope concurrency
and budget. Among eligible scopes, dispatch the least recently served; within a scope, use
admission order. Expired retries rejoin at the back of that scope. A blocked expensive scope
must not prevent a compatible affordable scope from being served. This fairness is over
host-authorized scopes; unrestricted self-created scopes would defeat the quota model.

`expire` is an explicit bounded maintenance command; schedule it through the host. First
expiry enters retry wait or terminal timeout; a later maintenance pass after `retryAt`
queues the retry. Each dispatch gets a fresh attempt ID. No background retries, payment
retries or budget refills exist in this module. Pending review consumes backlog capacity;
an operator can reject/invalidate abandoned review work under the existing policy.

On backlog refusal, return a bounded event/cursor subscription or host retry hint. On budget
exhaustion, wait for a separately authorized capacity window. On memory pressure, wait for
active assignments to release it or revise approved capacity/recipe. On journal/record
capacity, checkpoint/archive through the host while retaining immutable revision history and
dedup tombstones. Never clear history to make a duplicate look new.

## 5. Corrections, revocations and dependency invalidation

Candidate corrections are new immutable revisions with `supersedes`, same capability and
owner, new source revision, fresh replay and possibly review. The old candidate/receipt stays
in history. Dependents of the old exact revision invalidate transitively and do not silently
follow to the corrected version. Unrelated versions stay usable. Failed correction admission
is atomic and does not revoke the old version accidentally.

For compromised or incorrect observations, invalidate the receipt with source evidence;
this withdraws candidate acceptance/recommendation and invalidates dependent versions.
There is no operation that edits a trusted receipt into a passing one. Reverification uses
new revision evidence. Reuse corrections append a new observation superseding the old one;
old attestations do not transfer. Retraction excludes the row from current cohorts while
retaining the original declaration and immutable event payload.

Connect VF01 dependency-change/revocation events to these exact hooks. Do not broaden a
negative observation into a global ban on an unrelated version or environment. A shared
external dependency can affect multiple tenants; the reference hook refuses an unauthorized
cross-scope change. The host must authorize and fan out that material change to all affected
scopes atomically or through a fail-closed invalidation barrier, then acknowledge propagation.

The outbox consumer removes invalidated versions from current recommendation caches and
marks historical evidence as withdrawn. Test crash/retry between status commit and cache
update; a lost notification must be repaired from the existing cursor/replay mechanism.
Never reuse an old accepted response while propagation is unresolved.

## 6. Reuse, task memory and accounting adapters

Use `ReuseObservation` without extracting private conversation histories. Bind the distinct
later task, exact capability/source, input digest, environment, adaptation, relationship,
outcome source and authorized scope. `observe` stores a beneficiary declaration. Only the
separate authenticated evidence reader can attach a verified source-bound attestation.
An evidence reader cannot attest its own identity/group, and owner/affiliated declarations
cannot silently become independent. Correct contradictory source facts explicitly.

For SameDayDesk result reuse, preserve the existing opt-in gate and scrubbed export. Keep
`user_selected_unverified`, `publicSafeCertified:false`, incomplete/failed rows, and original
URL versus recipe-locator disclosure. An exported result or receipt is evidence to examine,
not permission to publish, buy, rerun payment, or assert external completion. Store original
rights and dependency pins beside the authorized export. Never derive a useful outcome from
HTTP shape validity, a download, a changed digest or `charged:true`.

Map selected authorized observations into the existing task-memory contract with
`execute:false`, immutable revision lineage and the correct epistemic status. Beneficiary
claims remain asserted; owner tests remain test traffic. Preserve exact source/version and
producer attribution without treating it as a global identity. The task-memory source schema
requires an HTTP(S) URI: fixture locators cannot be disguised as original evidence URLs.
Keep a recipe locator's role explicit or decline mapping until a valid authorized source
reference exists. Respect its 128-character IDs; use explicit host mapping if a VF03 ID is
longer, not truncation or silent collision. No task-memory schema was forked here.

Call `attachEvidenceJoin` with the pinned Pilot result v2. It returns the original join and
its digest unchanged, beside the reuse projection. All source-attestation and settlement
limitations in that join remain intact. A future join authority upgrade requires a reviewed
versioned adapter; caller-supplied true flags are refused now. The existing terms-lifecycle
and contributor desk remain authoritative for their own boundaries: acceptance, cancellation,
owed obligations and settlement are not recomputed by VF03.

## 7. Frozen baseline and matching cohorts

Before collecting trials, persist an immutable experiment manifest with baseline source pin,
capability revision, environment digest, task class, holdout revision, metric version, purpose,
relationship stratum, arms and every case's exact input digest. Freeze artifact rights and
per-task success rubric. `compareCohorts` is a pure reporter; it does not itself authenticate
or time-stamp preregistration. The receiving host owns that freeze and its evidence.

Use three separate arms: no-network baseline, reuse-only, and contribution plus later reuse.
The baseline runs the frozen old behavior without resolver/memory access. Use separate task
IDs in fresh sessions for each arm; maintain the same held-out cases/inputs and environment.
Contribution effort includes proposal/packaging, validation, sharing, review, corrections and
maintenance. Record these actual measurements separately instead of subtracting reserved
budget caps as though they were cost or claiming they are zero.

The reporter requires every manifest case in every selected arm. Duplicate trials/task IDs,
extra cases, mismatched versions/environments/relationships, changed input bytes and missing
cases produce `incomparable`, with no pooled rate or favorable common-subset denominator.
Unknown outcomes suppress success rates; unknown effort suppresses effort deltas. Currency
sums use integer strings, separate currencies and unknown counts. No token estimates,
exchange rates, extrapolated margins or causal savings are emitted.

Keep the accepted contribution inventory, including revisions with zero later reuse, as the
fixed enrollment denominator. Report later distinct tasks helped per accepted contribution
only within the declared matching stratum/time window. Show owner QA, sponsored evaluation,
unknown independence and independently attested external outcomes separately. A repeated
observation of the same task is a correction, not another beneficiary/useful task. Settlement
and independently repeated useful demand require their own original source authority.

The shipped case demonstrates mechanics with one synthetic holdout, not a credible estimate
of network uplift. A hosted experiment needs more prespecified held-outs, retained negative
results, operator relationship evidence and actual cost/maintenance measurements. A stopped
or unobserved arm must remain missing, not enter the denominator as a success.

## 8. Receiving acceptance and rollout

Before claiming hosted completion, require these concrete proofs in the receiving branch:

1. The included 62 focused tests, affected pack tests and source conformance still pass.
   Replace only integration adapters; do not weaken the forged-runner, revision-drift,
   missing-cost, duplicate, timeout, correction or cohort refusal cases.
2. Real disposable PostgreSQL: restart after queue admission, after cap reservation, after
   runner execution before receipt delivery, and after outbox commit before acknowledgement.
   Recover one logical acceptance and one charged attempt per actual dispatch; retain pending
   work and idempotent replies. Use VF02's existing restart/lease tests where applicable.
3. Concurrent scoped clients: race identical candidate/receipt commands, old fences, corrections,
   shared dependency revocation and receipt acceptance. Prove one live assignment per configured
   constraint, no duplicate cap consumption, no stale promotion, no foreign-scope reads/writes,
   bounded backlog, fair service and no global lock. Measure offered 1/8/32/128 only if that
   configuration is actually exercised; retain latency/error/cost and don't rename it demand.
4. Real trusted-runner refusal: unauthorized callback, same-group assignment, missing evidence,
   wrong image/environment, changed artifact, partial capture, cost breach and late completion.
   Demonstrate enforced process cancellation and receipt redaction without executing submissions.
5. Hosted Visitor A → voluntary work cell → independent checks → VF01 accepted exact version →
   cold Visitor B qualified invocation, followed by correction and revocation propagation.
   Start with owner QA labels, then separately record independent operator evidence.
6. Independent receiving review of authority, cache invalidation, cost/meter completeness,
   rights/private-data preservation and baseline protocol. Root/Heavy own launching this review;
   this VF03 run did not spawn or contact subordinate model workers.
7. Use the existing service-host deployment process after integration acceptance. Keep initial
   pools small and reversible; disable contribution intake on overload while preserving ordinary
   reuse. Rollback withdraws recommendation/intake and preserves receipts, owed-work evidence,
   queued checkpoints and data for repair. No homepage redesign or public release is part of VF03.

Receiving completion means a working hosted two-visitor path with independently attributable
source evidence and retained limits. It does not mean a new payout rail, earned-work kernel
acceptance, proven commercial conversion, token savings or settled network economics.
