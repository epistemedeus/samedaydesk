import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import test, { before, after } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "mcp-source-outcomes-"));
process.env.PULSE_FILE = join(dir, "pulse.json");
process.env.PULSE_TOKEN = "loopback-test-token";
const { createSdsApp } = await import("../app.js");
const pulse = await import("../lib/pulse.js");
const { createFileFallbackStore, createPulseStoreFromTransport } = await import("../lib/pulse-store/index.js");
const { createFakePulseAuthority, createFakeRpcTransport } = await import("./helpers/fake-pulse-authority.js");
const { fixPackLicenseDeps } = await import("../lib/fixpack-license.js");
const saved = { fetch: globalThis.fetch, lookup: dns.lookup, ...fixPackLicenseDeps };
const source = "agentverse-a2a-v1";
const key = (tool, event, label = source) => `${label}|${tool}|${event}`;
let server, port, authority, store, fallback, requests;
let failSite = false;
let delayedSite = null;
let siteEntered = null;
const call = (name = "check_ai_readiness", args = { url: "https://fixture.example/private-url-secret" }, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

function request(body, headers = {}, path = "/mcp", method = "POST") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: { "content-type": "application/json", ...headers } }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, raw, json: raw ? JSON.parse(raw) : null, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}
async function summary() {
  assert.equal((await request(undefined, {}, "/api/pulse", "GET")).status, 404);
  const result = await request(undefined, {}, "/api/pulse?k=loopback-test-token", "GET");
  assert.equal(result.status, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  return result.json;
}
async function drain() {
  pulse.__pulseTestInternals().admitPendingDeltaToWal();
  await pulse.__pulseTestInternals().drainPendingFlushes();
}
async function reset() {
  authority = createFakePulseAuthority();
  store = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  fallback = createFileFallbackStore(join(dir, `${requests++}.wal.json`));
  pulse.configurePulseStoreForTests({ store, fileFallback: fallback });
  await pulse.waitForPulseHydration();
}
async function adapter(selection) {
  assert.ok(process.env.ROOT3302_ADAPTER_CHECKOUT, "set ROOT3302_ADAPTER_CHECKOUT to the exact companion checkout");
  assert.ok(process.env.ROOT3302_PYTHON, "set ROOT3302_PYTHON to its isolated compatible environment");
  const cwd = join(process.env.ROOT3302_ADAPTER_CHECKOUT, "integrations/agentverse-a2a");
  const child = spawn(process.env.ROOT3302_PYTHON, ["tests/apex_loopback.py", `http://127.0.0.1:${port}/mcp`, JSON.stringify(selection)], {
    cwd, env: { ...process.env, PYTHONPATH: cwd, AGENTVERSE_A2A_SKIP_PRODUCTION_APP: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, stderr);
  return JSON.parse(stdout);
}

before(async () => {
  requests = 0;
  dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  globalThis.fetch = async () => {
    siteEntered?.();
    if (delayedSite) await delayedSite;
    if (failSite) throw new Error("private upstream failure-secret");
    return new Response('<title>response-body-secret</title><meta name="description" content="A controlled local readiness fixture"><h1>Fixture</h1>', { status: 200 });
  };
  server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  pulse.__pulseTestInternals().stopScheduledFlush();
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = saved.fetch;
  dns.lookup = saved.lookup;
  fixPackLicenseDeps.isConfigured = saved.isConfigured;
  rmSync(dir, { recursive: true, force: true });
});

test("actual Python adapter -> mounted apex -> persisted Pulse -> protected summary", async () => {
  await reset();
  const result = await adapter({ kind: "free-tool", tool: "check_ai_readiness", arguments: { url: "https://fixture.example" } });
  assert.equal(result.kind, "free-tool");
  assert.ok(result.structuredContent.score < 100, "a negative readiness finding is still a normal tool result");
  assert.equal(result.cash, 0);
  assert.equal(result.paymentInferred, false);
  await drain();
  const snapshot = await summary();
  assert.equal(snapshot.mcpProtocol.httpRequests, 1);
  assert.equal(snapshot.mcpProtocol.toolCallsByName.counts.check_ai_readiness, 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("check_ai_readiness", "normal_result")], 1);
  const durable = await authority.readSnapshot(new Date().toISOString());
  assert.equal(durable.mcpOutcomes.counts[key("check_ai_readiness", "tool_attempt")], 1);
  assert.equal(durable.mcpOutcomes.counts[key("_none", "http_request")], 1);
  assert.equal(durable.mcpOutcomes.counts[key("_none", "response_finished")], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.complete, false);
  assert.equal(snapshot.mcpProtocol.outcomes.callerAcceptance, "unobserved");
  assert.equal(snapshot.mcpProtocol.outcomes.revenue, "unobserved");
  assert.equal(snapshot.mcpProtocol.outcomes.historicalSourceAndOutcomes, "unknown_no_backfill");
  assert.match(snapshot.mcpProtocol.outcomes.meaning, /spoofable/);
  await drain();
  assert.deepEqual((await authority.readSnapshot(new Date().toISOString())).mcpOutcomes, durable.mcpOutcomes);
});

test("adapter free refusal and upstream failure recover on the same mounted path", async () => {
  await reset();
  failSite = true;
  const failed = await adapter({ kind: "free-tool", tool: "check_ai_readiness", arguments: { url: "https://failure.example" } });
  assert.equal(failed.reason, "tool_refused");
  failSite = false;
  const healthy = await adapter({ kind: "free-tool", tool: "check_ai_readiness", arguments: { url: "https://recovered.example" } });
  assert.equal(healthy.kind, "free-tool");
  await drain();
  const counts = (await summary()).mcpProtocol.outcomes.counts;
  assert.equal(counts[key("check_ai_readiness", "tool_attempt")], 2);
  assert.equal(counts[key("check_ai_readiness", "tool_refusal")], 1);
  assert.equal(counts[key("check_ai_readiness", "normal_result")], 1);
});

test("missing, arbitrary, duplicate, malformed and spoofed source stay bounded with unchanged output", async () => {
  await reset();
  const headers = [ {}, { "x-samedaydesk-agent-source": "raw-source-secret" },
    { "x-samedaydesk-agent-source": "agentverse-a2a-v1, raw-source-secret" },
    { "x-samedaydesk-agent-source": "AGENTVERSE-A2A-V1" },
    { "x-samedaydesk-agent-source": ["agentverse-a2a-v1", "agentverse-a2a-v1"] },
    { "x-samedaydesk-agent-source": source },
  ];
  const bodies = [];
  for (const header of headers) bodies.push((await request(call("check_ai_readiness", {}), header)).json);
  for (const body of bodies) assert.deepEqual(body, bodies[0]);
  assert.equal(bodies[0].result.isError, true);
  await drain();
  const counts = (await summary()).mcpProtocol.outcomes.counts;
  assert.equal(counts[key("check_ai_readiness", "tool_refusal", "unattributed")], 5);
  assert.equal(counts[key("check_ai_readiness", "tool_refusal")], 1, "a direct caller can spoof the recognized label");
  assert.ok(Object.keys(counts).every(k => /^(unattributed|agentverse-a2a-v1)\|/.test(k)));
  const wal = readFileSync(join(dir, `${requests - 1}.wal.json`), "utf8");
  const retained = wal + JSON.stringify(await summary()) + JSON.stringify(await authority.readSnapshot(new Date().toISOString()));
  for (const secret of ["raw-source-secret", "private-url-secret", "failure-secret"]) assert.equal(retained.includes(secret), false);
});

test("real requests and returned bodies leave no raw data in WAL, durable aggregate or summary", async () => {
  await reset();
  const result = await request(call("check_ai_readiness", {
    url: "https://fixture.example/private-url-secret?token=argument-secret",
    prompt: "prompt-secret", wallet: "wallet-secret",
  }, "request-id-secret"), {
    "x-samedaydesk-agent-source": "raw-source-secret",
    authorization: "Bearer header-secret", "x-forwarded-for": "192.0.2.44",
    "user-agent": "useragent-secret",
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.id, "request-id-secret");
  assert.equal(result.json.result.isError, undefined);
  assert.ok(result.raw.includes("response-body-secret"));
  assert.ok(result.raw.includes("private-url-secret"));
  // Check the queued payload itself, then the durable reader and protected view.
  pulse.__pulseTestInternals().admitPendingDeltaToWal();
  const rawWal = readFileSync(join(dir, `${requests - 1}.wal.json`), "utf8");
  await pulse.__pulseTestInternals().drainPendingFlushes();
  const retained = rawWal + JSON.stringify(await authority.readSnapshot(new Date().toISOString())) + JSON.stringify(await summary());
  for (const value of ["private-url-secret", "argument-secret", "prompt-secret", "wallet-secret", "request-id-secret", "raw-source-secret", "header-secret", "192.0.2.44", "useragent-secret", "response-body-secret"]) {
    assert.equal(retained.includes(value), false, value);
  }
});

test("mixed batch, invalid params, protocol/parser error, notification and non-tool replies count at their own boundaries", async () => {
  await reset();
  const notification = call("check_ai_readiness", {}); delete notification.id;
  const batch = await request([
    call("check_ai_readiness", {}), call("check_ai_readiness", { url: [] }, 2),
    call("not-a-tool-secret", {}, 3), notification,
    { jsonrpc: "2.0", id: 5, method: "ping" }, { invalid: "body-secret" },
    { jsonrpc: "2.0", id: 6, result: {} },
  ]);
  assert.equal(batch.status, 200);
  assert.equal(batch.json.length, 5);
  assert.equal(batch.json[1].error.code, -32602);
  assert.equal(batch.json[2].error.code, -32602);
  assert.equal(batch.json[4].error.code, -32600);
  assert.equal((await request('{"invalid JSON')).json.error.code, -32700);
  assert.equal((await request(call(), { "mcp-protocol-version": "unsupported-secret" })).status, 400);
  await drain();
  const snapshot = await summary();
  const counts = snapshot.mcpProtocol.outcomes.counts;
  assert.equal(snapshot.mcpProtocol.httpRequests, 3);
  assert.equal(counts[key("_none", "http_request", "unattributed")], 3);
  assert.equal(counts[key("check_ai_readiness", "tool_attempt", "unattributed")], 2);
  assert.equal(counts[key("_unknown", "tool_attempt", "unattributed")], 1);
  assert.equal(counts[key("check_ai_readiness", "tool_refusal", "unattributed")], 2);
  assert.equal(counts[key("check_ai_readiness", "notification_completed", "unattributed")], 1);
  assert.equal(counts[key("_unknown", "protocol_error", "unattributed")], 2);
  assert.equal(counts[key("_none", "protocol_error", "unattributed")], 3);
  assert.equal(snapshot.humans, 0);
});

test("thrown handler produces a JSON-RPC error and subsequent free work recovers", async () => {
  await reset();
  fixPackLicenseDeps.isConfigured = () => { throw new Error("handler-secret"); };
  const failed = await request(call("generate_complete_fix_pack", { url: "https://fixture.example", license: "cs_fixture" }));
  fixPackLicenseDeps.isConfigured = saved.isConfigured;
  assert.equal(failed.json.error.code, -32603);
  assert.equal((await request(call("check_ai_readiness", {}))).json.result.isError, true);
  await drain();
  const counts = (await summary()).mcpProtocol.outcomes.counts;
  assert.equal(counts[key("generate_complete_fix_pack", "protocol_error", "unattributed")], 1);
  assert.equal(counts[key("check_ai_readiness", "tool_refusal", "unattributed")], 1);
  assert.equal(JSON.stringify(counts).includes("handler-secret"), false);
});

test("real disconnect before handler completion records production separately from local finish", async () => {
  await reset();
  let release;
  delayedSite = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { siteEntered = resolve; });
  const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { "content-type": "application/json" } });
  req.on("error", () => {});
  req.end(JSON.stringify(call()));
  await entered;
  req.destroy();
  await new Promise(resolve => setTimeout(resolve, 20));
  release(); delayedSite = null; siteEntered = null;
  for (let i = 0; i < 50 && !pulse.pulseSnapshot().mcpProtocol.outcomes.counts[key("check_ai_readiness", "normal_result", "unattributed")]; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await drain();
  const outcome = (await summary()).mcpProtocol.outcomes;
  assert.equal(outcome.counts[key("_none", "disconnected", "unattributed")], 1);
  assert.equal(outcome.counts[key("_none", "response_finished", "unattributed")], undefined);
  assert.equal(outcome.counts[key("check_ai_readiness", "normal_result", "unattributed")], 1);
  assert.equal(outcome.callerAcceptance, "unobserved");
});

test("ambiguous flush failure, duplicate replay and process-state restart preserve the new dimension", async () => {
  await reset();
  const flaky = createPulseStoreFromTransport(createFakeRpcTransport(authority, { applyThenError: true }));
  pulse.configurePulseStoreForTests({ store: flaky, fileFallback: fallback });
  await pulse.waitForPulseHydration();
  await request(call("check_ai_readiness", {}), { "x-samedaydesk-agent-source": source });
  await drain();
  assert.equal(fallback.loadPendingFlushes().length, 1);
  const retained = fallback.loadPendingFlushes()[0];
  assert.equal(retained.delta.mcpOutcomes.counts[key("check_ai_readiness", "tool_refusal")], 1);
  assert.equal(pulse.pulseSnapshot().complete, false);
  assert.equal(pulse.pulseSnapshot().persistenceFailure.class, "transient");
  // Recreate the local store and Pulse process state against the same authority.
  const disk = createFileFallbackStore(join(dir, `${requests - 1}.wal.json`));
  pulse.configurePulseStoreForTests({ store, fileFallback: disk });
  await pulse.waitForPulseHydration();
  assert.equal(disk.loadPendingFlushes().length, 0);
  assert.equal(pulse.pulseSnapshot().complete, true);
  assert.equal(pulse.pulseSnapshot().total, 1);
  assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.counts[key("check_ai_readiness", "tool_refusal")], 1);
  assert.equal((await store.flush(retained.flushId, retained.delta)).status, "already_applied");
  assert.equal((await authority.readSnapshot(new Date().toISOString())).total, 1);
});

test("failed file write retains in-memory outcomes and recovers into the existing WAL", async () => {
  await reset();
  const { atomicWriteJson } = await import("../lib/pulse-store/atomic-write.js");
  let fail = true;
  const disk = createFileFallbackStore(join(dir, "failed-write.wal.json"), { writeJson: (file, value) => {
    if (fail && value.pendingFlushes.length) return false;
    return atomicWriteJson(file, value);
  } });
  pulse.configurePulseStoreForTests({ store: { configured: false }, fileFallback: disk });
  await pulse.waitForPulseHydration();
  await request(call("check_ai_readiness", {}));
  assert.equal(pulse.flushPulseSnapshot(), false);
  assert.equal(pulse.pulseSnapshot().knownGap.walWritePending, true);
  assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.counts[key("check_ai_readiness", "tool_refusal", "unattributed")], 1);
  fail = false;
  assert.equal(pulse.flushPulseSnapshot(), true);
  assert.equal(disk.loadPendingFlushes().length, 1);
  pulse.configurePulseStoreForTests({ store, fileFallback: createFileFallbackStore(join(dir, "failed-write.wal.json")) });
  await pulse.waitForPulseHydration();
  assert.equal(pulse.pulseSnapshot().total, 1);
  assert.equal(pulse.pulseSnapshot().complete, true);
  assert.equal(pulse.pulseSnapshot().mcpProtocol.outcomes.counts[key("check_ai_readiness", "tool_refusal", "unattributed")], 1);
});

test("real disposable PostgreSQL old schema refusal -> migration -> exact WAL recovery and restart", async t => {
  const pg = await import("./helpers/pulse-pg-cluster.js");
  pg.requirePostgresBinaries();
  const cluster = pg.startDisposableCluster();
  t.after(() => cluster.stop());
  const sql = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
  pg.psql(cluster, null, { input: `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT USAGE ON SCHEMA public TO service_role;\n${[
    "0002_pulse_durable.sql", "0003_pulse_mcp_tool_demand.sql", "0005_pulse_admit_declared_mcp_tools.sql", "0006_pulse_admit_declared_mcp_tools.sql",
  ].map(sql).join("\n")}` });
  const { emptyDelta } = await import("../lib/pulse-store/schema.js");
  const db = createPulseStoreFromTransport(pg.createPsqlPulseTransport(cluster));
  const legacyDelta = { ...emptyDelta(), total: 9, humans: 9 };
  const legacyId = "b3302000-0000-4000-8000-000000000001";
  await db.flush(legacyId, legacyDelta);
  const receipt = () => pg.psqlTuples(cluster, `SELECT delta_hash FROM public.pulse_flush_receipts WHERE flush_id='${legacyId}';`);
  const legacyHash = receipt();
  fallback = createFileFallbackStore(join(dir, "real-db.wal.json"));
  pulse.configurePulseStoreForTests({ store: db, fileFallback: fallback });
  await pulse.waitForPulseHydration();
  let snapshot = await summary();
  assert.equal(snapshot.total, 9);
  assert.equal(snapshot.mcpProtocol.outcomes.coverage, "unknown");
  assert.equal(snapshot.mcpProtocol.outcomes.durableSchemaSupported, false);
  await adapter({ kind: "free-tool", tool: "check_ai_readiness", arguments: { url: "https://fixture.example" } });
  await drain();
  assert.equal(fallback.loadPendingFlushes().length, 1);
  const retained = fallback.loadPendingFlushes()[0];
  const bytesBefore = JSON.stringify(retained);
  assert.equal(pulse.pulseSnapshot().persistenceFailure.class, "permanent");
  assert.equal(pulse.pulseSnapshot().complete, false);
  assert.equal(pg.psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"), "1");
  const migration = sql("0007_pulse_mcp_source_outcomes.sql");
  pg.psql(cluster, null, { input: migration });
  pg.psql(cluster, null, { input: migration });
  assert.equal(receipt(), legacyHash);
  assert.equal((await db.flush(legacyId, legacyDelta)).status, "already_applied", "old receipt hash is unchanged");
  assert.equal(pg.psqlTuples(cluster, "SELECT mcp_outcomes IS NULL FROM public.pulse_aggregate WHERE classification_schema_version=2;"), "t", "migration invents no history");
  assert.equal(JSON.stringify(fallback.loadPendingFlushes()[0]), bytesBefore);
  pulse.__pulseTestInternals().setPulseNow(() => Date.now() + 4_000_000);
  await drain();
  assert.equal(fallback.loadPendingFlushes().length, 0);
  snapshot = await summary();
  assert.equal(snapshot.total, 10);
  assert.equal(snapshot.humans, 9);
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.mcpProtocol.outcomes.durableSchemaSupported, true);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("check_ai_readiness", "normal_result")], 1);
  assert.equal((await db.flush(retained.flushId, retained.delta)).status, "already_applied");
  pulse.configurePulseStoreForTests({ store: db, fileFallback: createFileFallbackStore(join(dir, "real-db.wal.json")) });
  await pulse.waitForPulseHydration();
  assert.equal(pulse.pulseSnapshot().total, 10);
  assert.deepEqual(pulse.pulseSnapshot().mcpProtocol.outcomes.counts, snapshot.mcpProtocol.outcomes.counts);
  assert.equal(pg.psqlTuples(cluster, "SELECT count(*) FROM public.pulse_flush_receipts;"), "2");
  const moduleUrl = relative => new URL(relative, import.meta.url).href;
  const childScript = `
    const pulse = await import(${JSON.stringify(moduleUrl("../lib/pulse.js"))});
    const { createPulseStoreFromTransport } = await import(${JSON.stringify(moduleUrl("../lib/pulse-store/index.js"))});
    const { createPsqlPulseTransport } = await import(${JSON.stringify(moduleUrl("./helpers/pulse-pg-cluster.js"))});
    pulse.configurePulseStoreForTests({store:createPulseStoreFromTransport(createPsqlPulseTransport(${JSON.stringify({env:cluster.env})})),fallbackFile:${JSON.stringify(join(dir, "real-db.wal.json"))}});
    await pulse.waitForPulseHydration();
    pulse.__pulseTestInternals().stopScheduledFlush();
    console.log(JSON.stringify(pulse.pulseSnapshot()));
  `;
  const fresh = spawnSync(process.execPath, ["--input-type=module", "-e", childScript], {
    env: { ...process.env, PULSE_FILE: join(dir, "fresh-process.json"), SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }, encoding: "utf8",
  });
  assert.equal(fresh.status, 0, fresh.stderr);
  const restarted = JSON.parse(fresh.stdout);
  assert.equal(restarted.total, 10);
  assert.equal(restarted.complete, true);
  assert.deepEqual(restarted.mcpProtocol.outcomes.counts, snapshot.mcpProtocol.outcomes.counts);
  // New dimension remains bounded and service-role protected at the real DB.
  for (const role of ["anon", "authenticated"]) {
    const denied = pg.run(pg.PSQL, ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SET ROLE ${role}; SELECT public.pulse_read_snapshot(now());`], cluster.env);
    assert.notEqual(denied.status, 0);
  }
});
