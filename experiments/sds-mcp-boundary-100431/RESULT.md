Repaired all five independently reproduced mounted-boundary findings on SameDayDesk source `66a64344528ff97bd840350e12d75deac695ad61`. The actual runtime-startup CI sequence passes **305 checks, zero failures, zero skips** on implementation checkpoint `1da789e65935437ce32ffb32e91786f4ca28dbf5`; the production client build also passes. [GitHub Runtime startup](https://github.com/epistemedeus/samedaydesk/actions/runs/37221287735) independently completed successfully at that implementation checkpoint. This is source/VM QA, with Root retaining integration and public receiving.

Native build session: `01a107da-9912-75a3-a889-b477cd401083`, official Codex `0.159.3`, `gpt-6.1-sol`, `xhigh`, actual Cursor cloud-d VM. Model/effort come from the native turn context, rather than an advisory send. Branch: `codex/sds-mcp-boundary-1004`. [Draft PR 271](https://github.com/epistemedeus/samedaydesk/pull/271) is a GitHub PR identifier, not a native session or review Chat. The advisory review Chat/model-at-send and automatic-cycle status remain unknown.

The reusable correction is the existing mounted admission/execution/measurement contract. `mcp-admission.js` owns IDs, envelopes, supplied argument types, protocol gates and the 1–25 batch limit. The mounted pulse observer caches its decision on the request; execution receives that same object. The generated declarations consume its schema/limit helpers and the same tool inventory. Tool definitions moved into the inventory with their original semantic SHA-256 pin unchanged. Missing tool fields retain useful `isError` results; unknown tools retain `-32602`.

| Finding | Controlled source output | Received repair |
| --- | --- | --- |
| Envelope/notification/parser boundary | Missing/wrong `jsonrpc` each validated a paid fixture and fetched a fixture site while pulse counted neither. Invalid IDs also dispatched; generic known notifications returned results; malformed text returned HTML. | Validate before async selection. Invalid envelopes/IDs return `-32600`, invalid params `-32602`, unknown methods `-32601`, malformed text `400/-32700`. All accepted notifications and responses return empty 202. Invalid inputs execute no adapters. |
| Batch admission and observation | A 26-entry batch validated 26 licenses and fetched 26 fixture sites, with zero observed requests/messages. Mixed invalid entries also hid valid executed work. Empty batch returned 202. | One 1–25 compatibility admission bound before `Promise.all`. Rejected bodies remain HTTP attempts with zero admitted messages. Valid mixed entries remain observed and executed. Actual OpenAPI has `minItems:1` and `maxItems:25`. |
| Initialization exemption | Initialize plus paid call executed under `1999-01-01`. | Only a validated singleton initialization negotiates despite an unsupported header. A mixed unsupported-header batch rejects before work. |
| Forwarded rate key | An unconfigured private peer accepted caller prefixes `1.1.1.1`, `9.9.9.9` and `not-an-ip` as different keys. | Socket peer by default. Explicit literal IP/CIDR `AGENT_READINESS_TRUSTED_PROXIES`; validate the chain and walk right to left to the nearest untrusted hop. No trust-all or hop-count policy. IPv4/mapped IPv6 and equivalent IPv6 forms normalize together. |
| Bearer return/cache/log path | Purchase-return plaintext reflected the fixture bearer without cache/referrer headers. | `no-store, private` and `no-referrer` on bearer-return GET/HEAD, canonical redirects and POST deliveries. Pulse/WAL omit query/body values. MCP parser errors no longer enter Express's default HTML/console emitter. License/payment-link/product authority is unchanged. |

Compatibility is deliberate: headerless POSTs retain the March-2025 path; `2025-03-26` and the inherited `2024-11-05` path admit 1–25 entries, including mixed valid and invalid entries. The 2024 batch path is an SDS extension, not deprecated HTTP+SSE. Headers `2025-06-18` and `2025-11-25` require one message per POST. Negotiation still advertises all four eras. This follows the [March transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports), [current transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [MCP IDs](https://modelcontextprotocol.io/specification/2025-11-25/basic), while preserving [JSON-RPC mixed-batch and notification behavior](https://www.jsonrpc.org/specification).

Producer-to-consumer trace: discovery declarations → mounted Express MCP JSON parser (`1mb`, primitives reach request validation) → safe parser rejection or pulse's shared admission → route dispatch → existing free planner/readiness or Fix Pack license/artifact adapters → JSON-RPC/empty 202 response. Pulse retains safe method/tool counters and recent cardinality; its existing delta schema/WAL and durable PostgreSQL consumers receive those counts. The durable schema/migrations remain unchanged. HTTP attempts now include rejections; historical HTTP counts covered only entirely shape-valid bodies. Message counts include valid envelopes and parameter errors, not rejected batches. Tool-name counts require valid supplied parameters and describe attempts, not result delivery or demand. No historical backfill or population relabeling occurs.

Mounted negatives cover missing/wrong version envelopes, primitives/null/nested arrays, invalid IDs/methods/params, supplied argument types, known/unknown and paid notifications, accepted responses, malformed/compressed/oversized bodies, empty/25/26-entry batches, mixed initialization and async adapter failures. Mounted positives cover all negotiated eras, tools/list, the no-key planner, free check, and valid/invalid paid fixtures. Rate tests cover spoofed prefixes, multiple hops, untrusted private peers, malformed addresses/policy and equivalent addresses. Parser tests preserve unrelated API HTML behavior and the exact raw bytes delivered to the Stripe signature verifier. Expensive/site/DNS and payment adapters are controlled; no paid transaction, order invalidation, license creation or public probe occurred.

| Exact runtime workflow command | Pass/fail/skip |
| --- | --- |
| `npm ci --omit=dev --ignore-scripts` | exit 0 |
| `npm run test:hosted-startup` | 4/0/0 |
| `npm run test:machine-discovery` | 4/0/0 |
| `PULSE_PG_BIN="$(pg_config --bindir)" npm run test:pulse` | 72/0/0; disposable PostgreSQL 16 |
| `npm run test:agent-readiness` | 150/0/0 |
| `npm run test:l08-agent-repair` | 28/0/0 |
| `npm run test:mcp` | 46/0/0 |
| `node --test server/scripts/test-public-readiness-load-failure.js` | 1/0/0 |

The existing focused baseline passed 73 checks before repair. Supplemental MCP/TaskMarket verification passed 41 checks; these overlap owning suites and are not added to 305. The final mounted replay receives the original 34 controls plus five normal/delivery cases. [EVIDENCE.json](EVIDENCE.json) includes actual outputs, execution/observation deltas, exact source hashes, commands, native provenance and compressed logs. It also records failed intermediate runs and their corrections. L08's first CI run required a committed catalog-owning HEAD and inherited an invalid initialization assertion; checkpointing and correcting that assertion produced the full passing replay. No regression was deleted. Generated build-lock and L08 receipt changes were received and restored to keep the export scoped.

Public release scope is the existing machine transport, declarations, measurement and response protections. Human text/layouts/homepages/offers, Stripe settings, bearer authority and existing orders stay unchanged. A one-time account/token exchange from the advisory is declined as outside this repair. Proxy egress policy needs deployment-specific enrollment; unconfigured trust safely uses the peer and may group clients behind a proxy. Browser URL history and provider/CDN access-log redaction remain unknown; application headers do not establish provider redaction. Production behavior and outside useful adoption/revenue remain separate, unreceived outcomes. No merge or deploy is performed.

After Root independently receives/integrates the candidate, the next public wire check is an inexpensive notification, expected HTTP 202 with no body:

```sh
curl -sS -i https://samedaydesk.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","method":"ping"}'
```

Local receiving: `node experiments/sds-mcp-boundary-100431/replay.mjs /tmp/sds-boundary-received.json`, then the exact runtime commands above. The final exported head is the branch tip; the implementation checkpoint above pins all runtime changes and tests.
