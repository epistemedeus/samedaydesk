# S125 RESULT — pulse live rejection (`mcpToolCallsObservedFrom`)

## Root-cause proof (PG 17)

1. Migration `supabase/migrations/0003_pulse_mcp_tool_demand.sql` requires wire form  
   `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` inside `pulse_validate_delta`.
2. After a successful apply, `pulse_read_snapshot` returns the column as **timestamptz in jsonb**, which PostgreSQL serializes as e.g. `2026-09-02T12:00:00+00:00` (no `.mmmZ`).
3. Producer path: every `emptyDelta(mcpToolCallsObservedFrom)` embeds the module boundary; after hydrate from snapshot that boundary becomes the PG echo form.
4. Next `pulse_apply_delta` → SQLSTATE **22023** `pulse_invalid_field:mcpToolCallsObservedFrom` → HTTP 400. Pending WAL is **not** cleared on failure → retry every flush interval (~12–15s). Intervening 200s are `pulse_read_snapshot` and occasional deltas that still carry a local `.mmmZ` boundary.

**Reproduced** on disposable PG17 (owning test): wire `.mmmZ` applies; snapshot echoes `+00:00`; raw echo re-apply raises 22023; JS-canonicalized retry applies; same flush id returns `already_applied`.

## Repair (application-only; no new migration)

Canonicalize equivalent timestamps to the SQL wire form **before** RPC / into pending / on hydrate:

- `canonicalizeMcpToolCallsObservedFrom` in `server/lib/pulse-store/schema.js`
- Used by `validateDelta`, `emptyDelta`, `deltaFromV2Snapshot`, `mergeDeltas`
- Snapshot read path (`supabase-adapter`), producer hydrate (`pulse.js`), WAL metadata (`wal-schema`, `file-fallback`)

Preserves: durable unflushed WAL rows (retry with same flush ids), receipt hashes (server hashes normalized timestamptz), counter totals, observation-boundary instant (same UTC instant).

Does **not** drop queues, discard invalid deltas, or rewrite applied migration history.

## Tests

- `server/scripts/test-pulse-durable-store.js` — S125 canonicalize / validateDelta / PG-shaped re-hydration (**42/42**)
- `server/scripts/test-pulse-postgres-real.js` — S125 live rejection + repair on disposable PG17 (**3/3**)
- `npm run test:pulse` path also includes events (**23/23** after deps present)

## Deploy / migration order

1. **Deploy application only** (Hostinger Node). **No Supabase migration.**
2. Restart the Node process so the new canonicalize path loads.
3. Existing poisoned WAL / pending flushes: **no host-side queue reset**. Next flush validates → canonicalizes → apply succeeds with existing flush ids.

## Safe read-only production pre/post checks

**Pre (read-only):** confirm recent `pulse_apply_delta` 400s mention `mcpToolCallsObservedFrom` / SQLSTATE 22023; `pulse_read_snapshot` still 200; sample snapshot field shape is `+00:00` (or similar non-`.mmmZ`).

**Post (read-only):** `pulse_apply_delta` 400 rate for this field drops; flush cadence returns to healthy applies; snapshot totals continue to advance (no silent discard).

## Backlog recovery

No special DB step. After app deploy + process restart, retained WAL flushes with failure-shaped `mcpToolCallsObservedFrom` canonicalize on the existing flush path. Do **not** truncate WAL or reset receipts.

## Source

- Branch: `codex/s125-pulse-live-rejection-20260910`
- Base: `main` @ `40da1745f73df5e66752ec761b9755921c35febd`
- Tip: `af7ecf6a1dafbda2682a6a24efcf6e8a06f3ca3a` (plus RESULT polish if amended)
