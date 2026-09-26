# VF04A receiving contract

Current VF09 receiving amendment: [compound result](COMPOUND-RESULT.md),
[executed ports](compound/ports.json) and [Heavy hosting plan](VF09-HEAVY-RECEIVING-PLAN.md).
It adds actual VF05 participation and bounded VF08 contributed-code execution;
F93 identities and the durable revalidation lifecycle remain in force. Earlier
sections below retain their historical scope and receipts.

Current tested implementation: `689233f2131669fdcb05f62f96452629dda479f3`;
[lifecycle result and exact test receipts](LIFECYCLE-RESULT.md). Later receiving
documentation changes no runtime behavior at that pin.

The F93 amendment freezes [the executable wire schema and vectors](wire/README.md).
The maintained-evidence lifecycle is specified in [lifecycle/README.md](lifecycle/README.md)
and [installed maintenance ports](lifecycle/ports.json).
Runtime authority is existing PostgreSQL correspondence data and scoped grants.
No client-supplied snapshot, policy, actor, verifier, receipt, budget, environment
attestation or accepted flag can restore authority. The public router exposes no
operator or runner callback. Private methods are trusted installed host ports.

## Reconciliation of the three source contracts

| Source fact | Durable receiving mapping |
| --- | --- |
| VF01 exact `{capabilityId,version,contentId}` | Whole original manifest and original refs persist. The verified internal ID is the full SHA-256 of `[capabilityId,version]`; revision is contentId. `validation-identity-binding.v1` retains and verifies both domains; max 100 dependencies. |
| VF01 gap `revision:1`, `contentId`, resolver pins | Full gap persists in `gap-binding.v1`; VF02 uses distinct `work-cell-gap.v1` with contentId, never a digest-valued revision. Snapshot/reproducer references retain original provenance. |
| VF02 submitted cell | Admission rereads the authoritative project/cell, exact revision, fence, submitting grant, submission ID, artifact digest, source-descriptor digest and fixed allowed rights. |
| Contribution source revision | `hash(manifest.source)`; full repository, Git pin and path remain in the manifest. The JSON artifact has a separate content digest. |
| VF03 `verification_receipt.v1` | Stored immutable result admitted by actual `ValidationService.dispatch`. Internal runner identity/group and assignment evidence are installed by the host. |
| VF02 `verification-receipt.v1` | Explicit, differently shaped projection from the admitted receipt: exact submission/cell/project, source/artifact, runner, policy/environment, owner-controlled relationship and candidate disposition. Never parse it as a VF03 receipt. |
| VF01 compatibility observation | Only accepted, reconciled outbox publication can create the ordinary recipe observation. Exact target, environment, verifier, generation/profile, receipt and original validity are retained. Default validity is one hour; installed bounds are 100ms–one hour. Renewal requires a new real receipt. |
| VF03 reuse observation | Derived from an actual durable invocation plus an immutable experiment case and its input digest. Relationships remain owner/owner_qa. Unknown output remains unknown; no external attestation is invented. |

VF03's reference expiry semantics are not modified. Its `expire` command is
called only after this receiver has proved termination or that an attempt never
received launch authority. `maxAttempts=1` per generation prevents automatic retry; up to four generations are available only through explicit installed revalidation; unknown
physical reservations gate every new assignment. Its concurrency counter alone
is not the durable physical-capacity gate. F93 identity/schema guarantees remain. The lifecycle amendment adds only installed policy/revalidation/unknown-result transitions to the same VF03 coordinator; original adversarial gates remain.

## Public HTTP API

Prefix: `/v1/projects/:projectId/foundry`. Existing Bearer project grants, CORS,
rate limit and proxy settings apply. An opted-in maximum-domain receiver sets the existing body parser to 512KiB; the base service default stays 32KiB (explicit HTTP 413 above it). No bearer is stored
in commands or evidence. Reader access includes discovery, invocation and opt-out.
Writer/owner grants are needed for candidate admission and cohort observation.
Unknown fields are refused by the integration or imported strict validators.

| Method/path | Input and result |
| --- | --- |
| POST `/resolve` | Exact VF01 capability-request. Returns `{resolution,manifest}`. Unknown/missing/incompatible is a normal typed result; manifest is null unless compatible. |
| POST `/gap` | Same request, whose input must equal an explicitly cleared frozen original task. VF01 must produce a genuine complete-scope gap. Returns `gap-binding.v1` containing the full gap and explicit `cellGap` projection for VF02. Does not create or claim a work cell. |
| POST `/candidates` | `candidate-admission.v1`: `{schema,cellId,workflowRevision,fence,identity,artifact}` plus `Idempotency-Key`. Identity is the full `candidate-identity.v1`. Returns canonical candidate ID, original identity, duplicate/replay and next step; unsupported returns HTTP 422 with unchanged original identity and no partial admission. |
| POST `/invoke` | `{manifestId,request}`. Request hash must match the stored manifest and input digest. Rereads/rechecks current scoped evidence, exact runtime installation and source cell before executing the installed pure recipe. Returns exact target, observed output, manifest/input binding, task, timestamp and unknown cost/effort. |
| POST `/observe` | `{arm,caseId,experimentId,taskId}` plus key. Matches the grant's actual invocation against frozen case bytes; allowed arms are reuse_only/contribution. No client-provided success, independence or cost upgrade. |
| POST `/decline` | `{reason,taskId}` plus key. Records voluntary opt-out and creates no candidate/cell/reservation. |
| POST/GET `/environment-evidence` | Writer submits exact `environment-evidence-submission.v1` with idempotency key; authorized readers list durable observations. They remain explicitly not-replayed even after supplied-log review and cannot enter compatibility/budget paths. |
| GET `/status` | Bounded enrolled-budget projection: candidate stages, attempt/reservation states, publication states and VF03 reuse/cost projection. Includes accepted revisions with zero reuse. |

`/receipt`, `/assign`, `/revalidate`, `/configureVerification`, `/snapshot-import`, enrollment and migration HTTP routes
do not exist. Runtime core methods are documented below, not callable using a
visitor grant. Normal candidate state is pending → accepted/rejected; publication
and recommendation are separate. This implementation never calls VF03 promote.

Keys are 8–200 characters, project-scoped and bound to grant ID plus canonical
body. Exact replay returns historical output; present authorization is always
rechecked. Candidate semantic dedup survives new command IDs and process restarts:
the key binds package coordinate, exact source, artifact, dependencies, interface,
outcome, environment and rights. Caller naming, cell and command ID cannot mint
another verification. Distinct declared recipes may be material changes and are
still subject to the finite backlog/budget.

Stored invocation identity is `(project,taskId)` with pinned manifest/input.
Exact request retries return the observed output only after current evidence is
rechecked. A different manifest or input under the same task is refused. No new
payment or external side effect occurs: the installed interpreter is pure and
bounded. A new external executor needs a separate durable side-effect contract.

Unsupported responses have the explicit `unsupported.v1` envelope above; other error responses have `{error:{code,nextAction}}`. Invalid VF01 input is 400;
invalid/expired grant 401; role denial 403; foreign project/unconfigured pool 404;
semantic/fence/binding/capacity refusals generally 409. Unknown DB/commit outcome
is 503 and requires reconciliation. Absence of an acknowledgement is not failure.

## Durable storage and transaction rules

Migrations: `services/correspondence/migrations/visitor-foundry/001_vf04_integration.sql`
and `002_vf04_wire.sql`, `003_vf04_revalidation.sql`; explicit application in order.
Rollback 003 then 002 then 001; 003 refuses to erase maintained generations, recorded execution profile/validity
bindings (even generation 1), or installed maintenance decisions.
Same explicitly validated namespace as correspondence and VF02; no new provider.

| Table / existing scope | Authority and key |
| --- | --- |
| `correspondence_vf04_pools` | One immutable base config/budget per enrolled project; explicit installed verification profile is separately journaled. Exclusive mutation lock; shared discovery/use lock. |
| `correspondence_vf04_identities` | Original exact refs plus checked native aliases keyed by full coordinate hash, transactionally checked on admission and replay. |
| `correspondence_vf04_environment_evidence` | Supplied evidence and review metadata, permanently non-replayed here; no graph/receipt authority. |
| `correspondence_idempotency`, scope `vf04:transition` | Trusted actor, exact VF03 command, server time, revision and committed response; unique project/revision index. Replayed under freshly installed handles. No snapshots are imported. |
| Same table, scope `vf04:maintenance` | Installed operator request signature and durable response; scoped policy/renewal keys, bounded to maxCommands (4096). Exact replay does not apply the operation again. |
| Same table, scope `vf04:http` | Exact grant/command request hash and original response. No automatic expiry. |
| `correspondence_vf04_candidates` | PK project/id; unique project/semantic key and project/submission. Original VF02 binding, VF03 candidate, VF01 manifest, bounded artifact. Separate current generation and immutable-per-generation verification profile; semantic identity remains unchanged. |
| `correspondence_vf04_attempts` | PK project/assignment; unique project/candidate/generation. Immutable assignment/fence and verification profile; physical state, supervisor, process identity, result and termination witness. All historical rounds retained. |
| `correspondence_vf04_publications` | PK project/candidate/generation. Exact accepted receipt and verification profile plus pending/published/withdrawn outbox state. Old round publication cannot stand in for the current round. |
| `correspondence_vf04_graph` | Immutable typed version/observation/mutation records with host authority provenance. Exact version/record identities cannot be overwritten. |
| `correspondence_vf04_shares` | Explicit host-authorized direct source → consumer project sharing. No transitive/global publication inference. |
| `correspondence_vf04_manifests` | Immutable content-hashed resolution manifests, scoped to beneficiary project. Input is a digest; request's raw input is null. |
| `correspondence_vf04_gaps` | Immutable first gap evidence and original resolver pins. Repeated task requests keep that first evidence. |
| `correspondence_vf04_experiments` | Exact original/held-out synthetic inputs, baseline source digest and server freeze time. New experiments after candidate enrollment are refused. |
| `correspondence_vf04_invocations` | Exact task/manifest/input and actual bounded result; unique project/task. |

Original-identity registry insert + candidate insert + VF03 admission + HTTP key commit together. Assignment,
reservation charge and attempt fence commit before launch. Receipt admission +
physical reconciliation + pending publication commit together. Publication writes
the immutable graph and published acknowledgement in one transaction. Retries do
not repeat a charge, candidate, receipt or graph record. There is no second
generic event store; VF03 transition history uses existing idempotency storage.

All logical mutation locks are tenant/budget-local. VF02 cell writes do not take
the VF04 pool lock. Shared evidence reads acquire the exact source pool locks in
sorted order; source mutation is ordered against dependent use. No global network
lock or process-wide aggregate exists. Shared source invalidation is read live,
not copied into caches that can lose a notification. VF02 withdrawals also derive
exact graph revocations before the next worker pass; the worker records the
corresponding VF03 invalidation and outbox withdrawal.

Per host: base pool 1 in tests, cells 2, integration 2. Integration pending request
bound 128, connection 3s, lock 1.5s, statement 5s, query 6s, idle transaction 10s.
Each enrolled budget: backlog 16, one running reservation, 256 candidate records,
4096 transition commands, 128MiB nominal memory reservation, one attempt per
candidate. The finite fixture CPU/wall/currency cap totals are in `poolConfig()`;
they are capacity allocations, never measured expenditure or payment authority.

## Installed runner and recovery ports

Trusted exports: `IntegrationStore.enroll`, `reserve`, `claimAttempt`,
`runnerWrite`, `markUnknown`, `reconcile`, `reconcileUnlaunched`, `publish`,
`invalidate`, `retract`, `shareOwnerQA`, `installOwnerQAEvidence`; and
`supervise(store,project,assignment)`, `recoverPool(store,project)`.

`installOwnerQAEvidence` is an explicit operator fixture port for graph tests,
never a visitor snapshot restore or production evidence importer. External
evidence admission needs an authenticated source adapter in Heavy's rollout.

Physical attempt states:

```text
reserved --durable supervisor claim--> running
reserved/running --deadline--> unknown (capacity remains held)
running/unknown --observed process exit + retained result--> result
result --receipt/timeout/invalidation reconciliation--> reconciled
```

`reserved` with no supervisor proves no launch was ever authorized; recovery can
atomically record that fact and reconcile. A claimed attempt with missing process
identity does not prove absence of a child. It remains unknown. Supervisor
restart/crash cannot release it based on an expired lease or PID disappearance.
There is deliberately no universal orphan-process adoption mechanism here.

The supervisor commits its identity before spawn and the child's Linux boot ID,
PID and start ticks before sending execution input. It forks only repository-owned
`runner-child.mjs`, no submitted programs/commands. `prlimit` enforces a 2-second
CPU ceiling; the child uses a 64MiB V8 heap bound, bounded inputs and a deadline
kill whose exit is actually awaited. 128MiB is a reservation, **not an enforced
total-RSS cgroup limit**. The owned deterministic interpreter is the only supported
runner; this is not a sandbox for adversarial contributed code. Measured receipt
CPU/wall covers the evaluator body; process startup and host/DB overhead are not
misrepresented as measured verification spend.

Evaluator/probe bytes, exact Node version, architecture/platform, policy and
environment digest are pinned. Candidate testProposal is data. Source refs are
never fetched. The JSON recipe accepts only `{kind:'preflight-engine-v1',
maxRangeLength:16..256}` and invokes the existing preflight engine probe. Unknown
grammar stays unknown. A dependency-bearing recipe fails composition because this
installed interpreter has no dependency invocation mapping. It never treats two
individually accepted components as a checked composition.

## Immutable resolution manifests

Schema `neomorphic.foundry.resolution-manifest.v1`: content hash ID, exact target,
request hash and digest-only request, applicability, policy/runtime pin, source
snapshot/resolution IDs, creation/valid-until, all transitive version manifests,
exact edges and their parent composition evidence, scoped admitted observations,
mutations and active root evidence IDs. Evidence validity is not widened beyond
its source. Whole-contract positives are restricted to the installed bounded
total recipe whose complete configuration was checked; arbitrary sample replay
cannot receive that scope.

Before invocation, VF01 resolves the pinned target again under current time and
authority. Changes to affected versions/edges/evidence/admission/policy fail;
retraction, dependency expiry and source withdrawal fail; an unrelated inventory
append, expired audit-only row or different environment's evidence does not
poison the valid branch. New preferred candidates do not silently switch an
already pinned invocation to another version. Locks are held through this bounded
pure invocation. A network executor must not hold these transactions while
performing external work; its required reservation/outcome protocol is future work.

## Explicit maintenance and evidence retirement

`configureVerification(projectId, {expectedVerificationId,revision,validityMs}, key)`
is an installed operator method. It derives the profile from actual source/runtime
and existing immutable pool limits; it cannot import code, choose a runner or
refill budget. Policy/runtime changes retire prior positive observations through
existing append-only mutations. A running round retains its assigned policy and
physical reservation. Supplied visitor logs remain non-replayed.

`requestRevalidation(projectId, {candidateId,expectedGeneration,expectedVerificationId,reason}, key)`
requires current source/cell/scope eligibility. Reasons are expiry,
evidence_retracted, verification_changed or retry_failure. Exact keys replay;
concurrent requests for one predecessor/current profile coalesce. Enqueue appends
evidence retirement and a native revalidation transition atomically. It retains
the exact candidate, artifact, manifest and semantic key, and changes only the
verification generation/profile. A changed artifact/source needs new admission.

The receiver allows four generations, one attempt each, within existing aggregate
caps. Each actual assignment charges another full reservation. No refund follows
unknown spend or missing exit proof. The native reference cap is eight; this
receiver intentionally narrows it. Physical work must reconcile before another
generation can replace it. A queued obsolete profile may be explicitly closed
as unknown with no launch, then superseded; no execution cost is fabricated.

Publication is `publish(projectId,candidateId,generation)`, with default generation
1 for compatibility. It never means latest. Scope, source eligibility, actual
runtime, current profile, generation, assignment/receipt and original expiry
are checked again. The bounded recovery pass only selects current-generation
outbox rows. Historical pending, expired, failed and unknown rows remain audit
data; none becomes compatibility merely because renewal is queued.

Historical observations stay admitted to dependency-health analysis with their
original validity and retirement mutations. Removing them from that analysis
would hide expired evidence and could revive a stale parent composition. Fresh
component evidence therefore never substitutes for replaying the parent.

The installed public recipe accepts runtime versions matching
`v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)`, with safe integer
components. Malformed/partial/prerelease/build forms return unknown; incorrect
input types remain typed errors. Engine ranges retain the existing `>=N`/`>=N.M`
grammar. The recorded probe cases are enumerated tests, not exhaustive testing of
the whole domain. The preflight artifact's source bytes are pinned separately
from current host evaluator/runtime/profile changes.
