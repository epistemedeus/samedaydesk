import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import {
  LEGACY_IMPORT_KEY,
  containsRawRequestData,
  deltaFromV2Snapshot,
  deltaToRpcPayload,
  emptyDelta,
  emptyFunnel,
  stableFlushIdFromDelta,
  validateDelta,
  validateLegacyObservation,
} from "../lib/pulse-store/schema.js";
import { createPulseStoreFromTransport, newFlushId } from "../lib/pulse-store/index.js";
import { createFileFallbackStore } from "../lib/pulse-store/file-fallback.js";
import { atomicWriteJson } from "../lib/pulse-store/atomic-write.js";
import {
  createFakePulseAuthority,
  createFakeRpcTransport,
} from "./helpers/fake-pulse-authority.js";

const MIGRATION_SQL = readFileSync(
  new URL("../../supabase/migrations/0002_pulse_durable.sql", import.meta.url),
  "utf8",
);
const WAL_LOCK_SOURCE = readFileSync(
  new URL("../lib/pulse-store/wal-lock.js", import.meta.url),
  "utf8",
);

function makeDelta(overrides = {}) {
  return {
    ...emptyDelta(),
    total: 1,
    humans: 1,
    ...overrides,
  };
}

test("SQL migration uses constant-size aggregate, receipts, and service_role grants", () => {
  assert.match(MIGRATION_SQL, /create table if not exists public\.pulse_aggregate/);
  assert.match(MIGRATION_SQL, /create table if not exists public\.pulse_flush_receipts/);
  assert.match(MIGRATION_SQL, /create table if not exists public\.pulse_legacy_observations/);
  assert.match(MIGRATION_SQL, /observation_hash/);
  assert.match(MIGRATION_SQL, /pulse_legacy_import_conflict/);
  assert.match(MIGRATION_SQL, /on conflict \(classification_schema_version\) do update/);
  assert.match(MIGRATION_SQL, /revoke all on public\.pulse_aggregate from public, anon, authenticated/);
  assert.match(MIGRATION_SQL, /grant execute on function public\.pulse_apply_delta\(uuid, jsonb\) to service_role/);
  assert.doesNotMatch(MIGRATION_SQL, /pulse_time_buckets/);
  assert.doesNotMatch(MIGRATION_SQL, /create extension/i);
});

test("two disjoint store instances flush to fake authority and exact totals sum", async () => {
  const authority = createFakePulseAuthority();
  const storeA = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  const storeB = createPulseStoreFromTransport(createFakeRpcTransport(authority));

  await storeA.flush(newFlushId(), makeDelta({ total: 4, humans: 3, bots: 1 }));
  await storeB.flush(newFlushId(), makeDelta({ total: 7, humans: 5, bots: 2 }));

  const snapshot = await storeA.readSnapshot("2026-09-02T01:00:00.000Z");
  assert.equal(snapshot.total, 11);
  assert.equal(snapshot.humans, 8);
  assert.equal(snapshot.bots, 3);
});

test("same flush ID replay is idempotent and conflicting delta fails", async () => {
  const authority = createFakePulseAuthority();
  const store = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  const flushId = newFlushId();
  const delta = makeDelta({ total: 2, humans: 2 });

  await store.flush(flushId, delta);
  await store.flush(flushId, delta);

  await assert.rejects(
    () => store.flush(flushId, makeDelta({ total: 3, humans: 3 })),
    (err) => err.message.includes("pulse_flush_id_conflict"),
  );

  assert.equal((await authority.readSnapshot("2026-09-01T00:00:00.000Z")).total, 2);
});

test("defect 1: ambiguous ack retry keeps one owner and new events do not double-add", async () => {
  const {
    configurePulseStoreForTests,
    pulseMiddleware,
    pulseSnapshot,
    __pulseTestInternals,
  } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-amend-1-"));
  const authority = createFakePulseAuthority();
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority, { applyThenError: true })),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });

  pulseMiddleware({ method: "GET", path: "/pricing", headers: { "user-agent": "Mozilla/5.0" }, ip: "1.1.1.1" }, {}, () => {});
  const { drainPendingFlushes } = __pulseTestInternals();
  await drainPendingFlushes();
  await drainPendingFlushes();

  pulseMiddleware({ method: "GET", path: "/scan", headers: { "user-agent": "Mozilla/5.0" }, ip: "2.2.2.2" }, {}, () => {});
  await drainPendingFlushes();

  assert.equal((await authority.readSnapshot("2026-01-01T00:00:00.000Z")).total, 2);
  assert.equal(pulseSnapshot().total, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("defect 2: dropped backlog counts once and keeps known-gap completeness false", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-amend-2-"));
  const fallbackFile = join(dir, "fallback.json");
  const fallback = createFileFallbackStore(fallbackFile);
  for (let i = 0; i < 48; i += 1) {
    fallback.enqueuePendingFlush({
      flushId: newFlushId(),
      delta: makeDelta({ total: 1, humans: i + 1 }),
      createdAt: new Date().toISOString(),
    });
  }
  const dropped = fallback.enqueuePendingFlush({
    flushId: newFlushId(),
    delta: makeDelta({ total: 1, humans: 99 }),
    createdAt: new Date().toISOString(),
  });
  assert.equal(dropped.outcome, "dropped_persisted");
  assert.equal(fallback.getDroppedUnknown(), 1);
  rmSync(dir, { recursive: true, force: true });
});

test("defect 2: known gap persists complete false even with empty backlog", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, waitForPulseHydration } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-amend-2b-"));
  writeFileSync(
    join(dir, "fallback.json"),
    JSON.stringify({ version: 2, pendingFlushes: [], droppedUnknown: 3, legacyImported: false }),
  );
  configurePulseStoreForTests({
    forceFallback: true,
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  await waitForPulseHydration();
  const snap = pulseSnapshot();
  assert.equal(snap.knownGap.droppedUnknown, 3);
  assert.equal(snap.complete, false);
  assert.equal(snap.authority, "incomplete_known_gap");
  rmSync(dir, { recursive: true, force: true });
});

test("defect 3: atomic fallback write and corrupt file surfaces fallbackCorrupt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-amend-3-"));
  const fallbackFile = join(dir, "fallback.json");
  writeFileSync(fallbackFile, "{not-json");
  const { configurePulseStoreForTests, pulseSnapshot } = await import("../lib/pulse.js");
  configurePulseStoreForTests({
    forceFallback: true,
    fallbackFile,
    autoHydrate: false,
  });
  const snap = pulseSnapshot();
  assert.equal(snap.knownGap.fallbackCorrupt, true);
  assert.equal(snap.complete, false);
  atomicWriteJson(fallbackFile, { version: 1, pendingFlushes: [], droppedUnknown: 0, legacyImported: false });
  rmSync(dir, { recursive: true, force: true });
});

test("defect 4: durable RPC payload excludes uniqueHumans and fingerprint sets", () => {
  const payload = deltaToRpcPayload(validateDelta(makeDelta({ humans: 2 })));
  assert.equal("uniqueHumans" in payload, false);
  assert.equal(containsRawRequestData(payload), false);
});

test("defect 5: public pulse response omits absolute fallback paths", async () => {
  const { pulseSnapshot } = await import("../lib/pulse.js");
  const snap = pulseSnapshot();
  assert.equal("fallbackFile" in snap.storage, false);
  const serialized = JSON.stringify(snap);
  assert.equal(serialized.includes(".fallback.json"), false);
  assert.equal(serialized.includes("samedaydesk/pulse"), false);
});

test("defect 6: hydration recovers from fallback on lifecycle retry", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-amend-6-"));
  const authority = createFakePulseAuthority();
  await authority.applyDelta(newFlushId(), makeDelta({ total: 4, humans: 4 }));
  let reads = 0;
  const transport = {
    async rpc(fn, args) {
      if (fn === "pulse_read_snapshot") {
        reads += 1;
        if (reads === 1) return { data: null, error: { message: "temporary_outage" } };
      }
      return createFakeRpcTransport(authority).rpc(fn, args);
    },
  };
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(transport),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  const { hydrateFromDurableStore, maybeRetryHydration } = __pulseTestInternals();
  await hydrateFromDurableStore();
  assert.equal(pulseSnapshot().authority, "incomplete_local_fallback");
  maybeRetryHydration();
  await hydrateFromDurableStore();
  assert.equal(pulseSnapshot().authority, "durable_atomic_aggregate");
  rmSync(dir, { recursive: true, force: true });
});

test("defect 7: conflicting legacy import replay fails closed", async () => {
  const authority = createFakePulseAuthority();
  const store = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  const base = {
    schemaVersion: 1,
    note: "Incomplete PR9 window only.",
    startedAt: "2026-08-30T00:00:00.000Z",
    total: 64,
    humans: 60,
    uniqueHumans: 10,
    bots: 2,
    aiCrawlers: 2,
    byPath: { "/mcp": 64 },
    byReferer: { "(direct)": 64 },
    byAiBot: {},
    funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
  };
  await store.importLegacyObservation(LEGACY_IMPORT_KEY, base);
  await assert.rejects(
    () => store.importLegacyObservation(LEGACY_IMPORT_KEY, { ...base, total: 99 }),
    (err) => /pulse_legacy_import_conflict/.test(err.message),
  );
});

test("defect 8: snapshot read is constant-size aggregate not bucket scan", () => {
  assert.doesNotMatch(MIGRATION_SQL, /from public\.pulse_time_buckets/);
  assert.match(MIGRATION_SQL, /from public\.pulse_aggregate/);
});

test("legacy import idempotent with identical payload stays incomplete", async () => {
  const store = createPulseStoreFromTransport(createFakeRpcTransport(createFakePulseAuthority()));
  const observation = {
    schemaVersion: 1,
    note: "Incomplete PR9 window only.",
    total: 64,
    humans: 60,
    uniqueHumans: 10,
    bots: 2,
    aiCrawlers: 2,
    byPath: { "/mcp": 64 },
    byReferer: { "(direct)": 64 },
    byAiBot: {},
    funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
  };
  validateLegacyObservation(observation);
  const first = await store.importLegacyObservation(LEGACY_IMPORT_KEY, observation);
  const second = await store.importLegacyObservation(LEGACY_IMPORT_KEY, observation);
  assert.equal(first.status, "imported");
  assert.equal(second.status, "already_imported");
});

test("seller-repair counters survive durable round trip", async () => {
  const store = createPulseStoreFromTransport(createFakeRpcTransport(createFakePulseAuthority()));
  const delta = makeDelta({
    sellerRepair: {
      briefViews: 2,
      scopeClicks: 1,
      checkoutStarts: 1,
      byFinding: {
        "vibe-springs-btc-usd-20260830": {
          routeClass: "paid_get",
          briefViews: 2,
          scopeClicks: 1,
          checkoutStarts: 0,
        },
      },
    },
  });
  await store.flush(newFlushId(), delta);
  const snapshot = await store.readSnapshot("2026-09-02T01:00:00.000Z");
  assert.equal(snapshot.sellerRepair.briefViews, 2);
});

test("delta validation fails closed for malformed inputs", () => {
  assert.throws(() => validateDelta(null), /pulse_invalid_delta/);
  assert.throws(() => validateDelta(makeDelta({ total: -1 })), /total/);
  assert.throws(() => validateDelta({ ...makeDelta(), bucketStart: "x" }), /pulse_invalid_delta/);
  assert.throws(() => validateDelta(makeDelta({ schemaVersion: 3 })), /schema_version/);
});

test("amendment 2 defect 1: legacy snapshot plus WAL duplicate cannot double count", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-1-"));
  const pulseFile = join(dir, "pulse.json");
  const walFile = `${pulseFile}.fallback.json`;
  const delta = makeDelta({ total: 5, humans: 5 });
  const flushId = stableFlushIdFromDelta(delta);
  writeFileSync(
    pulseFile,
    JSON.stringify({
      classificationSchemaVersion: 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      total: 5,
      humans: 5,
      bots: 0,
      aiCrawlers: 0,
      mcpSurfaceGets: 0,
      mcpProtocol: { requests: 0, messages: 0, byMethod: {} },
      sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
      byPath: {},
      byReferer: {},
      byAiBot: {},
      funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
    }),
  );
  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [
        { flushId, delta, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      droppedUnknown: 0,
      legacyImported: false,
    }),
  );
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify({ total: pulseSnapshot().total, queue: pulseSnapshot().pending.total }));`,
    ],
    { env: { ...process.env, PULSE_FILE: pulseFile }, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const out = JSON.parse(reader.stdout);
  assert.equal(out.total, 5);
  assert.equal(out.queue, 5);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 1b: ambiguous ack restart reuses flush ID then counts new events once", async () => {
  const {
    configurePulseStoreForTests,
    pulseMiddleware,
    pulseSnapshot,
    __pulseTestInternals,
  } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-1b-"));
  const authority = createFakePulseAuthority();
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority, { applyThenError: true })),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  pulseMiddleware({ method: "GET", path: "/pricing", headers: { "user-agent": "Mozilla/5.0" }, ip: "1.1.1.1" }, {}, () => {});
  const { admitPendingDeltaToWal, drainPendingFlushes } = __pulseTestInternals();
  admitPendingDeltaToWal();
  const walAfterAdmit = JSON.parse(readFileSync(join(dir, "fallback.json"), "utf8"));
  const firstFlushId = walAfterAdmit.pendingFlushes[0].flushId;
  await drainPendingFlushes();
  const walAfterFail = JSON.parse(readFileSync(join(dir, "fallback.json"), "utf8"));
  assert.equal(walAfterFail.pendingFlushes.length, 1);
  assert.equal(walAfterFail.pendingFlushes[0].flushId, firstFlushId);

  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority)),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  const internals = __pulseTestInternals();
  await internals.drainPendingFlushes();
  pulseMiddleware({ method: "GET", path: "/scan", headers: { "user-agent": "Mozilla/5.0" }, ip: "2.2.2.2" }, {}, () => {});
  internals.admitPendingDeltaToWal();
  await internals.drainPendingFlushes();
  assert.equal((await authority.readSnapshot("2026-01-01T00:00:00.000Z")).total, 2);
  assert.equal(pulseSnapshot().total, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 2: refused delta is not reinserted by drain", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-2-"));
  const walFile = join(dir, "fallback.json");
  const pendingFlushes = [];
  for (let i = 0; i < 48; i += 1) {
    pendingFlushes.push({
      flushId: newFlushId(),
      delta: makeDelta({ total: 1, humans: i + 1 }),
      createdAt: new Date().toISOString(),
    });
  }
  writeFileSync(
    walFile,
    JSON.stringify({ version: 2, pendingFlushes, droppedUnknown: 0, legacyImported: false }),
  );
  configurePulseStoreForTests({
    forceFallback: true,
    fallbackFile: walFile,
    autoHydrate: false,
  });
  const { pendingDelta, admitPendingDeltaToWal, drainPendingFlushes } = __pulseTestInternals();
  pendingDelta.total = 1;
  pendingDelta.humans = 99;
  assert.equal(admitPendingDeltaToWal(), false);
  assert.equal(pulseSnapshot().knownGap.droppedUnknown, 1);
  await drainPendingFlushes();
  assert.equal(pulseSnapshot().pending.total, 48);
  assert.equal(pulseSnapshot().total, 48);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 3: future schema snapshot fails closed with known gap", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-3-"));
  const pulseFile = join(dir, "pulse.json");
  writeFileSync(
    pulseFile,
    JSON.stringify({ classificationSchemaVersion: 3, total: 99, humans: 99 }),
  );
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify(pulseSnapshot()));`,
    ],
    { env: { ...process.env, PULSE_FILE: pulseFile }, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const snap = JSON.parse(reader.stdout);
  assert.equal(snap.knownGap.snapshotCorrupt, true);
  assert.equal(snap.complete, false);
  assert.equal(snap.total, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 3b: malformed snapshot migration fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-3b-"));
  const pulseFile = join(dir, "pulse.json");
  writeFileSync(
    pulseFile,
    JSON.stringify({
      classificationSchemaVersion: 2,
      total: -1,
      humans: 0,
      bots: 0,
      aiCrawlers: 0,
      mcpSurfaceGets: 0,
      mcpProtocol: { requests: 0, messages: 0, byMethod: {} },
      sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
      byPath: {},
      byReferer: {},
      byAiBot: {},
      funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
    }),
  );
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify({ corrupt: pulseSnapshot().knownGap.snapshotCorrupt, total: pulseSnapshot().total }));`,
    ],
    { env: { ...process.env, PULSE_FILE: pulseFile }, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const out = JSON.parse(reader.stdout);
  assert.equal(out.corrupt, true);
  assert.equal(out.total, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 3c: deltaFromV2Snapshot rejects unknown keys", () => {
  assert.throws(
    () => deltaFromV2Snapshot({ classificationSchemaVersion: 2, total: 1, unknown: 1 }),
    /pulse_invalid_snapshot/,
  );
});

test("amendment 2 defect 4: corrupt fallback is not overwritten and DB hydrate keeps known gap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-4-"));
  const walFile = join(dir, "fallback.json");
  writeFileSync(walFile, "{bad-json");
  const authority = createFakePulseAuthority();
  await authority.applyDelta(newFlushId(), makeDelta({ total: 3, humans: 3 }));
  const { configurePulseStoreForTests, pulseSnapshot, waitForPulseHydration } = await import("../lib/pulse.js");
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority)),
    fallbackFile: walFile,
    autoHydrate: false,
  });
  await waitForPulseHydration();
  const snap = pulseSnapshot();
  assert.equal(snap.knownGap.fallbackCorrupt, true);
  assert.equal(snap.complete, false);
  assert.equal(snap.durable?.total, 3);
  assert.match(readFileSync(walFile, "utf8"), /bad-json/);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 2 defect 4b: atomic write uses private temp names", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a2-4b-"));
  const target = join(dir, "wal.json");
  atomicWriteJson(target, { version: 2, pendingFlushes: [], droppedUnknown: 0 });
  const leftovers = readdirSync(dir);
  assert.equal(leftovers.some((name) => name.includes(".tmp")), false);
  rmSync(dir, { recursive: true, force: true });
});

function spawnPulseProcess(env, body) {
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { configurePulseStoreForTests, pulseMiddleware, flushPulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n${body}`,
    ],
    { env, encoding: "utf8" },
  );
}

test("amendment 3: two Node child processes retain disjoint WAL entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-mp-"));
  const pulseFile = join(dir, "pulse.json");
  const walFile = `${pulseFile}.fallback.json`;
  const env = { ...process.env, PULSE_FILE: pulseFile };
  const child = (requestPath) =>
    `configurePulseStoreForTests({ forceFallback: true, fallbackFile: ${JSON.stringify(walFile)}, autoHydrate: false });\n` +
    `pulseMiddleware({ method: "GET", path: ${JSON.stringify(requestPath)}, headers: { "user-agent": "Mozilla/5.0" }, ip: "127.0.0.1" }, {}, () => {});\n` +
    `if (!flushPulseSnapshot()) process.exit(4);\n`;

  const first = spawnPulseProcess(env, child("/process-a"));
  const second = spawnPulseProcess(env, child("/process-b"));
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const wal = JSON.parse(readFileSync(walFile, "utf8"));
  assert.equal(wal.version, 2);
  assert.equal(wal.pendingFlushes.length, 2);
  assert.equal(wal.snapshotCorrupt, false);

  const authority = createFakePulseAuthority();
  const { configurePulseStoreForTests, __pulseTestInternals } = await import("../lib/pulse.js");
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority)),
    fallbackFile: walFile,
    autoHydrate: false,
  });
  await __pulseTestInternals().drainPendingFlushes();
  assert.equal((await authority.readSnapshot("2026-01-01T00:00:00.000Z")).total, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: overlapping child mutations preserve both WAL entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-overlap-"));
  const pulseFile = join(dir, "pulse.json");
  const walFile = `${pulseFile}.fallback.json`;
  const env = { ...process.env, PULSE_FILE: pulseFile };
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const childScript =
    `const { configurePulseStoreForTests, pulseMiddleware, flushPulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
    `const path = process.argv[1];\n` +
    `configurePulseStoreForTests({ forceFallback: true, fallbackFile: ${JSON.stringify(walFile)}, autoHydrate: false });\n` +
    `for (let i = 0; i < 12; i += 1) {\n` +
    `  pulseMiddleware({ method: "GET", path: path + "/" + i, headers: { "user-agent": "Mozilla/5.0" }, ip: "127.0.0.1" }, {}, () => {});\n` +
    `  if (!flushPulseSnapshot()) process.exit(5);\n` +
    `}\n`;

  await Promise.all(
    ["/overlap-a", "/overlap-b"].map(
      (requestPath) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ["--input-type=module", "-e", childScript, requestPath], { env });
          child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
        }),
    ),
  );

  const wal = JSON.parse(readFileSync(walFile, "utf8"));
  assert.equal(wal.pendingFlushes.length, 24);
  assert.equal(wal.snapshotCorrupt, false);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: write failure keeps memory delta and walWritePending", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-write-"));
  const fallback = createFileFallbackStore(join(dir, "fallback.json"), {
    writeJson: () => false,
  });
  const { configurePulseStoreForTests, pulseMiddleware, pulseSnapshot, __pulseTestInternals } =
    await import("../lib/pulse.js");
  configurePulseStoreForTests({
    fileFallback: fallback,
    forceFallback: true,
    autoHydrate: false,
  });
  pulseMiddleware(
    { method: "GET", path: "/pricing", headers: { "user-agent": "Mozilla/5.0" }, ip: "1.1.1.1" },
    {},
    () => {},
  );
  const { pendingDelta, admitPendingDeltaToWal } = __pulseTestInternals();
  assert.equal(pendingDelta.total, 1);
  assert.equal(admitPendingDeltaToWal(), false);
  assert.equal(pendingDelta.total, 1);
  assert.equal(pulseSnapshot().knownGap.walWritePending, true);
  assert.equal(pulseSnapshot().complete, false);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: post-ack read failure stays incomplete until lifecycle retry", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } = await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-stale-"));
  const authority = createFakePulseAuthority();
  let readFails = true;
  const transport = {
    async rpc(fn, args) {
      if (fn === "pulse_read_snapshot" && readFails) {
        return { data: null, error: { message: "temporary_outage" } };
      }
      return createFakeRpcTransport(authority).rpc(fn, args);
    },
  };
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(transport),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  const { pendingDelta, admitPendingDeltaToWal, drainPendingFlushes, hydrateFromDurableStore, maybeRetryHydration } =
    __pulseTestInternals();
  pendingDelta.total = 2;
  pendingDelta.humans = 2;
  admitPendingDeltaToWal();
  await drainPendingFlushes();
  assert.equal(pulseSnapshot().complete, false);
  assert.equal(pulseSnapshot().storage.hydrationState, "stale");
  readFails = false;
  maybeRetryHydration();
  await hydrateFromDurableStore();
  assert.equal(pulseSnapshot().storage.hydrationState, "hydrated");
  assert.equal(pulseSnapshot().complete, true);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: WAL rejects future version and unknown root keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-wal-"));
  const walFile = join(dir, "fallback.json");
  writeFileSync(
    walFile,
    JSON.stringify({ version: 3, pendingFlushes: [], droppedUnknown: 0, legacyImported: false }),
  );
  const fallback = createFileFallbackStore(walFile);
  assert.equal(fallback.isCorrupt(), true);
  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [],
      droppedUnknown: 0,
      legacyImported: false,
      unexpected: 1,
    }),
  );
  assert.equal(createFileFallbackStore(walFile).isCorrupt(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: duplicate flush ID with different delta marks WAL corrupt", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-conflict-"));
  const walFile = join(dir, "fallback.json");
  const flushId = newFlushId();
  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [
        {
          flushId,
          delta: makeDelta({ total: 1, humans: 1 }),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          flushId,
          delta: makeDelta({ total: 2, humans: 2 }),
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      droppedUnknown: 0,
      legacyImported: false,
    }),
  );
  const fallback = createFileFallbackStore(walFile);
  assert.equal(fallback.isCorrupt(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("amendment 3: legacy v2 snapshot with uniqueHumans migrates counters once", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-a3-v2fp-"));
  const pulseFile = join(dir, "pulse.json");
  writeFileSync(
    pulseFile,
    JSON.stringify({
      classificationSchemaVersion: 2,
      startedAt: "2026-01-01T00:00:00.000Z",
      total: 3,
      humans: 3,
      uniqueHumans: ["fingerprint-a", "fingerprint-b"],
      bots: 0,
      aiCrawlers: 0,
      mcpSurfaceGets: 0,
      mcpProtocol: { requests: 0, messages: 0, byMethod: {} },
      sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
      byPath: { "/": 3 },
      byReferer: {},
      byAiBot: {},
      funnel: { home: 3, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
    }),
  );
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify({ total: pulseSnapshot().total, corrupt: pulseSnapshot().knownGap.snapshotCorrupt }));`,
    ],
    { env: { ...process.env, PULSE_FILE: pulseFile }, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const out = JSON.parse(reader.stdout);
  assert.equal(out.total, 3);
  assert.equal(out.corrupt, false);
  const wal = JSON.parse(readFileSync(`${pulseFile}.fallback.json`, "utf8"));
  assert.equal(wal.pendingFlushes.length, 1);
  assert.equal(JSON.stringify(wal.pendingFlushes[0].delta).includes("fingerprint"), false);
  rmSync(dir, { recursive: true, force: true });
});

test("controller: locally pending counters never claim durable authority", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } =
    await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-controller-authority-"));
  const authority = createFakePulseAuthority();
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority)),
    fallbackFile: join(dir, "fallback.json"),
    autoHydrate: false,
  });
  const { pendingDelta, hydrateFromDurableStore } = __pulseTestInternals();
  await hydrateFromDurableStore();
  pendingDelta.total = 1;
  pendingDelta.humans = 1;
  const snapshot = pulseSnapshot();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.durable.total, 0);
  assert.equal(snapshot.pending.total, 1);
  assert.equal(snapshot.authority, "incomplete_local_fallback");
  assert.equal(snapshot.complete, false);
  rmSync(dir, { recursive: true, force: true });
});

test("controller: WAL booleans are strict and same-entry replays deduplicate", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-controller-wal-"));
  const walFile = join(dir, "fallback.json");
  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [],
      droppedUnknown: 0,
      legacyImported: "false",
    }),
  );
  assert.equal(createFileFallbackStore(walFile).isCorrupt(), true);

  const flushId = newFlushId();
  const delta = makeDelta({ total: 2, humans: 2 });
  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [
        { flushId, delta, createdAt: "2026-01-01T00:00:00.000Z" },
        { flushId, delta, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      droppedUnknown: 0,
      legacyImported: false,
      snapshotCorrupt: false,
    }),
  );
  const fallback = createFileFallbackStore(walFile);
  assert.equal(fallback.isCorrupt(), false);
  assert.equal(fallback.loadPendingFlushes().length, 1);

  writeFileSync(
    walFile,
    JSON.stringify({
      version: 2,
      pendingFlushes: [],
      droppedUnknown: 0,
      legacyImported: false,
      snapshotCorrupt: "false",
    }),
  );
  assert.equal(createFileFallbackStore(walFile).isCorrupt(), true);
  rmSync(dir, { recursive: true, force: true });
});

test("controller: mutated WAL state is validated before atomic write", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-controller-mutation-"));
  const walFile = join(dir, "fallback.json");
  const fallback = createFileFallbackStore(walFile);
  assert.equal(
    fallback.persistLocalMetadata({ observationStartedAt: "not-an-iso-timestamp" }),
    false,
  );
  assert.equal(fallback.isCorrupt(), false);
  rmSync(dir, { recursive: true, force: true });
});

test("controller: durable ack with failed WAL removal remains retryable and incomplete", async () => {
  const { configurePulseStoreForTests, pulseSnapshot, __pulseTestInternals } =
    await import("../lib/pulse.js");
  const dir = mkdtempSync(join(tmpdir(), "pulse-controller-ack-"));
  const walFile = join(dir, "fallback.json");
  let writeCount = 0;
  const fallback = createFileFallbackStore(walFile, {
    writeJson(filePath, value) {
      writeCount += 1;
      if (writeCount === 2) return false;
      return atomicWriteJson(filePath, value);
    },
  });
  const authority = createFakePulseAuthority();
  configurePulseStoreForTests({
    store: createPulseStoreFromTransport(createFakeRpcTransport(authority)),
    fileFallback: fallback,
    autoHydrate: false,
  });
  const { pendingDelta, admitPendingDeltaToWal, drainPendingFlushes } = __pulseTestInternals();
  pendingDelta.total = 1;
  pendingDelta.humans = 1;
  assert.equal(admitPendingDeltaToWal(), true);
  await drainPendingFlushes();
  const snapshot = pulseSnapshot();
  assert.equal((await authority.readSnapshot("2026-01-01T00:00:00.000Z")).total, 1);
  assert.equal(snapshot.authority, "incomplete_local_fallback");
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.knownGap.walWritePending, true);
  assert.equal(fallback.loadPendingFlushes().length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("controller: lock retry sleeps without CPU spin and releases only its token", () => {
  assert.match(WAL_LOCK_SOURCE, /Atomics\.wait/);
  assert.doesNotMatch(WAL_LOCK_SOURCE, /while \(Date\.now\(\) </);
  assert.match(WAL_LOCK_SOURCE, /owner\?\.token === token/);
});
