import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import * as pg from "./helpers/pulse-pg-cluster.js";
import { networkInfo, taskFixture } from "./helpers/taskmarket-fixtures.js";
import { deltaCanonicalDigest, deltaFromV2Snapshot, emptyDelta, validateDelta } from "../lib/pulse-store/schema.js";
import { browseCoverage, mergeMcpOutcomes, validateMcpOutcomes } from "../lib/pulse-store/mcp-outcomes.js";
import { createPulseStoreFromTransport } from "../lib/pulse-store/supabase-adapter.js";

const at = "2026-10-23T01:39:00.000Z";
const next = "2026-10-23T05:30:00.000Z";
const normal = "unattributed|browse_taskmarket_tasks|normal_result";
const empty = "unattributed|browse_taskmarket_tasks|browse_empty";
const nonEmpty = "unattributed|browse_taskmarket_tasks|browse_non_empty";
const oldObservation = () => ({ observedFrom: at, counts: { [normal]: 4 } });
const newObservation = () => ({ observedFrom: next, browseObservedFrom: next, counts: { [empty]: 1 } });
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("old result counts stay unknown; strict optional timestamp/categories preserve old hashes and snapshots", () => {
  const old = { ...emptyDelta(at), mcpOutcomes: oldObservation(), total: 123, humans: 27 };
  const digest = deltaCanonicalDigest(old);
  assert.equal(deltaCanonicalDigest(validateDelta(old)), digest);
  assert.equal(Object.hasOwn(validateMcpOutcomes(oldObservation()), "browseObservedFrom"), false);
  const coverage = browseCoverage(oldObservation());
  assert.equal(coverage.observedFrom, null); assert.equal(coverage.coverage, "unknown");
  assert.equal(coverage.counts.unattributed.normal_without_cardinality, 4);
  assert.equal(coverage.historicalCardinality, "unknown_no_backfill");
  const merged = mergeMcpOutcomes(oldObservation(), newObservation());
  assert.equal(merged.observedFrom, at); assert.equal(merged.browseObservedFrom, next);
  const snapshot = { classificationSchemaVersion: 2, mcpToolCallsObservedFrom: at, mcpOutcomes: merged, total: 123 };
  assert.deepEqual(deltaFromV2Snapshot(snapshot).mcpOutcomes, validateMcpOutcomes(merged));
  for (const value of [
    { ...newObservation(), browseObservedFrom: at, observedFrom: next },
    { ...newObservation(), browseObservedFrom: null },
    { ...newObservation(), browseObservedFrom: "2026-02-30T00:00:00.000Z" },
    { observedFrom: at, counts: { [empty]: 1 } },
    { ...newObservation(), counts: { "unattributed|track_taskmarket_task|browse_empty": 1 } },
    { ...newObservation(), counts: { "arbitrary-identity-secret": 1 } },
  ]) assert.throws(() => validateMcpOutcomes(value), /^Error: pulse_invalid_field:mcpOutcomes$/);
});

test("old/new file snapshots survive real process startup without backfill or dropping unrelated counters", () => {
  const dir = mkdtempSync(join(tmpdir(), "root4000-old-snapshot-"));
  try {
    for (const [index, observation] of [oldObservation(), mergeMcpOutcomes(oldObservation(), newObservation())].entries()) {
      const file = join(dir, `${index}.json`);
      writeFileSync(file, JSON.stringify({ classificationSchemaVersion: 2, startedAt: at, mcpToolCallsObservedFrom: at, mcpOutcomes: observation, total: 123, humans: 27 }));
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `const p=await import('./server/lib/pulse.js'); await p.waitForPulseHydration(); p.__pulseTestInternals().stopScheduledFlush(); console.log(JSON.stringify(p.pulseSnapshot()));`], { env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", PULSE_FILE: file }, encoding: "utf8" });
      assert.equal(child.status, 0, child.stderr);
      const snapshot = JSON.parse(child.stdout.trim());
      assert.equal(snapshot.knownGap.snapshotCorrupt, false); assert.equal(snapshot.total, 123); assert.equal(snapshot.humans, 27);
      assert.equal(snapshot.mcpProtocol.outcomes.counts[normal], 4);
      assert.equal(snapshot.mcpProtocol.outcomes.browseResults.observedFrom, index === 0 ? null : next);
      assert.equal(snapshot.mcpProtocol.outcomes.browseResults.counts.unattributed.normal_without_cardinality, index === 0 ? 4 : 3);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mounted browse -> old PostgreSQL rejection/WAL -> additive migration -> recovery/restart and protected summary", async t => {
  pg.requirePostgresBinaries();
  const cluster = pg.startDisposableCluster(); t.after(() => cluster.stop());
  pg.psql(cluster, null, { input: `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT USAGE ON SCHEMA public TO service_role;\n${["0002_pulse_durable.sql", "0003_pulse_mcp_tool_demand.sql", "0006_pulse_admit_declared_mcp_tools.sql", "0007_pulse_mcp_source_outcomes.sql"].map(migration).join("\n")}` });
  const store = createPulseStoreFromTransport(pg.createPsqlPulseTransport(cluster));
  const old = { ...emptyDelta(at), total: 123, humans: 27, mcpOutcomes: oldObservation() };
  const oldId = "d4000000-0000-4000-8000-000000000001";
  await store.flush(oldId, old);
  const hash = pg.psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${oldId}'`);
  const dir = mkdtempSync(join(tmpdir(), "root4000-pg-http-"));
  process.env.PULSE_FILE = join(dir, "startup.json"); process.env.PULSE_TOKEN = "root4000-pg-loopback";
  const pulse = await import("../lib/pulse.js");
  pulse.__pulseTestInternals().stopScheduledFlush();
  const wal = join(dir, "wal.json");
  pulse.configurePulseStoreForTests({ store, fallbackFile: wal }); await pulse.waitForPulseHydration();
  const savedFetch = globalThis.fetch; let tasks = [];
  globalThis.fetch = async url => Response.json(url === "https://api.taskmarket.dev/trpc/network.info" ? networkInfo() : { tasks });
  const { createSdsApp } = await import("../app.js");
  const server = http.createServer(createSdsApp()); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); globalThis.fetch = savedFetch; rmSync(dir, { recursive: true, force: true }); });
  const request = (body, path = "/mcp") => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path, method: body ? "POST" : "GET", headers: { "content-type": "application/json" } }, res => { let raw = ""; res.on("data", chunk => { raw += chunk; }); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(raw) })); }); req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  const body = { jsonrpc: "2.0", id: "raw-identity-secret", method: "tools/call", params: { name: "browse_taskmarket_tasks", arguments: {} } };
  assert.equal((await request(body)).json.result.structuredContent.count, 0);
  tasks = [taskFixture({ chainId: 4217, description: "arbitrary-task-secret" })];
  assert.equal((await request(body)).json.result.structuredContent.tasks[0].asset.symbol, "OUSD");
  pulse.__pulseTestInternals().admitPendingDeltaToWal(); await pulse.__pulseTestInternals().drainPendingFlushes();
  assert.equal(pulse.pulseSnapshot().persistenceFailure.class, "permanent");
  assert.equal(pulse.pulseSnapshot().complete, false);
  const originalWal = readFileSync(wal, "utf8");
  assert.equal(originalWal.includes("arbitrary-task-secret"), false); assert.equal(originalWal.includes("raw-identity-secret"), false);
  const beforeUpgrade = await store.readSnapshot(at);
  assert.equal(beforeUpgrade.total, 123); assert.equal(beforeUpgrade.mcpOutcomes.counts[normal], 4);
  assert.equal(beforeUpgrade.mcpOutcomes.browseObservedFrom, undefined);
  const sql = migration("0008_pulse_browse_result_coverage.sql");
  pg.psql(cluster, null, { input: sql }); pg.psql(cluster, null, { input: sql });
  const afterUpgrade = await store.readSnapshot(at);
  assert.deepEqual({ ...afterUpgrade, observationEnd: null }, { ...beforeUpgrade, observationEnd: null }, "function migration does not rewrite aggregate history");
  assert.equal(pg.psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${oldId}'`), hash);
  assert.equal((await store.flush(oldId, old)).status, "already_applied", "old receipt remains idempotent after upgrade");
  assert.equal(readFileSync(wal, "utf8"), originalWal, "migration does not rename or strip retained deltas");
  pulse.__pulseTestInternals().setPulseNow(() => Date.now() + 1_000_000);
  await pulse.__pulseTestInternals().drainPendingFlushes();
  assert.equal(pulse.pulseSnapshot().complete, true);
  const durable = await store.readSnapshot(at);
  assert.equal(durable.mcpOutcomes.counts[empty], 1); assert.equal(durable.mcpOutcomes.counts[nonEmpty], 1); assert.equal(durable.mcpOutcomes.counts[normal], 6);
  assert.equal(durable.humans, 27); assert.equal(durable.total, 125);
  pulse.configurePulseStoreForTests({ store, fallbackFile: wal }); await pulse.waitForPulseHydration();
  const protectedSummary = await request(null, "/api/pulse?k=root4000-pg-loopback");
  assert.equal(protectedSummary.status, 200);
  const coverage = protectedSummary.json.mcpProtocol.outcomes.browseResults;
  assert.equal(coverage.counts.unattributed.normal_without_cardinality, 4); assert.equal(coverage.complete, false);
  assert.equal(coverage.historicalCardinality, "unknown_no_backfill");
  assert.equal(pg.psqlTuples(cluster, "SELECT has_function_privilege('anon','public.pulse_validate_mcp_outcomes(jsonb)','EXECUTE')::text || '|' || has_function_privilege('authenticated','public.pulse_merge_mcp_outcomes(jsonb,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.pulse_read_snapshot(timestamptz,timestamptz)','EXECUTE')::text;"), "false|false|true");
});
