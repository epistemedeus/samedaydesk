# Visitor verification and later reuse

A runnable Node 22 foundation for independently assigned, revision-bound verification,
bounded validation capacity, and later-task evidence. Runtime code has no npm dependencies.
It invokes the existing Exchange objective-check evaluator for the included JSON recipe.
All shipped example operators, assignments, tasks, outcomes and cohorts are **owner-controlled
fixtures**. There is no hosted runner, identity provider, arbitrary-code sandbox, or payment engine.

## Run from the repository root

```sh
node --test --test-concurrency=1 scripts/visitor-foundry/validation/tests/*.test.mjs
node scripts/visitor-foundry/validation/scripts/check.mjs
node scripts/visitor-foundry/validation/cli.mjs example
```

`example` starts three separate Node processes and writes new files under this directory's
ignored `.local/` folder. For explicit cold steps, use a new output directory:

```sh
node scripts/visitor-foundry/validation/cli.mjs seed \
  --output scripts/visitor-foundry/validation/.local/my-run/candidate.json
node scripts/visitor-foundry/validation/cli.mjs replay \
  --input scripts/visitor-foundry/validation/.local/my-run/candidate.json \
  --output scripts/visitor-foundry/validation/.local/my-run/verified.json
node scripts/visitor-foundry/validation/cli.mjs reuse \
  --input scripts/visitor-foundry/validation/.local/my-run/verified.json \
  --output scripts/visitor-foundry/validation/.local/my-run/reuse.json
```

The fixture capability is a JSON card-check rule. The installed Exchange evaluator checks
its exact rule fields. A later cold task uses the accepted rule to catch a long-description
regression; the frozen older permissive rule misses it. The CLI executes both rules. It
labels the two experimental arms as owner QA, preserves unknown total effort/cost, and
reports no established external usefulness. This is an executable compatibility example,
not a general agent benchmark. Files use exclusive creation and cannot overwrite evidence.
A saved JSON receipt is re-executed in the cold process; it never authenticates its producer.

## API and trust boundary

Import from `scripts/visitor-foundry/validation/src/index.mjs`:

- `ValidationService({ principals, policies, limits, dependencies?, clock?, mode? })`
- `service.dispatch(hostHandle, command)` and `service.snapshot()`
- `projectReuse(hostOwnedSnapshot)`
- `compareCohorts(hostOwnedSnapshot, frozenManifest, baselineTrials)`
- `attachEvidenceJoin(reuseProjection, originalPilotJoinResult)`
- `createFixtureJsonRunner({ evaluator, environmentDigest, brief })`
- `checkCard(rule, card)`, `digest(json)`, `validate(schema, json)`, `schemas`, `commands`

A principal configuration has `handle` (object identity), `subject`, `group` (known
operator-assigned independence group or null), `roles`, and authorized `scopes`. Runners
also have exact `evaluators` and an `assignmentEvidence` reference. The host creates handles
from its existing authenticated grants; they are never taken from JSON. An object with
the same properties is not the same handle. Unknown or same-group independence cannot
satisfy verifier assignment. Wallets and aliases are not inspected. This is an in-process
host capability boundary, not a remote credential protocol or protection against arbitrary
code running inside the trusted server process.

`mode` defaults to `fixture`. Only a trusted host may instantiate `trusted_runner` after
installing a real execution/evidence adapter. Changing a label in a request does nothing.
`fixtures/example-config.mjs` is explicitly a simulated host and is not a deployment recipe.
Never expose `snapshot()` as a public tenant API: it is an internal aggregate containing
other scopes and the immutable audit journal. Public adapters must authorize/filter reads.

Commands have schema `neomorphic.foundry.validation_command.v1` and fields
`id`, `expectedRevision`, `type`, `payload`. All IDs are namespaced strings. Every mutation
requires an exact aggregate revision; all failures leave state unchanged. A repeated
successful `(principal subject, command id)` with identical type/payload returns the
original result without another budget charge. Changing its payload is a conflict.
An idempotency replay can be historical; inspect `historical`, `resultRevision` and the
current projection before acting on acceptance. `expectedRevision` is excluded from the
material fingerprint so an uncommitted conflict can retry with the current revision.
Failed attempts are not journaled or cached and can retry when capacity changes.

| Command | Role | Effect |
| --- | --- | --- |
| `submit` | contributor | Immutable candidate, rights/proposal claims, exact dependencies, queued validation |
| `assign` | operator | Fair eligible scope selection, runner assignment, full attempt-cap charge |
| `receipt` | assigned runner | Exact revision/policy/environment observations; staged acceptance |
| `expire` | operator | Due lease → retry wait → queued, or terminal timeout at attempt limit |
| `review` | independent reviewer | Decide exact pending receipt within finite review budget |
| `promote` | independent operator | Recommend an already accepted active version |
| `invalidate` | operator | Revoke candidate, receipt, or dependency; propagate through exact dependency edges |
| `observe` | beneficiary | Declare distinct later-task use; no payment or independent-demand upgrade |
| `attest` | independent evidence reader | Bind separately verified outcome/independence to observation digest |
| `retractObservation` | beneficiary or operator | Exclude current evidence while retaining history |

Success returns `{ok:true, revision, duplicate, result}`. Failure returns
`{ok:false, revision, code, nextAction}`. Status projections include attempts and applicable
`retryAt`/`deadline`. Receipt payloads contain observed check results and usage, never a
trusted caller-provided `passed`/`verified` flag. Required check coverage must match exactly;
empty, skipped, incomplete or failed evidence cannot pass. New limitations require review.

## Capacity and persistence

One immutable policy per scope fixes evaluator version, environment, risk, checks, attempt
CPU/wall/memory/cost cap, maximum attempts, retry delay, and review allocation. Limits bound
outstanding work (including retry/review), per-scope queue/running counts, aggregate running
memory, cumulative CPU/wall/cost, review count/time, stored records and journal commands.

Each assignment charges its entire authorized cap; actual spend remains separate and can
be unknown. Timeout/invalidation does not refund a possibly consumed attempt. Memory is
released by completion/expiry. New attempts get a new fence and need another allocation.
A reported cap breach fails the receipt and halts new dispatch. The host must reconcile it;
there is no reset/refill command. Review queues retain backpressure. No work is dropped to
make room. Budget/journal exhaustion returns an explicit next action.

The implementation is synchronous, atomic within one process, and uses copies to avoid
partial mutations. It is intentionally **not durable or a distributed scheduler**. Record,
command and response bounds make the reference coordinator finite; deployed HTTP rate limits,
process cancellation, retained dedup tombstones and PostgreSQL transactions belong to the
existing correspondence host. The detailed receiving plan specifies these seams.

## Schemas and provenance

Closed JSON Schemas live in `schema/`; runtime exports live in `src/contracts.mjs`.
Command schemas contain conditional payload schemas. Generate with
`node scripts/visitor-foundry/validation/scripts/check.mjs --write-schemas` and check drift
without the flag. Dates are UTC RFC3339 (seconds or millisecond precision); money is an
unsigned integer decimal string plus explicit currency/unit name. No floating currency
amounts, inferred token counts or currency conversion. References are metadata, never fetched
or executed by admission. Candidate artifact digests use the exported canonical JSON digest
for the supplied JSON recipe; other runners must use a declared immutable artifact format.

See [RESULT.md](./RESULT.md) for pins, measured evidence and delivery scope, and
[HEAVY-RECEIVING-PLAN.md](./HEAVY-RECEIVING-PLAN.md) for the combined visitor journey.
