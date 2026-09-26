# VF01 contracts and semantics

All code is exported from `src/index.mjs`. Node 22+, no added dependencies.
The executable validators in `src/contracts.mjs` are the normative field
specification; JSON Schema draft semantics are not implied. Unknown contract
fields are rejected unless explicitly retained as opaque provenance data.
IDs are opaque namespaced strings, at most 512 characters. UTC timestamps use
`YYYY-MM-DDTHH:mm:ss[.SSS]Z`. Full SHA-256 values use `sha256:<64 lowercase hex>`.

## Envelopes

Every schema below has the prefix `neomorphic.foundry.` and suffix `.v1`.

| Type | Required fields / meaning |
| --- | --- |
| `capability-version` | `schema, capabilityId, version, contentId, source, outcomes, input, output, dependencies, rights, environment, provenance` |
| `compatibility-observation` | `schema, id, target, scope, verdict, observedAt, expiresAt, observerId, receiptRef` |
| `capability-mutation` | `schema, id, kind, target, replacementId, revision, previousId, at, reason, provenanceRef` |
| `capability-snapshot` | `schema, versions, observations, mutations, coverage, snapshotId` |
| `capability-request` | `schema, taskId, outcome, input, environment, output, capabilityId` |
| `capability-resolution` | `schema, snapshotId, requestId, taskId, now, policyId, policyRef, status, selected, reasons, coverage, candidates, boundaries, resolutionId` |
| `capability-page` | List: `schema, snapshotId, items, nextCursor, total`. Resolve: resolution summary plus `resolutionSchema, candidates, nextCursor, candidateCount, complete`, with the full-result `resolutionId` preserved. |
| `capability-impact` | `schema, snapshotId, target, impacted, unaffectedCount` |
| `verification-target` | `schema, snapshotId, target, source, input, output, outcomes, dependencies, environment, rights, provenanceRefs, admissionRequired:true, proposedTestsExecutable:false` |
| `gap` | `schema, id, revision:1, taskId, outcome, requestId, constraintsDigest, resolver, reason, candidateFailures, reproducer, funding, contentId` |
| `reuse-observation` | Synthetic evaluation export: `schema, id, revision:1, target, sourcePin, taskId, priorTaskId, observedAt, relationship, independence, outcomeSource, resolutionId, expected, baseline, reuse, adaptation, receiptId`. This example producer is not VF03's authoritative cohort/receipt admission implementation. |

Auxiliary CLI/report schemas follow the same convention:
`capability-adapter`, `capability-demo`, `capability-error`, `synthetic-holdouts`,
`synthetic-reuse-evaluation`. Their exact output is available from the cold CLI
and checked examples. No incoming contributed `VerificationReceipt` is accepted
or promoted by this module. VF03 owns that authenticated admission contract.

## CapabilityVersion

`createVersion(body)` clones and freezes the entire manifest, computes
`contentId = SHA256(canonical JSON of every field except contentId)`, validates
it, and rejects a supplied contentId. `validateVersion(record)` checks an
already-computed identity. Canonical JSON sorts object keys with codepoint
comparison, preserves arrays, and does not silently normalize strings. Array
order is part of a manifest's content; reordered records in a snapshot are not.
The manifest digest attests stored metadata, not downloaded artifact bytes.
The source revision and VF03 artifact verification must bind executable bytes.

- `capabilityId`: source/package coordinate, e.g. `npm:s180-capability-consumer-kit`.
  S04's unnamespaced ID is reversibly qualified as `s04:<original id>`; the exact
  original ID and full record remain in provenance. No separate catalog identity.
- `version`: opaque exact version, not a floating semver range. Package adapter:
  `<package.version>+git.<full source revision>`. S04: `git:<full source revision>`.
- `source`: `{repository, revision, path}`. Revision is a full 40/64 hexadecimal
  commit/digest. Path is relative with no parent traversal. No URL is fetched.
- `dependencies`: up to 100 exact `{capabilityId, version, contentId}` references.
  Duplicate coordinates fail. A supplied version with different bytes is a
  target mismatch. Absent dependencies are unknown, not implicit success.
- `rights`: `{status:'allowed'|'denied'|'unknown', license:string|null, ref:id}`.
  It is an operator-supplied rights assertion, not automatic license adjudication.
- `environment`: map from dimension names to nonempty allowed scalar arrays,
  e.g. `{nodeMajor:[22],platform:['linux']}`. No guessed semver range semantics.
- `provenance`: `{refs:[id], origin:id, maintainer:id, classification, funding,
  actionability, original:JSON}`. Classification is `maintained|historical|demo`;
  funding is `voluntary|unfunded-request|funded|unknown`; actionability is
  `actionable|not-actionable|unknown`. These facts remain separate from usability.
  Opaque originals are data, never instructions. The host must ensure they are
  permission-cleared before publishing; resolver output retains provenance.

Input and output use a bounded structural type language: `type` is one of
`string|number|integer|boolean|array|object|null`, optional `enum`, objects require
`required` and `properties`, arrays optionally have `items` and `maxItems`.
Nested shapes are bounded to eight levels; input diagnostics are capped at 128 plus an omission marker. Additional input object properties
are allowed. Unsupported constraints (regex, references, scripts, format rules)
are rejected instead of weakened. Object output with empty properties makes no
field guarantees. A requested output constraint must be guaranteed by the
manifest's declared output type. Request `output:null` adds no such constraint.

## Evidence and admission

`target` is always the exact three-field version reference. Scope is
`{outcome, environment, inputDigest}`. Environment equality is exact, including
all supplied dimensions; each declared target requirement must be bound.
`inputDigest:null` explicitly declares coverage of the whole typed input
contract; a digest binds one input. A verifier must justify that broad coverage.
There is no inference from sample success to whole-contract coverage here.

Verdict is `compatible|incompatible`. Expiry is null or strictly after
observation time. At the exact expiry instant evidence is expired. Future,
expired, out-of-scope, unadmitted, corrected, retracted, inactive-correction-branch
and dependency-stale observations remain in audit output and cannot create a hit.
The snapshot retains the original scopes and receipts.

`resolve(...,{now,policy})` accepts host-owned policy
`{policyRef:id, admittedObservationIds:[id]}` separately from the request.
Default policy admits nothing. Both positive and negative evidence require
admission. IDs must exist in the snapshot and be unique. This is a projection
input, **not authentication**: a caller that controls policy can manufacture a
compatible answer. Hosted handlers must obtain the policy from authenticated
VF03 receipt decisions and must not forward arbitrary request JSON as options.
Maintenance mutations, rights, manifests and coverage likewise require an
operator-authorized persistence boundary. Neither a hash nor an observerId
proves independent execution. `verificationTarget` exports a revision-bound
contract, without executing tests or carrying original proposed-code payloads.

## Corrections, lifecycle and dependency propagation

A mutation is append-only. Kinds are `correct-observation`,
`retract-observation`, `deprecate-version`, `revoke-version`. Observation target
is its ID; version target is its exact reference. Only correction accepts a
non-null `replacementId`. Each target stream starts at revision 1 with
`previousId:null`, then advances by one with the exact previous mutation ID.
A reused mutation ID with different bytes, revision fork, missing predecessor,
backward timestamp, missing target or changed content fails closed.

A replacement is a separate immutable observation of the **same version and
same scope**, observed exactly at correction time. Replacement IDs belong to
one correction only. Chains are acyclic and bounded to 64. Before effective
mutation time, the original remains active and the replacement is inactive.
Only the current revision applies; no record is overwritten. Correcting scope
requires retracting the old observation and separately admitting a new one.

Deprecation excludes that exact version from automatic qualified reuse.
Revocation is terminal; restoration requires a new version. Reverse dependency
impact is indexed by exact coordinate and checked content pin. Revocation,
deprecation, known unsupported environment and denied rights propagate definite
incompatibility to dependents. Missing dependencies, unknown rights/environment
and traversal limits propagate unknown. Unrelated versions remain untouched.

Parents rely on admitted **composition** evidence bound to their manifest
(including exact dependencies); the graph does not invent per-edge invocation
inputs. A new admitted negative, evidence correction/retraction, or expiry in
any exact transitive dependency and the same environment invalidates older
composition evidence to `dependency-stale`. This yields unknown and requests
replay, not an assertion that every composition is incompatible. A fresh admitted
composition receipt strictly after that event can establish compatibility again.
Input-specific dependency negatives conservatively require replay because the
parent's internal invocation mapping is not supplied. Other environments and
other dependency pins do not invalidate it. Dependent version publication after
a pin change cannot inherit observations from an older version.

`dependencyImpact(snapshot,ref)` returns the exact affected reference closure;
it reports potential projection work, not new registry revocations. Shared DAGs
are memoized; traversal is bounded and diagnostics are capped (16 detailed
messages plus an omission marker, 1024 characters per dependency diagnostic).
Severity is retained even when details are truncated; replay snapshot records
for the full underlying graph. Depth over 64 / traversal over 50,000 returns
unknown. No global invalidation or all-to-all messaging.

## Snapshot, resolution and pagination

`createSnapshot({versions,observations,mutations,coverage})` stable-deduplicates
identical records, sorts by identity, validates cross references and revisions,
then freezes and hashes the result. `readSnapshot(raw)` validates serialized
snapshots and recomputes their hash. Only these constructed objects can be
queried. `appendSnapshot(snapshot,{versions?,observations?,mutations?,
expectedSnapshotId})` performs compare-and-swap on the prior hash. A repeated
identical append is a no-op; conflicting identity is an error. These are pure
functions. Concurrent persistence and durable idempotency belong to the host.

Coverage is `{outcomes:[string],complete:boolean,sourceRefs:[id],asOf:UTC}`.
Completeness is an explicit inventory-owner assertion about that snapshot and
those outcomes, not the internet. Refresh it by constructing a new snapshot;
append does not advance it. Zero matching candidates yields `missing` only
inside complete coverage, otherwise `unknown`. No implicit freshness horizon is
invented for coverage; the host must constrain snapshot retention/currentness.

Request is `{schema,taskId,outcome,input,environment,output,capabilityId}`;
`capabilityId:null` permits all outcome candidates. Input may be any bounded
JSON compatible with the candidate type. Resolver does not return raw inputs.
Candidate status is known-incompatible for a definite type/environment/rights/
lifecycle failure or an unopposed scoped negative; unknown for unresolved
conditions or conflicting positive/negative evidence; compatible only when all
checks pass with admitted positive evidence. A definite constraint can rule out
a candidate even if other observations conflict. Aggregate precedence:
compatible hit, else any unknown candidate, else known-incompatible candidates,
else scoped missing/unknown. `known-incompatible` describes the known candidates;
`createGap` additionally requires complete coverage. Candidate order and selection
use coordinate codepoint order, **not** newest semver, recommendation, price,
reputation or commercial actionability. Selection is deterministic usability.

`resolvePage` keeps the aggregate verdict, selected reference and full-result
hash stable across pages. All candidates are evaluated before pagination, so a
late compatible candidate cannot be mistaken for a gap. `listVersions` paginates
inventory directly. Page size is 1..100 (default 25). Cursors are opaque base64url
anchors bound to snapshot and query; resolution cursors also bind clock and
policy through `resolutionId`. Changing page size is allowed, changing request,
snapshot, policy or clock invalidates the cursor. Cursors are integrity checks,
not signatures or access grants. The host must authenticate/authorize every page.
`complete` in a result page means the end of that traversal, not inventory coverage.

This foundation materializes a bounded snapshot in memory and recomputes
resolution per call. It is not a streaming database query. Limits: 5,000 version
records, 20,000 observations, 20,000 mutations, 16 MiB JSON, depth 32, 500,000 JSON
nodes. Duplicate entries count toward ingress limits. APIs reject prototypes,
reserved keys, accessors, functions, sparse/decorated arrays, cycles and non-finite
numbers. Host cache/index/persistence work is specified in the receiving plan.

## Gaps and reuse exports

`createGap(snapshot,request,options,{gapId,reproducer,funding})` accepts only a
scoped miss or entirely incompatible candidates with complete coverage.
Reproducer is `{ref:id,permission:'synthetic'|'authorized'}`. Funding is
`{kind:'voluntary'|'unfunded-request'|'funded',ref:id|null}`; funded requires an
authoritative reference, never a price. Constraints and inputs are represented
by digests; the authorized reproducer carries the requirements for the work cell.
Resolver snapshot, policy and clock are pinned. Recipient must enforce
`(gap.id,revision) -> contentId` idempotency; a different payload conflicts.

Held-out reuse exports bind a different later task, exact version and local
output receipt; the six example tasks declare `owner-controlled` and
`not-independent`. Actual cost and adaptation effort are null. The synthetic
baseline and dataset have separate digests. VF03 must map these records into
its accepted reuse contract, preserve unknown independence for actual callers,
and never treat local timings, catalog views, downloads or consistency as
revenue. Existing funding and payment records remain authoritative separately.

## Adapters

- `adaptS04(raw,{source,rights,environment?,now,inputs?})`: uses existing
  `validateCapability`, `inputsCompatible`, `discloseCapability`; returns a
  version plus original disclosures and diagnostics. Original record/price is
  retained. Stale quotes are diagnostics, not compatibility or funding evidence.
  Historical/superseded records and fixtures become not-actionable. Explicit
  source actionability/funding assertions remain provenance claims. No observation
  is generated and no demo adapter is promoted to actual hosted execution.
- `adaptPackage({manifest,source,outcomes,input,output,dependencies?,rights,
  environment,provenance})`: pins the existing npm coordinate to source. Manifest
  scripts/entry points are retained as data; none are run. Environment/type/rights
  declarations must be explicitly supplied. MIT is used only for the allowlisted
  preflight sample; website-wide rights are not inferred.
- `adaptPreflight(report,{target,receiptRef})`: calls existing trust/cost lane
  classifiers, retains the supplied report, emits no observations. Content
  binding and caller `accepted`/`executionVerified` claims remain distinct from
  independent verification and actual spend.

## Errors and cold CLI

Malformed input raises a coded error; CLI exits 2 with a JSON error on stderr
and no success stdout. Codes include `INVALID_INPUT`, `LIMIT_EXCEEDED`,
`IDENTITY_CONFLICT`, `CONTENT_MISMATCH`, `TARGET_MISMATCH`, `REVISION_CONFLICT`,
`CORRECTION_CYCLE`, `INVALID_CURSOR`, `STALE_CURSOR`, `ADAPTER_REJECTED`, `NOT_A_GAP`.
A successful query exits 0 regardless of hit/miss/unknown status. CLI accepts
bounded regular JSON files (nonblocking open rejects special files), no stdin
scripts, dynamic plugins, contributed test proposals or shell commands.

```sh
node scripts/visitor-foundry/capabilities/src/cli.mjs fixture snapshot > scripts/visitor-foundry/capabilities/evidence/tmp/snapshot.json
node scripts/visitor-foundry/capabilities/src/cli.mjs fixture request > scripts/visitor-foundry/capabilities/evidence/tmp/request.json
node scripts/visitor-foundry/capabilities/src/cli.mjs fixture policy > scripts/visitor-foundry/capabilities/evidence/tmp/policy.json
node scripts/visitor-foundry/capabilities/src/cli.mjs resolve --snapshot scripts/visitor-foundry/capabilities/evidence/tmp/snapshot.json --request scripts/visitor-foundry/capabilities/evidence/tmp/request.json --policy scripts/visitor-foundry/capabilities/evidence/tmp/policy.json --now 2026-09-26T12:00:00.000Z --limit 1
```

The fixture policy is owner-controlled synthetic admission. Removing `--policy`
returns unknown. `help`, `schemas`, `build --input`, `list --snapshot`, and
`impact --snapshot --target` expose the remaining cold operations.
