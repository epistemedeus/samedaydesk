# Authoritative F93 receiving wire contract

The executable schema is [../src/wire.mjs](../src/wire.mjs), exported through
`validateWire(value)`. It delegates exact identity and immutable gap validation
to VF01's actual validators. Consumers must import this contract or reproduce
its conformance vectors; native VF03 aliases are never the external identity.
[receiving-ports.json](receiving-ports.json) records routing, limits and ownership.
[conformance-vectors.json](conformance-vectors.json) contains complete deterministic
maximum-domain inputs, expected mappings, a maximal gap, and negative inputs.
`vectors.mjs` constructs them from actual VF01 version/gap producers.

```sh
node scripts/visitor-foundry/integration/wire/export.mjs --check
node --test scripts/visitor-foundry/integration/tests/wire.test.mjs
```

No JSON Schema approximation replaces the executable schema: VF01 lengths are
JavaScript UTF-16 code units, while JSON Schema `maxLength` counts Unicode code
points. Astral characters and lone surrogates are covered explicitly. Reject
unknown fields. Do not normalize Unicode, trim version strings, truncate values,
or discard a pin. SHA-256 inputs use VF01 `stableJSON`, not insertion-order JSON.

## Records and revisions

Every schema name below has prefix `neomorphic.foundry.` and suffix `.v1`.

| Schema | Exact shape / meaning |
| --- | --- |
| `candidate-identity` | `{schema,target,dependencies}`. Each ref is exactly `{capabilityId,version,contentId}`; ID and version each 1–512 code units with VF01 syntax. Dependencies max 100, unique coordinates. Conflicting content under one coordinate is an error. |
| `validation-identity-binding` | `{schema,original,native}`. `original` is the whole candidate identity. `native` contains `capability` and `dependencies`. Each internal ref uses `id = 'capability:' + hash([capabilityId,version]).slice(7)` (all 64 hex digits) and `revision = contentId`. `fromValidationIdentity` recomputes and verifies every alias before returning the original. |
| `gap` | VF01's immutable full gap. `revision:1` is a format revision, `contentId` hashes every other field. `validateGap` verifies both shape and digest. |
| `work-cell-gap` | VF02 projection `{schema,id,contentId,resolverSnapshot,reproducer,permission,fundingKind}`. Its canonical ID supports 512 code units. It has no workflow revision. It is never parsed as `gap`. |
| `gap-binding` | `{schema,gap,cellGap}`. The full original gap and exact projection travel together. `fromGapBinding` verifies the projection and returns the full original. Funded gaps return explicit unsupported; work cells remain voluntary/unfunded. |
| `candidate-admission` | `{schema,cellId,workflowRevision,fence,identity,artifact}`. The integer `workflowRevision` is the current VF02 cell CAS; fence is its current lease/submission fence. Neither is a capability version or gap digest. |
| `unsupported` | `{schema,status:'unsupported',reason,original,limit,accepted:false}`. HTTP 422. Original identity/data remains intact. No candidate, identity row, receipt, reservation or HTTP idempotency row is committed. |
| `environment-evidence-submission` | `{schema,target,scope,evidence,observedAt,claim,permission}`. Exact target; scope `{outcome,environment,inputDigest}`; evidence `{uri,digest}` with credential-free HTTPS; UTC observation time; explicit synthetic/authorized-reusable permission. These are supplied claims. |
| `environment-evidence-observation` | Host output `{schema,id,submission,grantId,receivedAt,replay,review}`. Replay is always `{status:'not-replayed',assignmentId:null,receiptId:null}`. A supplied-evidence review adds reviewer/note/time only. POST adds the ordinary HTTP `replayed` idempotency flag; it does not mean evaluator replay. |

The VF02 contribution field `gapRevision` retains its existing name but is
**the immutable canonical gap contentId**, not a CAS integer. Work-cell commands
continue to use `expectedRevision`; work-cell records use `revision`. Native
VF03 `revision` in a capability ref is only the retained exact contentId.

The original complete candidate manifest remains durable in `vf04_candidates`.
A second durable registry stores original refs and checked aliases keyed by the
full coordinate hash per project. Admission checks same-coordinate/content
conflicts under the pool lock; journal replay verifies registry and manifest
bindings. A hash is an index key, never permission to throw away the original.
The full gap and task ID remain durable; the bounded native task ID hashes both.

## Supported execution versus representable identities

The wire and native adapter support 100 dependencies. Native VF03's candidate
and command schemas now support 100 and the real dispatch conformance test
admits all 100 as pending using installed fixture dependency authority.
The current installed VF04 recipe admits at most 32 dependencies, and only its
exact derived package identity. More than 32 returns `installed_dependency_limit`
with maximum/requested counts; another target returns
`installed_capability_identity_unavailable`. An unavailable installed recipe
returns `installed_recipe_unavailable`. Inputs are never renamed to fit.
Any admitted dependency-bearing recipe still fails the installed composition
execution check: no passing component implies a passing composition.

Admission has a 512KiB byte cap. Configure an explicitly enabled receiving host's
existing body parser to 524288 bytes to receive the maximum coordinate/dependency
vectors; the base service retains its default 32KiB. Its earlier HTTP 413 transport
refusal remains atomic and does not accept an identity. VF02 commands retain the
24KiB command cap. PostgreSQL JSONB cannot preserve NUL or lone surrogates; valid
wire data requiring that storage returns `postgres_json_unicode_unavailable`
without replacement characters or partial acceptance. The pure adapter still
round-trips those identities losslessly. Evidence inventory is bounded by the
enrolled maxRecords (256); overflow returns `environment_evidence_capacity`.

References to logs/artifacts are never fetched by this port. `claim` is visitor
text, not a receipt; reviewing it is not execution. Evidence is stored in its
own table and never enters the graph, VF03 journal, assignment or budget path.
A future independently assigned replay must use ordinary verifier authority and
emit its own exact environment receipt. This port cannot upgrade itself.

## Independently owned consumers

- **VF05 participation:** use the scoped resolve/gap/work-cell/admission/decline
  ports. Preserve voluntary opt-in, current grants and exact cell fences.
- **VF06 composition:** send exact canonical dependency refs. Preserve every
  version and digest, propagate unsupported results, and obtain actual composition
  verification before compatibility publication. This amendment installs no
  VF06 executor or guessed mapping from an unfinished branch.
- **VF07 allocation:** recommendations are advisory data. They do not enter the
  strict admission body. Re-read current cell, scope, fence and capacity; only
  VF02/VF04 reserve work and VF03/VF04 assign verifiers/budget. There is no public
  assignment/receipt/authority port. Existing stale-fence, tenant, copied-handle,
  forged-receipt and budget tests remain gates.

These ports are ready for their later receiving contract replay. No VF05/06/07
branch was imported, edited or claimed to pass. All demonstration results remain
owner QA, with zero independently evidenced customer tasks and unknown actual
cost. Source reviews are advice; executable receipts are reported separately.
