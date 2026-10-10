import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { PULSE_TOOL_CONTRACT_MIGRATION } from "../lib/pulse-store/tool-contract-sql.js";
import {
  PERMANENT_FLUSH_BACKOFF_MS,
  TRANSIENT_FLUSH_BACKOFF_MS,
  classifyPulseFlushError,
  flushBackoffMs,
} from "../lib/pulse-store/flush-error.js";
import { deltaCanonicalDigest, emptyDelta } from "../lib/pulse-store/schema.js";
import { createFileFallbackStore, createPulseStoreFromTransport, newFlushId } from "../lib/pulse-store/index.js";
import { createFakePulseAuthority, createFakeRpcTransport } from "./helpers/fake-pulse-authority.js";
import {
  createPsqlPulseTransport,
  psql,
  psqlTuples,
  requirePostgresBinaries,
  startDisposableCluster,
} from "./helpers/pulse-pg-cluster.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migration0002 = readFileSync(join(root, "supabase/migrations/0002_pulse_durable.sql"), "utf8");
const migration0003 = readFileSync(join(root, "supabase/migrations/0003_pulse_mcp_tool_demand.sql"), "utf8");
// Released six-tool contract. check_agent_readiness is admitted by this file.
// The locator is the later inventory and is applied only after that receipt exists.
const migration0005 = readFileSync(
  join(root, "supabase/migrations/0005_pulse_admit_declared_mcp_tools.sql"),
  "utf8",
);
const migrationForward = readFileSync(join(root, PULSE_TOOL_CONTRACT_MIGRATION), "utf8");
const OBSERVED = "2026-09-02T12:00:00.000Z";
const CREATED = "2026-09-02T12:00:01.000Z";

function delta(overrides = {}) {
  return {
    ...emptyDelta(OBSERVED),
    total: 1,
    humans: 1,
    ...overrides,
  };
}

function writeWal(file, entries, extra = {}) {
  writeFileSync(
    file,
    JSON.stringify({
      version: 2,
      pendingFlushes: entries,
      droppedUnknown: extra.droppedUnknown ?? 0,
      legacyImported: true,
      observationStartedAt: OBSERVED,
      mcpToolCallsObservedFrom: OBSERVED,
      snapshotCorrupt: false,
    }),
  );
}

test("flush error classes and backoff bounds", () => {
  assert.equal(
    classifyPulseFlushError({
      message: "pulse_invalid_field:mcpToolCallsByName",
      code: "22023",
      status: 400,
    }).class,
    "permanent",
  );
  assert.equal(classifyPulseFlushError({ message: "Bad Request", status: 400 }).class, "permanent");
  assert.equal(classifyPulseFlushError({ message: "pulse_flush_id_conflict" }).class, "permanent");
  assert.equal(classifyPulseFlushError({ message: "network_timeout" }).class, "transient");
  assert.equal(classifyPulseFlushError({ message: "unavailable", status: 503 }).class, "transient");
  assert.equal(classifyPulseFlushError(new Error("psql spawn failed: EAGAIN")).class, "transient");
  assert.equal(flushBackoffMs("permanent", 1), PERMANENT_FLUSH_BACKOFF_MS[0]);
  assert.notEqual(flushBackoffMs("permanent", 1), 15_000);
  assert.equal(flushBackoffMs("transient", 1), TRANSIENT_FLUSH_BACKOFF_MS[0]);
  assert.equal(flushBackoffMs("transient", 5), TRANSIENT_FLUSH_BACKOFF_MS.at(-1));
  assert.equal(flushBackoffMs("transient", 9), TRANSIENT_FLUSH_BACKOFF_MS.at(-1));
  assert.equal(flushBackoffMs("permanent", 8), PERMANENT_FLUSH_BACKOFF_MS.at(-1));
});

test("permanent rejection retains the original entry and drains later traffic", { timeout: 180_000 }, async (t) => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } = await import("../lib/pulse.js");
  __pulseTestInternals().stopScheduledFlush();

  await t.test("fake contract rejection does not hot-retry or block the backlog", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-retry-fake-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const walFile = join(dir, "fallback.json");
    const badId = "f1000000-0000-4000-8000-000000000001";
    const goodId = "f1000000-0000-4000-8000-000000000002";
    const badDelta = delta({ mcpToolCallsByName: { check_agent_readiness: 1 } });
    const goodDelta = delta({ total: 4, humans: 4 });
    writeWal(walFile, [
      { flushId: badId, delta: badDelta, createdAt: CREATED },
      { flushId: goodId, delta: goodDelta, createdAt: CREATED },
    ]);
    const badDigest = deltaCanonicalDigest(badDelta);
    let reject = true;
    const calls = [];
    const authority = createFakePulseAuthority({ mcpToolCallsObservedFrom: OBSERVED });
    const base = createFakeRpcTransport(authority);
    const store = createPulseStoreFromTransport({
      async rpc(fn, args) {
        if (fn === "pulse_apply_delta") {
          calls.push(args.p_flush_id);
          if (reject && args.p_delta.mcpToolCallsByName?.check_agent_readiness) {
            return {
              data: null,
              error: { message: "pulse_invalid_field:mcpToolCallsByName", code: "22023" },
              status: 400,
            };
          }
        }
        return base.rpc(fn, args);
      },
    });
    configurePulseStoreForTests({
      store,
      fileFallback: createFileFallbackStore(walFile),
      autoHydrate: false,
    });
    let clock = 1_700_000_000_000;
    const internals = __pulseTestInternals();
    internals.setPulseNow(() => clock);
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId]);
    const retained = createFileFallbackStore(walFile).loadPendingFlushes();
    assert.deepEqual(retained.map((row) => row.flushId), [badId]);
    assert.equal(deltaCanonicalDigest(retained[0].delta), badDigest);
    assert.equal(retained[0].delta.mcpToolCallsByName.check_agent_readiness, 1);
    assert.equal(pulseSnapshot().complete, false);
    assert.equal(pulseSnapshot().persistenceFailure.flushId, badId);
    assert.equal(pulseSnapshot().persistenceFailure.class, "permanent");
    assert.equal(pulseSnapshot().persistenceFailure.code, "22023");
    assert.equal(pulseSnapshot().persistenceFailure.status, 400);
    assert.match(pulseSnapshot().persistenceFailure.message, /mcpToolCallsByName/);
    assert.equal((await authority.readSnapshot(OBSERVED)).total, 4);

    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId], "permanent 400/22023 must not hot-retry");

    internals.pendingDelta.total = 2;
    internals.pendingDelta.humans = 2;
    assert.equal(internals.admitPendingDeltaToWal(), true);
    const laterId = createFileFallbackStore(walFile).loadPendingFlushes().at(-1).flushId;
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId, laterId]);
    assert.equal((await authority.readSnapshot(OBSERVED)).total, 6);
    assert.equal(pulseSnapshot().complete, false);
    assert.deepEqual(
      createFileFallbackStore(walFile).loadPendingFlushes().map((row) => row.flushId),
      [badId],
    );

    reject = false;
    clock += PERMANENT_FLUSH_BACKOFF_MS[0] - 1;
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 3);
    clock += 1;
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId, laterId, badId]);
    assert.equal((await authority.readSnapshot(OBSERVED)).total, 7);
    assert.equal((await authority.readSnapshot(OBSERVED)).mcpToolCallsByName.check_agent_readiness, 1);
    assert.equal(createFileFallbackStore(walFile).loadPendingFlushes().length, 0);
    assert.equal(createFileFallbackStore(walFile).getDroppedUnknown(), 0);
    assert.equal(pulseSnapshot().persistenceFailure, null);
    assert.equal(pulseSnapshot().complete, true);
  });

  await t.test("transient backoff stays bounded and a lost ack is not double-counted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-retry-transient-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const walFile = join(dir, "fallback.json");
    const authority = createFakePulseAuthority({ mcpToolCallsObservedFrom: OBSERVED });
    let failuresLeft = 3;
    const calls = [];
    const base = createFakeRpcTransport(authority);
    const store = createPulseStoreFromTransport({
      async rpc(fn, args) {
        if (fn === "pulse_apply_delta") {
          calls.push(args.p_flush_id);
          if (failuresLeft > 0) {
            failuresLeft -= 1;
            return { data: null, error: { message: "network_timeout" }, status: 503 };
          }
        }
        return base.rpc(fn, args);
      },
    });
    configurePulseStoreForTests({ store, fallbackFile: walFile, autoHydrate: false });
    let clock = 1_700_000_000_000;
    const internals = __pulseTestInternals();
    internals.setPulseNow(() => clock);
    internals.pendingDelta.total = 1;
    internals.pendingDelta.humans = 1;
    internals.admitPendingDeltaToWal();
    const flushId = createFileFallbackStore(walFile).loadPendingFlushes()[0].flushId;
    const bytes = readFileSync(walFile, "utf8");
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [flushId]);
    assert.equal(readFileSync(walFile, "utf8"), bytes, "failed flush must not rewrite the WAL");
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 1);
    clock += TRANSIENT_FLUSH_BACKOFF_MS[0];
    await internals.drainPendingFlushes();
    clock += TRANSIENT_FLUSH_BACKOFF_MS[1];
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 3);
    assert.equal(pulseSnapshot().persistenceFailure.class, "transient");
    assert.equal(pulseSnapshot().complete, false);
    clock += TRANSIENT_FLUSH_BACKOFF_MS[2];
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 4);
    assert.equal((await authority.readSnapshot(OBSERVED)).total, 1);
    assert.equal(createFileFallbackStore(walFile).loadPendingFlushes().length, 0);
    await internals.drainPendingFlushes();
    assert.equal((await authority.readSnapshot(OBSERVED)).total, 1);
    assert.equal(pulseSnapshot().complete, true);
  });

  await t.test("a crashed transport keeps the original flush bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-retry-spawn-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const walFile = join(dir, "fallback.json");
    const flushId = newFlushId();
    writeWal(walFile, [{ flushId, delta: delta({ total: 5, humans: 5 }), createdAt: CREATED }]);
    const before = readFileSync(walFile);
    let calls = 0;
    configurePulseStoreForTests({
      store: createPulseStoreFromTransport({
        async rpc() {
          calls += 1;
          throw new Error("psql spawn failed: EAGAIN");
        },
      }),
      fileFallback: createFileFallbackStore(walFile),
      autoHydrate: false,
    });
    let clock = 1_700_000_000_000;
    const internals = __pulseTestInternals();
    internals.setPulseNow(() => clock);
    await internals.drainPendingFlushes();
    await internals.drainPendingFlushes();
    assert.equal(calls, 1);
    assert.deepEqual(readFileSync(walFile), before);
    clock += TRANSIENT_FLUSH_BACKOFF_MS[0];
    await internals.drainPendingFlushes();
    assert.equal(calls, 2);
    assert.deepEqual(readFileSync(walFile), before);
    assert.equal(pulseSnapshot().complete, false);
    assert.equal(createFileFallbackStore(walFile).loadPendingFlushes()[0].flushId, flushId);
  });

  await t.test("real PostgreSQL 17 replays the original entry after the contract admits it", async () => {
    requirePostgresBinaries();
    const cluster = startDisposableCluster();
    t.after(() => cluster.stop());
    psql(cluster, null, {
      input: `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO service_role;
${migration0002}
${migration0003}
`,
    });
    const dir = mkdtempSync(join(tmpdir(), "pulse-retry-pg-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const walFile = join(dir, "fallback.json");
    const badId = "f2000000-0000-4000-8000-000000000001";
    const goodId = "f2000000-0000-4000-8000-000000000002";
    const badDelta = delta({ mcpToolCallsByName: { check_agent_readiness: 1 } });
    writeWal(walFile, [
      { flushId: badId, delta: badDelta, createdAt: CREATED },
      { flushId: goodId, delta: delta({ total: 4, humans: 4 }), createdAt: CREATED },
    ]);
    const badDigest = deltaCanonicalDigest(badDelta);
    const calls = [];
    const transport = createPsqlPulseTransport(cluster);
    const store = createPulseStoreFromTransport({
      async rpc(fn, args) {
        if (fn === "pulse_apply_delta") calls.push(args.p_flush_id);
        return transport.rpc(fn, args);
      },
    });
    configurePulseStoreForTests({
      store,
      fileFallback: createFileFallbackStore(walFile),
      autoHydrate: false,
    });
    let clock = 1_700_000_000_000;
    const internals = __pulseTestInternals();
    internals.setPulseNow(() => clock);
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId]);
    assert.equal(psqlTuples(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;"), "4");
    const retained = createFileFallbackStore(walFile).loadPendingFlushes();
    assert.equal(retained.length, 1);
    assert.equal(retained[0].flushId, badId);
    assert.equal(deltaCanonicalDigest(retained[0].delta), badDigest);
    assert.equal(pulseSnapshot().complete, false);
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId]);

    psql(cluster, null, { input: migration0005 });
    clock += PERMANENT_FLUSH_BACKOFF_MS[0] - 1;
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 2);
    clock += 1;
    await internals.drainPendingFlushes();
    assert.deepEqual(calls, [badId, goodId, badId]);
    assert.equal(psqlTuples(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;"), "5");
    assert.equal(
      psqlTuples(cluster, "SELECT mcp_tool_calls_by_name->>'check_agent_readiness' FROM public.pulse_aggregate WHERE classification_schema_version=2;"),
      "1",
    );
    assert.equal(
      psqlTuples(cluster, `SELECT count(*) FROM public.pulse_flush_receipts WHERE flush_id='${badId}';`),
      "1",
    );
    const receipt = psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${badId}';`);
    await internals.drainPendingFlushes();
    assert.equal(calls.length, 3, "drained entry must not be applied again");
    assert.equal(psqlTuples(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;"), "5");
    assert.equal(psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${badId}';`), receipt);
    assert.equal(createFileFallbackStore(walFile).loadPendingFlushes().length, 0);
    assert.equal(pulseSnapshot().complete, true);
    assert.equal(MCP_TOOL_NAMES.includes("check_agent_readiness"), true);
    const boundaryBeforeForward = psqlTuples(
      cluster,
      "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;",
    );
    psql(cluster, null, { input: migrationForward });
    psql(cluster, null, { input: migrationForward });
    assert.equal(psqlTuples(cluster, "SELECT total FROM public.pulse_aggregate WHERE classification_schema_version=2;"), "5");
    assert.equal(
      psqlTuples(cluster, "SELECT mcp_tool_calls_by_name->>'check_agent_readiness' FROM public.pulse_aggregate WHERE classification_schema_version=2;"),
      "1",
    );
    assert.equal(psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${badId}';`), receipt);
    assert.equal(
      psqlTuples(cluster, "SELECT mcp_tool_calls_observed_from::text FROM public.pulse_aggregate WHERE classification_schema_version=2;"),
      boundaryBeforeForward,
    );
    assert.equal(
      psqlTuples(cluster, "SELECT coalesce(mcp_tool_calls_by_name->>'project_funnel_evidence', '') FROM public.pulse_aggregate WHERE classification_schema_version=2;"),
      "",
      "forward contract must not backfill the new tool into existing rows",
    );
  });
});
