# Heavy receiving plan: VF08 into VF04A

Receive executable VF08 implementation `24d4d1c02abc633f9d56c9613d29dde99a7ba2a3`
and its later documentation/evidence commits on
`codex/visitor-portable-execution-20260926`. All VF08 changes are confined to
`scripts/visitor-foundry/execution/`. No VF04A/shared source, migration, runtime,
public route, deployment or default branch was changed by this worker.

This plan is grounded in read-only VF04A
`377c6a86b9ac22573d7fff88b39b7db05877dfef`, particularly its CONTRACT, RESULT,
HEAVY-RECEIVING-PLAN and real recipe/supervisor/store/manifest modules. F93 repairs
are in flight on the receiving branch: reread its final exports first. This is
not permission to overwrite those repairs or merge the older contract copies
from this branch. Receive the execution subtree delta only if ordinary merging
would conflict with receiving-owner foundation changes.

## 1. Reproduce the reviewed source and establish packaging

Fetch the feature branch through existing Git auth, inspect its delta from
`d1364b5`, and verify every changed path is under the owned execution subtree.
Read CONTRACT before evaluating isolation claims. On a separate remote receiving
checkout, run README setup/build/test and the VF01/VF03 regression command.
Final evidence is 25 execution tests plus 112 imported-foundation regressions,
zero skips, six fresh Node B processes and six separate Wasmtime children. Repeat
bounded failure cases, including unknown exit, before proceeding to hosting.

Package the following through the existing host build system:

| Required part | Receiving work |
| --- | --- |
| execution `src/`, pinned wheel and task-local venv layout | Install during image/artifact build with checksum verification; never pip-install from an invocation |
| VF01 contracts and VF03 legacy validator | Keep repaired receiving exports; rerun full-domain conformance before projecting |
| Exchange 01 evaluator and its constants/path/validate imports | Preserve installed evaluator source identity; don't replace it with contribution test proposals |
| Linux x64 Python, Node 22, prlimit and /proc | Health/readiness must verify actual runtime and OS bounds |
| Example C source/build receipt and license | Owner-QA fixture only; Clang/linker are build-time tools, not runtime submission endpoints |
| Root host native isolation | Review existing container/UID/cgroup facilities; VF08 itself only supplies Wasmtime plus rlimits |

Python runtime directory is untracked. Setup verifies the official wheel hash;
production packaging should be immutable and unwritable by submitted code. Pin
all artifacts in the normal existing build manifest and include dependency license
notices. `installation()` changes when executable/runtime wrapper bytes change.
A profile/version upgrade requires new environment evidence; do not reuse old
acceptance with a new library merely because the interface still loads.

Do not deploy a source checkout with compiler access and project credentials as a
claim of complete native isolation. This task proves no guest filesystem/network
imports; it does not test a native-runtime escape. The receiving host owns any
stronger process isolation and its own resource/concurrency acceptance tests.

## 2. Exact admission changes in `integration/src/recipe.mjs` and `store.mjs`

Keep `validateRecipe`, `capabilityFor`, `invokeRecipe` and the original preflight
pool available under their current explicit kind. Add a separate opt-in portable
artifact kind whose validation calls VF08 `validateArtifact`, not a replacement
for every existing JSON recipe. A binary artifact is inert until independently
assigned to this adapter. No submitted native/AOT or test code may be imported.

In `IntegrationStore.admit`:

1. Preserve the real project grant, submitted cell, revision, submission owner and
   contribution fence checks. Reread and lock the actual VF02 row as today.
2. Receive a bounded immutable descriptor and a host-resolved module reference.
   Prefer the existing artifact store and authorized upload route. Do not place
   256KiB base64 bytes in VF04A's 32KiB HTTP envelope or increase every router limit.
   No new unauthenticated artifact fetcher or arbitrary URL download is needed.
3. Resolve bytes from authorized immutable storage, enforce 256KiB before decoding,
   verify exact size and SHA-256, then run `validateArtifact`. Preserve full
   CapabilityVersion; sourceDescriptorDigest = `hash(capability.source)`.
4. VF02 `contribution.artifact.digest` and VF03 `artifactDigest` bind VF08's
   descriptor `id`; its `module.digest` separately binds binary content. Define
   the authorized artifact-store entry as canonical descriptor bytes (excluding
   the self ID if using the same hash). Do not confuse this with `hash(artifact)`
   including its ID. Existing JSON recipe digests keep their current meaning.
5. Replace the recipe-specific rights string only for this new kind with the
   receiving owner's rights/permission policy. An artifact's claimed MIT status
   or source pin alone is not rights approval or a reproducible-build attestation.
6. Semantic dedup must include descriptor ID, module digest, complete source,
   capability content, ABI, input/output, limits, dependencies, runtime/profile,
   evaluator revision/test digest, rights and environment. Reuse existing durable
   semantic tombstones and VF03 admission; don't create another registry or budget.
7. Keep dependency-bearing execution refused until a separate reviewed mapping
   proves composition. Individually passing modules do not establish a chain.

The example missing implementation is a compiled correspondence structured-result
transform. It preserves unknown_outcome and explicit error signals while removing
redundant text. It is not a new correspondence product, success authority or
payment/actionability classifier. Existing production wrappers remain their owners'.

## 3. Installed verification policy and exact reference mapping

Create the policy with `installedPolicy({evaluator,cases,environment})` using
host-controlled frozen cases and expected outputs. Freeze them before testing the
candidate, with a test/evaluator version and independent source review. The sample
uses a different-language oracle and owner-controlled identities; that is owner
QA, not an independent verifier organization. Contributor testProposal stays data.

Add a distinct policy/pool entry in `poolConfig` and assigned-runner allowlist.
Current preflight budget is only 2s CPU, 15s wall and 128MiB; it is insufficient
for the new adapter's **six-case maximum reservation** of 12s CPU, 24s wall and
512MiB virtual address-space cap at serial peak. These are admission caps, not
measured spend. Use existing capacity/physical-reservation logic to decide whether
that bounded workload fits the host; don't inflate shared budgets silently.
Actual measured six-case verifier wall in this run was about 691ms.

`loadVerification({projectId,assignmentId})` should use the private claimed attempt
and authoritative candidate/module bytes. It must reject withdrawn, stale,
wrong-project, expired or unassigned work. The port rereads assignment/fence
before every case. Do not implement it by trusting an HTTP assignment payload.

The reviewed older seam maps VF01 `{capabilityId,version,contentId}` to VF03
`{id:capabilityId,revision:contentId}` only while retaining the full immutable
manifest and full VF08 result. `toVF03Receipt` deliberately validates the old
narrow schema and refuses out-of-domain values. F93's receiving owner must adapt
this to its final lossless reference contract; do not broaden old schema IDs here
or delete version/content fields. Add conformance vectors with long IDs, Unicode
versions, same coordinates/different content and source-descriptor changes.

## 4. `integration/src/supervisor.mjs`, worker and attempt persistence

Use VF04A's existing claim/reservation/fence as the only launch authority. Commit
claim/launch intent before any child spawn. Pass each VF08 `onSpawn` record into a
durable private write and return from the callback only after it commits; VF08
holds guest bytes until then. Failed writes cause a witnessed child kill.

**Do not plug this into the old single-process COALESCE field unchanged.** VF08
verification runs up to 16 samples serially, each with a fresh process. Current
`runnerWrite` retains only the first process_identity and one termination. The
receiving change must preserve the identity and terminal witness of each sample
under the one attempt/fence. Options within the existing lifecycle include a
bounded append-only JSON case array in the attempt or an additive child table
owned by VF04A. Retain unique `(assignment,fence,caseId)` and immutable identity;
reject conflicting writes. This is execution evidence within the existing
attempt, not a new scheduler/lease authority.

The concrete sequence for the receiving supervisor is:

1. `claimAttempt` commits assigned supervisor/fence and launches no duplicate.
2. For each sample, persist launch intent, spawn VF08 child, persist exact
   bootId/PID/startTicks/supervisor/case identity through `onSpawn`, then send bytes.
3. Persist every observed result and exit. VF08's current verify API returns the
   bounded list after completion; if per-case streaming persistence is needed,
   add a trusted `onObservation` hook with a regression before using it. Until
   implemented, a supervisor crash anywhere retains the whole reservation as
   unknown. Do not infer exit for previous children from the last child alone.
4. Store the full unique-schema verification record with binding/fence and exact
   input checks. Project a VF03 receipt only from that stored trusted result.
5. Write aggregate termination only when all launched cases have witnessed exits
   (or a durable no-launch proof). Reconcile/admit via the actual assigned VF03
   runner handle; publication remains the existing outbox transition.

A returned result, cancellation request, deadline, TCP disconnect or SIGKILL
success does not free a reservation. An unknown physical result stops subsequent
samples and retains capacity. The adapter does not recover an orphan after the
supervisor dies; VF04A's existing unknown/recovery boundary remains authoritative.
Do not terminate a later process based on a recycled PID. Receiver-owned supervised
process/container identity and durable fence must prove any recovery action.

Preserve current `reconcile` deadline/withdrawal rules. Late, incomplete, malformed
or unknown executions cannot be promoted by renaming them a completed receipt.
A missing runtime or failed OS bounds is an incomplete execution and readiness
failure; don't mark it skipped/pass or charge zero actual spend.

## 5. Publication and immutable invocation changes

In `IntegrationStore.publish`, retain the existing broad observation rule only
for its reviewed fixed installed recipe. VF08's finite sample success **must not**
create an observation with `scope.inputDigest:null`. Emit only exact input digests
from the admitted VF08 result with exact environment, target, evaluator, timestamp,
expiry and receipt. Broader compatibility requires separately assigned evidence
and a receiving policy with its own justification. Negative and unknown evidence
must retain scope; no passed sample may erase an unrelated failure.

In `manifest.mjs#graphFromRows`, add only enrolled portable outcome/environment
coverage. Do not claim a complete global tool inventory because the example
exists. Keep VF01 transitive evidence and version validity rules, and keep the
original preflight path. Resolve a cold B input normally; if no exact applicability
observation exists, return unknown/gap or assign verification on that new input.
Do not reuse one passing sample to bypass an unseen input's qualification.

Replace only the portable branch of `IntegrationStore.invoke`'s synchronous
`invokeRecipe` call with the opt-in `loadInvocation` port. It is no longer safe to
hold source/grant locks across arbitrary contributed runtime/timeout and assume
rollback means nothing ran. Use the existing durable invocation/attempt lifecycle:

- Validate grant, immutable manifest/request hash, exact target/module, current
  source-cell state, evidence expiry/invalidation, environment/runtime and budget.
- Persist idempotent task/manifest/input intent and physical reservation, then run
  outside a long SQL transaction. The component is pure but its execution cost is
  real; retries must not launch duplicate work after an unknown outcome.
- Persist output/observation and terminal witness, then reread authorization and
  current affected evidence before returning or replaying. Concurrent withdrawal
  prevents use even if output arrived just beforehand. Preserve observed execution
  as historical evidence rather than falsely claiming rollback cancelled it.
- Bind the result to the exact stored resolution manifest and later task. Reuse
  outcome, useful beneficiary evidence, publication and promotion remain separate.

The port is not callable by contributor-supplied JSON functions. It has no network
fetching or authority restoration. Keep all loaders and runner writes private.

## 6. Required receiving tests before hosted acceptance

Retain every existing VF04A/VF01/VF02/VF03 adversarial test, then add real disposable
PG/HTTP cases against the final F93-repaired branch:

1. Disabled-by-default extension; absent runtime/readiness error; recipe route
   unchanged; no public runner, assignment, policy or receipt-ingest endpoint.
2. Binary artifact upload/reference authorization, exact byte/content/source pins,
   oversize-before-decode, stale cell fence, revoked grant, rights refusal and
   cross-project candidate/module reference refusal. No external artifact fetch.
3. Correct assigned verifier passes frozen cases; contributor-selected always-pass
   tests, wrong evaluator/environment/runtime, swapped candidate/module, stale
   fence and forged success/exit evidence cannot pass VF03 admission.
4. Two workers race one attempt; exactly one claims. Multiple serial child records
   cannot overwrite one another. Crash after each launch-intent/identity/result/
   exit-write boundary; restart retains unknown until actual reconciliation.
5. Timeout/cancellation while compiling, start-loop fuel exhaustion, runtime trap,
   resource failure, result-withheld-exit, failed kill witness and host death.
   No new assignment or invocation while physical outcome remains unknown.
6. Cancellation or invalidation between sample cases stops new launch; candidate
   withdrawal after final output but before receipt/outbox commit prevents use.
7. `publish` creates exact input evidence only. An unseen B input remains unknown
   until independently assigned; once verified, a cold B resolves the exact
   immutable version and uses a fresh process. Unrelated inputs stay unknown.
8. Runtime/native/worker/evaluator/source/test drift invalidates matching scope.
   Same coordinate/different content and transitive reference mutations remain
   distinguishable under F93; Unicode/full-domain refs are never truncated.
9. Invocation lost-ack retry reuses the durable terminal record; changed task input
   or manifest under the same key conflicts. Unknown invocation cannot retry into
   duplicate physical cost. Retraction/expiry invalidates replay and current use.
10. All failed/missing/unknown outcomes and accepted-with-zero-reuse denominators
    remain visible in status/cohort projection. Always-pass falsely accepts the
    faulty control; always-fail falsely rejects useful outputs; independent oracle
    separates them without inventing token savings or external usefulness.
11. Package on the actual receiving host under its resource/container setup and
    verify no guest FS/network/environment path. Measure process CPU/RSS, startup,
    compilation and end-to-end wall; distinguish rlimits from any cgroup bound.

Do not replace these tests with a passing standalone demo. This worker exercised
the real runtime/ports but did not mutate or boot VF04A's in-flight checkout.

## 7. Bounded hosting continuation

After source/authority review and receiving tests, use the existing host rollout
process for a single enrolled synthetic project and installed verifier policy.
No public endpoint, default-branch merge, production migration, shared-runtime
change or deployment occurred in VF08. Keep runtime upgrades pinned and receipts
revocable through the existing owner. Native isolation strengthening, physical
invocation persistence, F93 adapter reconciliation and independent operator
experiments are the remaining receiving work, not hidden completed claims.

For a later external experiment, freeze need/input rights, exact cases, applicability
scope, output oracle and costs before inviting independent operators. Preserve a
voluntary decline/reuse-only path and unknown relationships. Correct handling of
an unknown write is useful correctness evidence, not payment, delivered work or
proven economic uplift. This foundation supplies the missing executable artifact
boundary; the cumulative asset still requires maintained, independently admitted
applicability evidence and later useful tasks.
