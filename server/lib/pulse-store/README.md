# Pulse MCP source and server outcomes

This extends the existing Pulse delta, atomic RPC, WAL, file fallback and protected
`GET /api/pulse?k=...` summary. It adds no recorder or request journal.

`X-SameDayDesk-Agent-Source` recognizes only the exact static value
`agentverse-a2a-v1`. Missing, arbitrary, malformed and combined duplicate labels
collapse to `unattributed`. The recognized value is caller-declared and spoofable,
including by a direct caller. It conveys no identity, verified acquisition,
usefulness, payer class or authority. CORS permits the optional header; it does
not change access or the tool response.

Optional `mcpOutcomes` deltas contain `observedFrom` and a sparse `counts` map.
Keys are `source|tool|event`: two sources, the declared seven-tool inventory plus
`_unknown`/`_none`, eight general events and fifteen refusal reason events, plus
three browse-only categories, at most 420 keys. JS and SQL strictly validate
this product, timestamp and nonnegative safe integers. Neither raw headers,
arguments, URLs, IDs, bodies, wallets, IPs nor secrets enter the dimension.

| Event | Boundary |
| --- | --- |
| `http_request` | One mounted POST, including parser/protocol rejection; tool `_none`. |
| `tool_attempt` | Each admitted `tools/call` entry with structurally valid parameters. Unknown names use `_unknown`; notifications may execute. |
| `normal_result` | Handler produces a tool result without `isError: true`. Negative business findings can be normal. |
| `tool_refusal` | Handler produces a tool result with `isError: true`. |
| `protocol_error` | Server generates a JSON-RPC error, including admission or uncaught-handler failure. Invalid tool params use `_unknown`. |
| `notification_completed` | Entry execution/validation ends but its response is suppressed. May overlap a produced result/error. |
| `response_finished` | Local HTTP finish once per POST, with tool `_none`. Does not establish peer receipt. |
| `disconnected` | Response closes before finish once per POST, with tool `_none`. May overlap a later produced result. |

Compatibility batches count each admitted entry once and HTTP events once per
POST. Non-tool normal replies and client response no-ops produce no tool result.
Notification result/error counts describe internal production, not a transmitted
reply. Repeated observer/producer callbacks and finish/close cannot duplicate an
event. A caller retry is another actual attempt, without request-ID retention.

`mcpProtocol.outcomes` explicitly reports caller acceptance and revenue as
`unobserved`, historical source/outcomes as `unknown_no_backfill`, and `complete:
false`. Its counts are lower bounds from the first observed event, without a
claim of continuous coverage across all processes or generations. Missing old
dimensions remain unknown. Existing top-level `complete` describes admitted
storage/backlog accounting, not a complete historical outcome window. Late
results can flush independently of their attempts; these aggregate counts are
not a joined conversion funnel.

## Prospective browse result coverage

The same `mcpOutcomes.counts` map admits `browse_empty`, `browse_non_empty` and
`browse_unclassified` only for `browse_taskmarket_tasks`, with one optional
`browseObservedFrom` timestamp. It marks the first observed category, not release
time or guaranteed continuous coverage. Normal results are classified at the
existing handler boundary before serialization, once per admitted entry,
including suppressed notifications. Refusals and JSON-RPC errors keep their
separate events and never become empty results.

Empty/non-empty require the actual bounded `structuredContent` inventory, a
matching integer count (0..25), valid task-summary structure and the producer's
matching text mirror. Missing/malformed/contradictory/unbounded normal results
are unclassified. The observer does not fetch or retain their contents.
Arbitrary strings never become dimension keys. A non-empty inventory does not
establish actionable funding, peer receipt, usefulness, acceptance or revenue.

`mcpProtocol.outcomes.browseResults` reports the separate prospective boundary,
lower-bound categories by the existing declared source, `complete:false`, and
`historicalCardinality:unknown_no_backfill`. `normal_without_cardinality` counts
normal results without a recorded category; it is not an inferred empty result.
Before any category is observed, category counts and the boundary are null and
coverage is unknown. Prior deltas/snapshots retain exact old fields/hashes.
New file snapshots, WAL, transport and SQL readers retain the optional timestamp.
An observation/storage failure cannot change tool output or authority.

Apply forward, rerunnable `0008_pulse_browse_result_coverage.sql` before the
browse-category producer, through Root's authorized release. The current refusal
producer additionally requires 0009 below. 0008 replaces only two existing
validators/merge functions, with no tables, row updates, backfill or new grants.
An old DB rejects new categories atomically; the current WAL retains exact ids
and payloads with permanent-error backoff and drains after upgrade.

Binary rollback needs a reader that understands these events **in both durable
JSON aggregates and any pending WAL**, even after draining. The old reader
rejects new stored events/timestamps; draining alone does not make it safe.
Rollback the discovery/producer changes while retaining the new Pulse readers
and SQL functions. Do not down-migrate or strip fields to force old-reader
acceptance. Preserve the retained evidence before any operational rollback.

The focused ROOT4000 tests in `TASKMARKET-INTEGRATION.md` exercise real mounted
HTTP, existing WAL/fallback, fresh process startup, real disposable PostgreSQL,
old-schema rejection, duplicate/ambiguous flush and migration/restart recovery.
Malformed normal producer fixtures use the same mounted admission/producer
observer; malformed upstream inventory separately refuses in the actual handler.
These tests establish source behavior only. No production migration, tool QA,
frontend build or emitted-asset equality is claimed.

## Prospective refusal reasons

The executing admission/parser or handler branch supplies one finite reason for
each produced `protocol_error` or `tool_refusal`. The existing aggregate records
`source|tool|refusal_<reason>` beside that event, guarded by the same per-entry
completion check. No method class or source label is added. No input is reparsed
for telemetry, and neither error text nor a JSON-RPC error code chooses a cause.
For example, invalid params and an unknown tool both emit -32602 but retain
distinct producing decisions. Concurrent batch entries have separate internal
reason contexts; reply bodies never contain this metadata.

| Reason | Authoritative boundary / next operator decision |
| --- | --- |
| `unsupported_protocol` | Unsupported header outside valid singleton initialize negotiation; repair the caller's protocol choice. |
| `batch_size` | Compatibility array outside 1..25; repair caller batching. |
| `batch_protocol` | Array supplied to a protocol that requires one message; send singletons. |
| `malformed_json` | MCP parser reports its parse-failed type; correct serialization. |
| `body_limit` | Existing parser rejects with 413; reduce payload size. |
| `body_rejected` | Other parser/read/encoding rejection; investigate that boundary without asserting a more specific predicate. |
| `invalid_request` | Existing envelope validator refuses; correct JSON-RPC shape. |
| `invalid_params` | Existing structural parameter validator refuses; correct supplied parameter types. |
| `unknown_method` / `unknown_tool` | Existing handler cannot dispatch the requested name; refresh the caller's discovery/dispatch journey. |
| `tool_input` | Existing missing host/URL branch; supply required input. |
| `license_unverified` | Existing boolean license authority returns false. Missing, unpaid, unconfigured or unavailable verification remain indistinguishable; use the existing license/support path. This is not proof of invalid credentials or payment state. |
| `tool_error` | Existing caught tool branch; investigate that tool boundary. It may reflect a domain/input refusal or an execution/dependency failure; no exact inner cause is claimed. |
| `handler_error` | Existing uncaught handler branch produces Internal error; investigate that handler boundary. |
| `unknown` | A produced refusal/error lacks a supported producer reason. Unsupported values collapse here, never becoming keys. |

`mcpProtocol.outcomes.refusals` declares its first recorded reason timestamp,
lower-bound/unknown coverage, `complete:false`, and historical causes as
`unknown_no_backfill`. Sparse reason events remain in the existing counts map.
`withoutReason` counts existing error/refusal events without this dimension by
the existing declared source, not inferred causes. Old six-error observations
remain six unknown causes; old receipts, canonical deltas and snapshots are not
rewritten. No reason timestamp is invented for old data or healthy-only traffic.
The timestamp is an observation boundary, not guaranteed continuous coverage.
Useful negative tool results remain normal results. Ignored unknown-method
notifications produce no error and no refusal reason. Suppressed produced
results/errors retain their reason. Local finish/disconnect still proves no peer
receipt; these counts establish no sessions, conversion denominator, identity,
usefulness, acceptance, revenue or diagnosis of the historical six errors.

Apply additive, rerunnable `0009_pulse_mcp_refusal_reasons.sql` **after 0008 and
before the new producer** during a separately authorized release. It replaces
only the existing outcome validator and merge function, with no new tables,
grants, row updates or backfill. Run the companion schema-owner read-only
`supabase/verify/0009_pulse_mcp_refusal_reasons.sql`. Old producers/readers still
handle old payloads against the upgraded schema until new data is written.
Then roll out compatible readers and the producer together and receive the
installed epoch, protected summary and retained backlog. An old schema rejects
new reason deltas atomically; keep the exact WAL IDs/payloads, allow the existing
permanent-error backoff, migrate, then retry/drain. Never drop reasons to force
acceptance or replay an MCP tool to repair an observation failure.

Rollback/drain must retain the new DB/WAL readers and SQL functions. The actual
f629 strict reader rejects new timestamps/events both in queued WAL and in
durable/file snapshots **even after the queue drains**. Roll back the producer
or other behavior while retaining compatible Pulse readers; do not strip stored
fields, down-migrate or install the whole old binary. Disposable PostgreSQL and
fresh-process tests receive old/new compatibility, failed/ambiguous flush,
original receipt hashes, exact duplicate recovery and strict unknown-field
rejection. No production database call is part of qualification.

Run `NODE_OPTIONS=--max-old-space-size=384 npm run test:mcp-refusals` with the
existing PostgreSQL binary overrides below. It includes mounted loopback refusal
branches, negative/healthy results, notification/disconnect/duplicate controls,
real PG migration/retry/restart, old readers/snapshots and route parity against
exact f629. License/site responses are local fixtures with counted calls; no
account, provider, payment or mail is contacted. The two qualified machine
failure responses now use `contact@neomorphic.io`; the human GET return contact
and other human assets/sender defaults remain outside this change.

After a separately received installed epoch, use actual future refusal branches
to choose a concrete caller compatibility or tool journey to repair. If the
dimension stays ambiguous or never changes a useful decision, retain bounded
evidence and reconsider/remove it; do not grow telemetry indefinitely.

## Receiving and rollout

Run tests serially with the existing Node dependencies and the companion
`x402-url-extractor` adapter's pinned isolated Python environment:

```bash
export ROOT3302_ADAPTER_CHECKOUT=/absolute/path/to/x402-url-extractor
export ROOT3302_PYTHON=/absolute/path/to/adapter-venv/bin/python
# Existing disposable PostgreSQL helper supports these binary overrides:
export PULSE_PG_BIN=/absolute/path/to/postgresql/bin
export PULSE_PSQL="$PULSE_PG_BIN/psql"
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= NODE_OPTIONS=--max-old-space-size=384 \
  node --test --test-concurrency=1 \
  server/scripts/test-mcp-source-outcomes.js \
  server/scripts/test-pulse-mcp-outcomes-contract.js
```

The companion helper accepts only loopback HTTP. These tests exercise its real
executor and HTTP client against `createSdsApp`, the existing store adapter,
protected summary and disposable PostgreSQL. Network-dependent readiness inputs
and license failures are local fixtures. Existing MCP/entitlement/Pulse suites
remain relevant. No frontend build or release is needed for this backend change.

For the original source-label/adapter release, Root independently receives both
exact source branches and owns both PRs and the managed release. Receive the
installed schema and current source before the
apex producer, then release the adapter header. The migration owner must have
applied additive `0007_pulse_mcp_source_outcomes.sql` before that apex release;
do not repeat an already received production migration. This file preserves old counters/receipt hashes, is rerunnable,
leaves historical outcomes NULL, and retains service-role-only RPC access.
Old producer deltas still work against the upgraded DB. A new producer against
an old DB retains rejected new deltas in the existing WAL with permanent-error
backoff and incomplete storage reporting; keep the original IDs and payloads,
then drain after migration. Never strip the dimension to force acceptance.

New code reads old WAL deltas without adding fields or changing their canonical
hashes. A prior binary cannot read a WAL containing the new optional field:
retain the new reader while draining before any binary rollback, preserve any
remaining WAL, and do not down-migrate the database. Source tests establish no
installation or outside use. At the later authorized release, receive installed
lineage, protected summary coverage, free/protocol/refusal paths, WAL recovery,
and unchanged paid/auth/human assets using the managed receiving procedure.
