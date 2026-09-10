import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalizeMcpToolCallsObservedFrom, emptyDelta } from "../lib/pulse-store/schema.js";
import { createFileFallbackStore, createPulseStoreFromTransport } from "../lib/pulse-store/index.js";
import { createFakePulseAuthority, createFakeRpcTransport } from "./helpers/fake-pulse-authority.js";

test("S125 root: invalid wire-shaped dates remain rejected", () => {
  for (const value of [
    "2026-99-99T12:00:00.000Z",
    "2026-02-30T12:00:00.000Z",
    "2026-01-01T25:00:00.000Z",
    "2026-01-01T00:00:60.000Z",
    "not-a-date",
  ]) assert.throws(() => canonicalizeMcpToolCallsObservedFrom(value), /mcpToolCallsObservedFrom/);
  assert.equal(canonicalizeMcpToolCallsObservedFrom("2024-02-29T12:00:00.000Z"), "2024-02-29T12:00:00.000Z");
  assert.equal(canonicalizeMcpToolCallsObservedFrom("2026-09-02T05:00:00-07:00"), "2026-09-02T12:00:00.000Z");
});

test("S125 root: pre-fix disk WAL replays same IDs after lost acknowledgement without losing counters", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-s125-root-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const walFile = join(dir, "fallback.json");
  const observedFrom = "2026-09-02T12:00:00.000Z";
  const alreadyId = "a0000000-0000-4000-8000-000000000071";
  const pendingId = "a0000000-0000-4000-8000-000000000072";
  const already = { ...emptyDelta(observedFrom), total: 2, humans: 2, mcpToolCallsByName: { check_ai_readiness: 2 } };
  // Construct the old persisted shape directly, not through the new normalizer.
  const pending = { ...emptyDelta(observedFrom), total: 3, humans: 3, mcpToolCallsByName: { check_ai_readiness: 3 }, mcpToolCallsObservedFrom: "2026-09-02T12:00:00+00:00" };
  const authority = createFakePulseAuthority({ mcpToolCallsObservedFrom: observedFrom, echoPgTimestamptzJson: true });
  const transport = createFakeRpcTransport(authority);
  const store = createPulseStoreFromTransport(transport);
  await store.flush(alreadyId, already);
  const oldWal = {
    version: 2,
    pendingFlushes: [
      { flushId: alreadyId, delta: already, createdAt: observedFrom },
      { flushId: pendingId, delta: pending, createdAt: observedFrom },
    ],
    droppedUnknown: 7,
    legacyImported: true,
    observationStartedAt: observedFrom,
    mcpToolCallsObservedFrom: pending.mcpToolCallsObservedFrom,
    migratedSnapshotDigest: "a".repeat(64),
    snapshotCorrupt: false,
  };
  writeFileSync(walFile, JSON.stringify(oldWal));
  const fallback = createFileFallbackStore(walFile);
  assert.equal(fallback.isCorrupt(), false);
  assert.deepEqual(fallback.loadPendingFlushes().map(row => row.flushId), [alreadyId, pendingId]);
  assert.equal(JSON.parse(readFileSync(walFile, "utf8")).pendingFlushes[1].delta.mcpToolCallsObservedFrom, pending.mcpToolCallsObservedFrom, "read alone must not rewrite WAL");
  const seen = [];
  const observedStore = createPulseStoreFromTransport({
    async rpc(fn, args) {
      if (fn === "pulse_apply_delta") seen.push(args.p_flush_id);
      return transport.rpc(fn, args);
    },
  });
  const { configurePulseStoreForTests, __pulseTestInternals } = await import("../lib/pulse.js");
  configurePulseStoreForTests({ store: observedStore, fileFallback: fallback, autoHydrate: false });
  await __pulseTestInternals().drainPendingFlushes();
  assert.deepEqual(seen, [alreadyId, pendingId]);
  assert.equal(fallback.loadPendingFlushes().length, 0);
  assert.equal(fallback.getDroppedUnknown(), 7);
  assert.equal(JSON.parse(readFileSync(walFile, "utf8")).migratedSnapshotDigest, oldWal.migratedSnapshotDigest);
  const snapshot = await store.readSnapshot(observedFrom);
  assert.equal(snapshot.total, 5);
  assert.equal(snapshot.mcpToolCallsByName.check_ai_readiness, 5);
  configurePulseStoreForTests({ store: observedStore, fileFallback: createFileFallbackStore(walFile), autoHydrate: false });
  await __pulseTestInternals().drainPendingFlushes();
  assert.deepEqual(seen, [alreadyId, pendingId], "restart with drained WAL makes no additional apply");
  assert.equal((await store.readSnapshot(observedFrom)).total, 5);
});
