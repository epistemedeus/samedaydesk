import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import * as pg from "./helpers/pulse-pg-cluster.js";
import { mountRefusalFixture } from "./helpers/mcp-refusal-fixture.js";
import { createFileFallbackStore, createPulseStoreFromTransport } from "../lib/pulse-store/index.js";
import { emptyDelta, deltaCanonicalDigest } from "../lib/pulse-store/schema.js";
import { networkInfo } from "./helpers/taskmarket-fixtures.js";

const at = "2026-10-24T00:00:00.000Z";
const key = (tool, reason) => `unattributed|${tool}|refusal_${reason}`;
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
const call = (name = "check_ai_readiness", args = {}) => rpc("tools/call", { name, arguments: args });
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("mounted MCP -> old PG rejection -> exact queued-WAL migration/retry -> durable protected summary and fresh-process recovery", async t => {
  pg.requirePostgresBinaries();
  const cluster = pg.startDisposableCluster(); t.after(() => cluster.stop());
  pg.psql(cluster, null, { input: `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT USAGE ON SCHEMA public TO service_role;\n${[
    "0002_pulse_durable.sql", "0003_pulse_mcp_tool_demand.sql", "0006_pulse_admit_declared_mcp_tools.sql", "0007_pulse_mcp_source_outcomes.sql", "0008_pulse_browse_result_coverage.sql",
  ].map(migration).join("\n")}` });
  const transport = pg.createPsqlPulseTransport(cluster);
  const db = createPulseStoreFromTransport(transport);
  const oldDelta = { ...emptyDelta(at), total: 123, humans: 27, mcpOutcomes: { observedFrom: at, counts: { "unattributed|_none|protocol_error": 6 } } };
  const oldId = "d5950000-0000-4000-8000-000000000001";
  await db.flush(oldId, oldDelta);
  const receipts = () => pg.psqlTuples(cluster, "SELECT flush_id::text || ':' || delta_hash FROM public.pulse_flush_receipts ORDER BY flush_id");
  const originalReceipts = receipts();
  const f = await mountRefusalFixture(t, { store: db });
  const oldSnapshot = await db.readSnapshot(at);
  assert.equal((await f.summary()).mcpProtocol.outcomes.refusals.coverage, "unknown");
  assert.equal((await f.summary()).mcpProtocol.outcomes.refusals.withoutReason.unattributed, 6);
  await f.request(rpc("tools/list"), { "mcp-protocol-version": "unsupported-secret" });
  await f.request({ invalid: "input-secret" });
  await f.request(call());
  await f.drain();
  assert.equal(f.fallback.loadPendingFlushes().length, 1);
  const retained = f.fallback.loadPendingFlushes()[0];
  const queuedBytes = JSON.stringify(retained), digest = deltaCanonicalDigest(retained.delta);
  assert.equal(f.pulse.pulseSnapshot().persistenceFailure.class, "permanent");
  assert.equal(f.pulse.pulseSnapshot().complete, false);
  assert.equal(receipts(), originalReceipts, "old schema refusal is atomic");
  assert.equal((await db.readSnapshot(at)).total, 123);
  await f.drain();
  assert.equal(JSON.stringify(f.fallback.loadPendingFlushes()[0]), queuedBytes, "permanent backoff preserves the original queued payload");
  const sql = migration("0009_pulse_mcp_refusal_reasons.sql");
  pg.psql(cluster, null, { input: sql }); pg.psql(cluster, null, { input: sql });
  pg.psql(cluster, null, { input: readFileSync(new URL("../../supabase/verify/0009_pulse_mcp_refusal_reasons.sql", import.meta.url), "utf8") });
  const migrated = await db.readSnapshot(at);
  assert.deepEqual({ ...migrated, observationEnd: null }, { ...oldSnapshot, observationEnd: null }, "migration does not rewrite history");
  assert.equal(receipts(), originalReceipts);
  assert.equal((await db.flush(oldId, oldDelta)).status, "already_applied");
  assert.equal((await db.flush("d5950000-0000-4000-8000-000000000002", { ...emptyDelta(at), total: 1, mcpProtocolRequests: 1 })).status, "applied", "a fresh old-producer payload still applies after upgrade");
  assert.equal(JSON.stringify(f.fallback.loadPendingFlushes()[0]), queuedBytes);
  f.pulse.__pulseTestInternals().setPulseNow(() => Date.now() + 4_000_000);
  await f.drain();
  assert.equal(f.fallback.loadPendingFlushes().length, 0);
  assert.equal(deltaCanonicalDigest(retained.delta), digest);
  assert.equal((await db.flush(retained.flushId, retained.delta)).status, "already_applied");
  let summary = await f.summary();
  assert.equal(summary.total, 127); assert.equal(summary.humans, 27); assert.equal(summary.complete, true);
  for (const [tool, reason] of [["_none", "unsupported_protocol"], ["_none", "invalid_request"], ["check_ai_readiness", "tool_input"]]) assert.equal(summary.mcpProtocol.outcomes.counts[key(tool, reason)], 1);
  assert.equal(summary.mcpProtocol.outcomes.refusals.withoutReason.unattributed, 6);

  // Other genuine decisions and a healthy result use the same real DB path.
  await f.request([]);
  await f.request([rpc("ping")], { "mcp-protocol-version": "2025-11-25" });
  await f.request('{"malformed-secret":');
  await f.request(call("check_ai_readiness", { url: [] }));
  await f.request(call("unknown-tool-secret"));
  await f.request(rpc("unknown-method-secret"));
  assert.equal((await f.request(rpc("tools/list"))).status, 200);
  const notification = call(); delete notification.id;
  assert.equal((await f.request(notification)).status, 202);
  const originalFetch = globalThis.fetch;
  let upstreamFailure = false;
  globalThis.fetch = async url => {
    if (upstreamFailure) throw new Error("upstream-error-secret");
    return Response.json(url === "https://api.taskmarket.dev/trpc/network.info" ? networkInfo() : { tasks: [] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const healthy = await f.request(call("browse_taskmarket_tasks"));
  assert.equal(healthy.json.result.isError, undefined);
  assert.equal(healthy.json.result.structuredContent.count, 0, "an empty inventory is a useful normal negative, not a failure");
  upstreamFailure = true;
  assert.equal((await f.request(call("browse_taskmarket_tasks"))).json.result.isError, true);
  const { fixPackLicenseDeps } = await import("../lib/fixpack-license.js");
  const originalConfigured = fixPackLicenseDeps.isConfigured;
  fixPackLicenseDeps.isConfigured = () => { throw new Error("handler-error-secret"); };
  try {
    assert.equal((await f.request(call("generate_complete_fix_pack", { url: "https://fixture.example", license: "cs_fixture" }))).json.error.code, -32603);
  } finally { fixPackLicenseDeps.isConfigured = originalConfigured; }
  await f.drain();
  summary = await f.summary();
  for (const [tool, reason] of [["_none", "batch_size"], ["_none", "batch_protocol"], ["_none", "malformed_json"], ["_unknown", "invalid_params"], ["_unknown", "unknown_tool"], ["_none", "unknown_method"]]) assert.equal(summary.mcpProtocol.outcomes.counts[key(tool, reason)], 1);
  assert.equal(summary.mcpProtocol.outcomes.counts[key("check_ai_readiness", "tool_input")], 2);
  assert.equal(summary.mcpProtocol.outcomes.counts[key("browse_taskmarket_tasks", "tool_error")], 1);
  assert.equal(summary.mcpProtocol.outcomes.counts[key("generate_complete_fix_pack", "handler_error")], 1);
  assert.equal(summary.mcpProtocol.outcomes.counts["unattributed|browse_taskmarket_tasks|normal_result"], 1);
  assert.equal(summary.mcpProtocol.outcomes.browseResults.counts.unattributed.browse_empty, 1);

  // An ambiguous transport failure applies once; a fresh process must reconcile
  // that exact pending ID rather than rerunning the MCP tool or renaming a delta.
  let failAfterApply = true;
  const ambiguous = createPulseStoreFromTransport({ async rpc(fn, args) {
    const result = await transport.rpc(fn, args);
    if (fn === "pulse_apply_delta" && failAfterApply && !result.error) { failAfterApply = false; return { data: null, error: { message: "fixture transport loss", code: "network_timeout" } }; }
    return result;
  } });
  f.pulse.configurePulseStoreForTests({ store: ambiguous, fileFallback: f.fallback }); await f.pulse.waitForPulseHydration();
  await f.request(call()); await f.drain();
  assert.equal(f.pulse.pulseSnapshot().persistenceFailure.class, "transient");
  const ambiguousEntry = f.fallback.loadPendingFlushes()[0];
  assert.ok(ambiguousEntry);
  const beforeRecovery = await db.readSnapshot(at);
  const script = `
    const pulse = await import(${JSON.stringify(new URL("../lib/pulse.js", import.meta.url).href)});
    const {createPulseStoreFromTransport} = await import(${JSON.stringify(new URL("../lib/pulse-store/index.js", import.meta.url).href)});
    const {createPsqlPulseTransport} = await import(${JSON.stringify(new URL("./helpers/pulse-pg-cluster.js", import.meta.url).href)});
    pulse.__pulseTestInternals().stopScheduledFlush();
    pulse.configurePulseStoreForTests({store:createPulseStoreFromTransport(createPsqlPulseTransport(${JSON.stringify({ env: cluster.env })})),fallbackFile:${JSON.stringify(f.wal)}});
    await pulse.waitForPulseHydration(); console.log(JSON.stringify(pulse.pulseSnapshot()));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, PULSE_FILE: `${f.dir}/restart.json`, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const recovered = JSON.parse(child.stdout);
  assert.equal(recovered.complete, true); assert.equal(recovered.total, beforeRecovery.total);
  assert.deepEqual(recovered.mcpProtocol.outcomes.counts, { ...beforeRecovery.mcpOutcomes.counts });
  assert.equal(createFileFallbackStore(f.wal).loadPendingFlushes().length, 0);
  assert.equal((await db.flush(ambiguousEntry.flushId, ambiguousEntry.delta)).status, "already_applied");
  const changed = { ...ambiguousEntry.delta, total: ambiguousEntry.delta.total + 1 };
  await assert.rejects(db.flush(ambiguousEntry.flushId, changed), /pulse_flush_id_conflict/);
  assert.equal((await db.readSnapshot(at)).total, recovered.total);

  // SQL independently rejects fields/categories rather than trusting JS only.
  const outcomes = { observedFrom: at, refusalObservedFrom: at, counts: { [key("_none", "unknown")]: 1 } };
  const bad = [
    { ...outcomes, refusalObservedFrom: null }, { ...outcomes, refusalObservedFrom: "2026-02-30T00:00:00.000Z" },
    { ...outcomes, refusalObservedFrom: "2026-10-24T00:00:00+00:00" },
    { ...outcomes, raw: "input-secret" }, { ...outcomes, counts: { "unattributed|_none|refusal_raw-secret": 1 } },
    { ...outcomes, counts: { [key("_none", "unknown")]: -1 } }, { ...outcomes, counts: { [key("_none", "unknown")]: Number.MAX_SAFE_INTEGER + 1 } },
  ];
  const beforeBad = receipts();
  for (const [index, value] of bad.entries()) {
    const payload = JSON.stringify({ ...emptyDelta(at), mcpOutcomes: value }).replace(/'/g, "''");
    const result = pg.run(pg.PSQL, ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE service_role; SELECT public.pulse_apply_delta('d5950000-0000-4000-8000-${String(index + 100).padStart(12, "0")}', '${payload}'::jsonb);`], cluster.env);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /pulse_invalid_field:mcpOutcomes/);
    assert.equal(result.stderr.includes("raw-secret"), false); assert.equal(result.stderr.includes("input-secret"), false);
  }
  assert.equal(receipts(), beforeBad);
  assert.equal(pg.psqlTuples(cluster, "SELECT has_function_privilege('anon','public.pulse_read_snapshot(timestamptz,timestamptz)','EXECUTE')::text || '|' || has_function_privilege('authenticated','public.pulse_apply_delta(uuid,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.pulse_read_snapshot(timestamptz,timestamptz)','EXECUTE')::text;"), "false|false|true");
  const stored = pg.psqlTuples(cluster, "SELECT mcp_outcomes::text FROM public.pulse_aggregate WHERE classification_schema_version=2;") + readFileSync(f.wal, "utf8");
  for (const raw of ["input-secret", "malformed-secret", "unknown-method-secret", "unknown-tool-secret", "upstream-error-secret", "handler-error-secret"]) assert.equal(stored.includes(raw), false);
});
