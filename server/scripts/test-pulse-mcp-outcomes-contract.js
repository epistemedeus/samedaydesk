import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MCP_OUTCOME_EVENTS, MCP_OUTCOME_KEYS, MCP_OUTCOME_TOOLS, MCP_SOURCES,
  declaredMcpSource, mergeMcpOutcomes, validateMcpOutcomes,
} from "../lib/pulse-store/mcp-outcomes.js";
import { deltaCanonicalDigest, deltaIsEmpty, deltaToRpcPayload, emptyDelta, mergeDeltas, validateDelta } from "../lib/pulse-store/schema.js";
import { validateWalState } from "../lib/pulse-store/wal-schema.js";
import { createPulseStoreFromTransport } from "../lib/pulse-store/supabase-adapter.js";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import * as pg from "./helpers/pulse-pg-cluster.js";

const at = "2026-10-22T23:00:00.000Z";
const eventKey = "agentverse-a2a-v1|check_ai_readiness|normal_result";
const observation = () => ({ observedFrom: at, counts: { [eventKey]: 1 } });
const malformed = [
  null, [], {}, { ...observation(), raw: "secret" },
  { ...observation(), counts: { "raw-source-secret": -1 } },
  { ...observation(), observedFrom: "2026-02-30T00:00:00.000Z" },
  { ...observation(), observedFrom: null },
  { ...observation(), observedFrom: "infinity" },
  { ...observation(), observedFrom: "2026-10-22T23:00:00+00:00" },
  { ...observation(), counts: null }, { ...observation(), counts: [] },
  ...[-1, 1.5, true, "1", Number.MAX_SAFE_INTEGER + 1].map(value => ({ ...observation(), counts: { [eventKey]: value } })),
  ...["raw-source|check_ai_readiness|normal_result", "agentverse-a2a-v1|raw-tool|normal_result", "agentverse-a2a-v1|check_ai_readiness|accepted", "__proto__"].map(key => ({ ...observation(), counts: { [key]: 1 } })),
];

test("only the exact fixed source enters the bounded aggregate; arbitrary header shapes are discarded", () => {
  assert.equal(declaredMcpSource({ "x-samedaydesk-agent-source": "agentverse-a2a-v1" }), "agentverse-a2a-v1");
  for (const value of [undefined, null, 12, {}, [], ["agentverse-a2a-v1"], "", "unknown", "Agentverse-a2a-v1", "agentverse-a2a-v1,agentverse-a2a-v1", "x".repeat(10000)]) {
    assert.equal(declaredMcpSource({ "x-samedaydesk-agent-source": value }), "unattributed");
  }
});

test("strict outcome schema admits exactly the static Cartesian product and rejects raw or unsafe values", () => {
  assert.equal(MCP_OUTCOME_KEYS.length, MCP_SOURCES.length * (MCP_TOOL_NAMES.length + 2) * MCP_OUTCOME_EVENTS.length);
  const counts = Object.fromEntries(MCP_OUTCOME_KEYS.map(key => [key, 1]));
  assert.deepEqual({ ...validateMcpOutcomes({ observedFrom: at, counts }).counts }, counts);
  for (const value of malformed) assert.throws(() => validateMcpOutcomes(value), /pulse_invalid_field:mcpOutcomes/);
  const onlyOutcomes = { ...emptyDelta(), mcpOutcomes: observation() };
  assert.equal(deltaIsEmpty(onlyOutcomes), false, "a late result or disconnect flushes even without another HTTP attempt");
  const merged = emptyDelta();
  mergeDeltas(merged, validateDelta(onlyOutcomes));
  assert.equal(merged.mcpOutcomes.counts[eventKey], 1);
  assert.equal(mergeMcpOutcomes(merged.mcpOutcomes, observation()).counts[eventKey], 2);
});

test("old deltas keep their exact wire bytes and digest; old WAL history never gains outcome zeros", () => {
  const old = emptyDelta("2026-09-02T12:00:00.000Z");
  assert.equal(Object.hasOwn(validateDelta(old), "mcpOutcomes"), false);
  const wire = JSON.stringify(deltaToRpcPayload(old));
  assert.equal(createHash("sha256").update(wire).digest("hex"), "d78729593a5d72dfdfc820c1c33997c161b73179b9e38d245d92407a39778e96");
  const before = deltaCanonicalDigest(old);
  const wal = validateWalState({ version: 2, pendingFlushes: [{ flushId: "c3302000-0000-4000-8000-000000000001", createdAt: at, delta: old }] });
  assert.equal(Object.hasOwn(wal.pendingFlushes[0].delta, "mcpOutcomes"), false);
  assert.equal(deltaCanonicalDigest(wal.pendingFlushes[0].delta), before);
});

test("duplicate middleware, producer callback, finish and close listeners each preserve one event", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-duplicate-events-"));
  try {
    process.env.PULSE_FILE = join(dir, "pulse.json");
    const pulse = await import("../lib/pulse.js");
    pulse.__pulseTestInternals().stopScheduledFlush();
    pulse.configurePulseStoreForTests({ store: { configured: false }, fallbackFile: join(dir, "wal.json") });
    await pulse.waitForPulseHydration();
    const req = { method: "POST", path: "/mcp", headers: {}, body: { jsonrpc: "2.0", id: "request-secret", method: "tools/call", params: { name: "check_ai_readiness", arguments: {} } } };
    const res = new EventEmitter(); res.writableFinished = false;
    pulse.pulseMiddleware(req, res, () => {});
    pulse.pulseMiddleware(req, res, () => {});
    const entry = req.mcpAdmission.entries[0];
    const result = { jsonrpc: "2.0", id: "request-secret", result: { isError: true, content: [{ type: "text", text: "body-secret" }] } };
    pulse.recordMcpProduced(req, entry, result);
    pulse.recordMcpProduced(req, entry, result);
    res.writableFinished = true;
    res.emit("finish"); res.emit("finish"); res.emit("close"); res.emit("close");
    const snapshot = pulse.pulseSnapshot();
    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.mcpProtocol.messages, 1);
    const counts = snapshot.mcpProtocol.outcomes.counts;
    for (const event of ["http_request", "response_finished"]) assert.equal(counts[`unattributed|_none|${event}`], 1);
    for (const event of ["tool_attempt", "tool_refusal"]) assert.equal(counts[`unattributed|check_ai_readiness|${event}`], 1);
    assert.equal(Object.keys(counts).length, 4);
    assert.equal(pulse.flushPulseSnapshot(), true);
    assert.equal(readFileSync(join(dir, "wal.json"), "utf8").includes("secret"), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("transport reader validates new dimensions while old snapshots remain compatible", async () => {
  let data = { ...emptyDelta(at) };
  const store = createPulseStoreFromTransport({ async rpc() { return { data, error: null }; } });
  assert.equal(Object.hasOwn(await store.readSnapshot(at), "mcpOutcomes"), false);
  data = { ...data, mcpOutcomes: null };
  assert.equal((await store.readSnapshot(at)).mcpOutcomes, null);
  data = { ...data, mcpOutcomes: observation() };
  assert.equal((await store.readSnapshot(at)).mcpOutcomes.counts[eventKey], 1);
  data = { ...data, mcpOutcomes: { ...observation(), counts: { "raw-source-secret": 1 } } };
  await assert.rejects(store.readSnapshot(at), /pulse_invalid_field:mcpOutcomes/);
});

test("strict durable reader rejects corrupt outcome fields and recovers without promoting a complete zero", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-strict-outcomes-"));
  try {
    const pulse = await import("../lib/pulse.js");
    let corrupt = true;
    const store = {
      configured: true,
      async readSnapshot() { return { ...emptyDelta(at), mcpOutcomes: corrupt ? { ...observation(), counts: { "raw-source-secret": 1 } } : observation(), observationStart: at }; },
    };
    pulse.configurePulseStoreForTests({ store, fallbackFile: join(dir, "wal.json") });
    await pulse.waitForPulseHydration();
    assert.equal(pulse.pulseSnapshot().complete, false);
    assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.coverage, "unknown");
    assert.equal(JSON.stringify(pulse.pulseSnapshot()).includes("raw-source-secret"), false);
    corrupt = false;
    await pulse.__pulseTestInternals().hydrateFromDurableStore();
    assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.counts[eventKey], 1);
    assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.coverage, "lower_bound_from_first_observation");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real PostgreSQL validates the same bounded keys, rejects malformed values atomically and keeps grants", async t => {
  pg.requirePostgresBinaries();
  const cluster = pg.startDisposableCluster(); t.after(() => cluster.stop());
  const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
  const sql = migration("0007_pulse_mcp_source_outcomes.sql");
  const listed = name => [...sql.match(new RegExp(`v_${name} text\\[\\] := array\\[([^\\]]+)\\]`))[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(listed("sources"), [...MCP_SOURCES]);
  assert.deepEqual(new Set(listed("tools")), new Set(MCP_OUTCOME_TOOLS));
  assert.deepEqual(listed("events"), [...MCP_OUTCOME_EVENTS]);
  assert.match(sql, new RegExp(`null,${MCP_OUTCOME_KEYS.length},96`));
  pg.psql(cluster, null, { input: `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT USAGE ON SCHEMA public TO service_role;\n${[
    "0002_pulse_durable.sql", "0003_pulse_mcp_tool_demand.sql", "0006_pulse_admit_declared_mcp_tools.sql", "0007_pulse_mcp_source_outcomes.sql",
  ].map(migration).join("\n")}` });
  const store = createPulseStoreFromTransport(pg.createPsqlPulseTransport(cluster));
  const delta = { ...emptyDelta(at), mcpOutcomes: { observedFrom: at, counts: Object.fromEntries(MCP_OUTCOME_KEYS.map(key => [key, 1])) } };
  const validId = "d3302000-0000-4000-8000-000000000001";
  assert.equal((await store.flush(validId, delta)).status, "applied");
  assert.deepEqual({ ...((await store.readSnapshot(at)).mcpOutcomes.counts) }, delta.mcpOutcomes.counts);
  for (const [index, value] of malformed.entries()) {
    const bad = JSON.stringify({ ...emptyDelta(at), mcpOutcomes: value }).replace(/'/g, "''");
    const result = pg.run(pg.PSQL, ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE service_role; SELECT public.pulse_apply_delta('d3302000-0000-4000-8000-${String(index + 2).padStart(12, "0")}', '${bad}'::jsonb);`], cluster.env);
    assert.notEqual(result.status, 0, `malformed case ${index} must fail`);
    assert.match(result.stderr, /pulse_invalid_field:mcpOutcomes/);
    assert.equal(result.stderr.includes("raw-source-secret"), false, "refusals must not echo raw keys");
  }
  assert.equal(pg.psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"), "1");
  assert.deepEqual({ ...((await store.readSnapshot(at)).mcpOutcomes.counts) }, delta.mcpOutcomes.counts);
  const grants = pg.psqlTuples(cluster, "SELECT has_function_privilege('anon','public.pulse_validate_mcp_outcomes(jsonb)','EXECUTE')::text || '|' || has_function_privilege('authenticated','public.pulse_merge_mcp_outcomes(jsonb,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.pulse_read_snapshot(timestamptz,timestamptz)','EXECUTE')::text;");
  assert.equal(grants, "false|false|true");
});
