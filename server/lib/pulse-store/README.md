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
`_unknown`/`_none`, and eight general events, plus three browse-only categories,
at most 150 keys. JS and SQL strictly validate
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

Apply forward, rerunnable `0008_pulse_browse_result_coverage.sql` before the new
producer, through Root's authorized release. It replaces only two existing
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

Root independently receives both exact source branches and owns both PRs and the
managed release. Receive the installed schema and current source before the
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
