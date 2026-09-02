# Pulse durable aggregation ecosystem map

Date: 2026-09-01 PDT

Status: admitted narrow replacement of the file-backed persistence authority; no new analytics product or provider lock-in.

## Frozen job

- **Job:** preserve privacy-safe aggregate request counters atomically across process replacement, rolling deploys, and more than one app process, while exposing the exact completeness and authority of every read.
- **Stage:** SameDayDesk discovery and consumption measurement, before any traffic observation can guide acquisition or product decisions.
- **Reproduced failure:** production Pulse reported 16,128 requests at 2026-09-02T01:21:15Z. After the PR 9 deployment migrated the file snapshot, the surviving legacy window contained only 64. The old in-memory process and the new process therefore did not share one durable complete file authority.
- **Current component:** `server/lib/pulse.js` has bounded no-PII aggregation, truthful MCP surface/protocol classes, a durable-file attempt, and an explicit legacy-uncertainty boundary.
- **Useful proof:** two independent process instances flush disjoint deltas into the same durable window; the authoritative read equals their exact sum after process replacement, while a database outage yields an explicit incomplete local fallback rather than a false complete total.
- **Kill:** stop if the existing configured database cannot provide one atomic additive RPC without per-request writes, or if the flush/read latency or free-plan load is materially worse than the bounded acquisition decision it supports. In that case retain local diagnostics as incomplete and evaluate the existing Hostinger database lane, not another telemetry SaaS.

## Reuse map

| Candidate | Exact identity and license | Useful seam | Trust/runtime boundary | Disposition |
| --- | --- | --- | --- | --- |
| Current JSON snapshot | SameDayDesk `server/lib/pulse.js` at merge `aa4670f`; project source | Local batching, privacy-safe classifier, bounded recent events | One Node process and one resolved filesystem path; live deploy proved it is not a complete cross-process/release authority | `reference_only` for local fallback and migration evidence |
| Supabase Postgres through `@supabase/supabase-js` | Existing pinned dependency `@supabase/supabase-js@2.108.2`, MIT; SameDayDesk already configures server-side service-role access | Official Postgres functions callable through `rpc`; one SQL `insert ... on conflict do update` can atomically add a bounded delta | Remote database and server-only service role; tables and functions must deny `public`, `anon`, and `authenticated` and expose only `service_role` | `reuse_direct` behind a replaceable Pulse store adapter |
| Hostinger managed MySQL | Existing hosting account capability; no current SameDayDesk application dependency or credential contract | Durable relational rows and atomic updates | Adds a second database client, secret, schema, and provider-specific operating path | `isolate` unless Supabase fails the integration proof |
| Dedicated analytics/telemetry SaaS | No admitted provider | Mature event ingestion and dashboards | New account, client, data plane, pricing, retention, and provider vocabulary; larger than the reproduced invariant | `kill` for this repair |
| File locks, append-only logs, or release-directory files | Node/POSIX primitives | Could serialize writers that share one filesystem inode | Does not solve different resolved state roots or an unshared/replaced filesystem; provider topology remains unknown | `kill` as durable authority; retain only as bounded fallback |

Primary seams:

- Supabase documents database functions as Postgres functions callable through the Data API and JavaScript `rpc`: <https://supabase.com/docs/guides/database/functions> and <https://supabase.com/docs/reference/javascript/rpc>.
- Supabase's current security guidance requires RLS plus explicit grants, and warns that public-schema functions otherwise receive broad execution privileges: <https://supabase.com/docs/guides/database/postgres/row-level-security> and <https://supabase.com/docs/guides/api/securing-your-api>.
- Hostinger documents Git-based Node deployments as build-and-launch replacements, but supplies no load-bearing guarantee that a Node process's resolved home-directory file is one atomic cross-release store: <https://www.hostinger.com/tutorials/node-js-tutorial>.

The classes are saturated for this narrow job: local file, existing relational database, second hosting database, and new telemetry provider cover the materially different storage architectures. Only the already-configured relational lane supplies the missing invariant without another provider or per-request event stream.

## Admitted delta

The missing invariant is **atomic additive durability with an honest read authority**, not a new traffic classifier or dashboard.

Implement only:

1. one minute- or similarly bounded time-bucket table with non-negative aggregate columns and bounded JSON method counters;
2. one server-only atomic additive Postgres function for batched deltas;
3. one bounded snapshot function or query that returns current durable aggregates and store health;
4. a replaceable Pulse store adapter that batches in memory, flushes on the existing interval and graceful exit, and never writes one database row per request;
5. a local file fallback that is labelled `incomplete_local_fallback` and is never silently summed with the authoritative database window;
6. a one-time import of the surviving PR 9 legacy uncertainty as an explicitly incomplete historical observation, not a recovered complete total;
7. seller-repair counters in the same atomic durable contract without changing their allowlist or evidentiary meaning.

Do not add user IDs, raw IPs, raw user agents, MCP parameters, tool names, session IDs, payment headers, bodies, a background service, a second telemetry provider, or a UI dashboard. Do not change MCP, checkout, price, payment, or settlement behavior.

## Provider-neutral boundary

Pulse owns a small store interface expressed in provider-free operations: `addDelta`, `readSnapshot`, `importLegacyObservation`, and `health`. Supabase is the first adapter. Classification and evidence meanings remain usable without it. When the adapter is unavailable, local counters remain useful diagnostics but must return `complete: false`, a scoped process start, and the exact last successful flush; they may not impersonate a durable total.

## Hostile acceptance

- two separate Node processes add disjoint deltas to one bucket and the durable read equals the sum exactly;
- concurrent retries cannot double-add one flush identifier;
- a process exits after acknowledgement loss and retry remains idempotent;
- malformed, negative, fractional, oversized, unknown-key, and future-schema deltas fail closed;
- `anon` and `authenticated` cannot read, write, or execute the Pulse storage objects;
- absent or invalid service credentials never expose secrets or stop the site, and the public read labels the fallback incomplete;
- a database outage cannot erase the unflushed bounded delta and cannot promote it into a complete total;
- legacy import is idempotent and preserves its incomplete authority label;
- request classification, seller-repair allowlists, MCP runtime, checkout, and build remain unchanged.

## Adoption and next event

This is internal measurement infrastructure, not a saleable product. Its adoption event is one real SameDayDesk process replacement with exact pre/post durable continuity plus future MCP POST and seller-repair event readback. Package it later only if an independently operated seller asks for the same evidence contract or the same failure recurs outside Hostinger/Supabase.
