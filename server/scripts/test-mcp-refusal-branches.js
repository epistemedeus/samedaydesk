import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import test from "node:test";
import express from "express";
import { loopbackRequest, mountRefusalFixture } from "./helpers/mcp-refusal-fixture.js";

const key = (tool, reason, source = "unattributed") => `${source}|${tool}|refusal_${reason}`;
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
const call = (name = "check_ai_readiness", args = {}, id = 1) => rpc("tools/call", { name, arguments: args }, id);
const notify = message => { const copy = { ...message }; delete copy.id; return copy; };
const source = { "x-samedaydesk-agent-source": "agentverse-a2a-v1" };

test("distinct parser/admission/handler branches, batch boundaries and suppressed replies retain their semantics", async t => {
  const f = await mountRefusalFixture(t);
  const check = async (body, headers, status, code, tool, reason) => {
    const result = await f.request(body, headers);
    assert.equal(result.status, status);
    if (code) assert.equal(result.json.error.code, code);
    assert.equal((await f.summary()).mcpProtocol.outcomes.counts[key(tool, reason)], 1, reason);
    return result;
  };
  await check([], {}, 400, -32600, "_none", "batch_size");
  assert.equal((await f.request(Array.from({ length: 26 }, () => rpc("ping")))).status, 400);
  await check([rpc("ping")], { "mcp-protocol-version": "2025-11-25" }, 400, -32600, "_none", "batch_protocol");
  await check('{"raw-secret":', {}, 400, -32700, "_none", "malformed_json");
  await check(JSON.stringify({ raw: "x".repeat(1_048_577) }), {}, 413, -32000, "_none", "body_limit");
  await check('{}', { "content-type": "application/json; charset=invalid-secret" }, 415, -32000, "_none", "body_rejected");
  await check(call("check_ai_readiness", { url: [] }), {}, 200, -32602, "_unknown", "invalid_params");
  await check(call("unknown-tool-secret"), {}, 200, -32602, "_unknown", "unknown_tool");
  await check(rpc("unknown-method-secret"), {}, 200, -32601, "_none", "unknown_method");
  const missing = await check(call(), {}, 200, null, "check_ai_readiness", "tool_input");
  assert.equal(missing.json.result.isError, true);
  assert.equal((await f.request(rpc("initialize", { protocolVersion: "unsupported-secret" }), { "mcp-protocol-version": "unsupported-secret" })).json.result.protocolVersion, "2025-11-25");
  assert.equal((await f.request([rpc("ping")])).json.length, 1);
  assert.equal((await f.request(Array.from({ length: 25 }, (_, i) => rpc("ping", undefined, i)), { "mcp-protocol-version": "2025-03-26" })).json.length, 25);
  const mixed = await f.request([call(), call("check_ai_readiness", { url: [] }, 2), { invalid: true }, notify(call()), rpc("ping")]);
  assert.equal(mixed.status, 200); assert.equal(mixed.json.length, 4);
  assert.equal(mixed.json[0].result.isError, true);
  assert.equal(mixed.json[1].error.code, -32602); assert.equal(mixed.json[2].error.code, -32600);
  for (const body of [notify(call()), notify(call("check_ai_readiness", { url: [] })), notify(rpc("unknown-method-secret")), notify(rpc("notifications/initialized")), { jsonrpc: "2.0", id: 5, result: {} }]) {
    const response = await f.request(body);
    assert.equal(response.status, 202); assert.equal(response.raw, "");
  }
  await f.drain();
  const snapshot = await f.summary();
  assert.equal(snapshot.humans, 0);
  assert.equal(snapshot.mcpProtocol.outcomes.refusals.complete, false);
  assert.equal(snapshot.mcpProtocol.outcomes.refusals.historicalCauses, "unknown_no_backfill");
  assert.equal(snapshot.mcpProtocol.outcomes.refusals.withoutReason.unattributed, 0);
  assert.equal(snapshot.mcpProtocol.outcomes.counts["unattributed|_unknown|notification_completed"], 1);
  const retained = readFileSync(f.wal, "utf8") + JSON.stringify(snapshot) + JSON.stringify(await f.store.readSnapshot(new Date().toISOString()));
  for (const raw of ["unknown-tool-secret", "unknown-method-secret", "invalid-secret", "raw-secret"]) assert.equal(retained.includes(raw), false);
});

async function controlledTools(t) {
  const { fixPackLicenseDeps } = await import("../lib/fixpack-license.js");
  const original = { fetch: globalThis.fetch, lookup: dns.lookup, ...fixPackLicenseDeps };
  const state = { reads: 0, fetches: 0, paid: false, failFetch: false, failHandler: false, gate: null, entered: null };
  dns.lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  globalThis.fetch = async () => {
    state.fetches++;
    state.entered?.();
    if (state.gate) await state.gate;
    if (state.failFetch) throw new Error("upstream-error-secret");
    return new Response('<title>fixture-body-secret</title><h1>Fixture</h1>', { status: 200 });
  };
  fixPackLicenseDeps.isConfigured = () => { if (state.failHandler) throw new Error("handler-error-secret"); return true; };
  fixPackLicenseDeps.getStripe = () => ({ checkout: { sessions: { retrieve: async () => {
    state.reads++;
    return { payment_status: state.paid ? "paid" : "unpaid", currency: "usd", amount_total: 3900, metadata: { offer: "ai_fix_pack" } };
  } } } });
  t.after(() => { globalThis.fetch = original.fetch; dns.lookup = original.lookup; Object.assign(fixPackLicenseDeps, { getStripe: original.getStripe, isConfigured: original.isConfigured, now: original.now }); });
  return state;
}

test("license and generation machine contacts, healthy negative result, caught/uncaught failure and recovery", async t => {
  const f = await mountRefusalFixture(t);
  const state = await controlledTools(t);
  const paid = call("generate_complete_fix_pack", { url: "https://fixture.example/path-secret", license: "cs_test_secret" }, "id-secret");
  const invalid = await f.request(paid, source);
  assert.equal(invalid.json.result.isError, true);
  assert.match(invalid.raw, /contact@neomorphic\.io/); assert.doesNotMatch(invalid.raw, /help@samedaydesk\.com/);
  assert.equal(state.reads, 1);
  state.paid = true; state.failFetch = true;
  const failed = await f.request(paid, source);
  assert.equal(failed.json.result.isError, true); assert.match(failed.raw, /Email contact@neomorphic\.io/);
  assert.doesNotMatch(failed.raw, /help@samedaydesk\.com/); assert.equal(state.reads, 2);
  state.failHandler = true;
  assert.deepEqual((await f.request(paid, source)).json, { jsonrpc: "2.0", id: "id-secret", error: { code: -32603, message: "Internal error" } });
  assert.equal(state.reads, 2, "uncaught failure does not retry license retrieval");
  state.failHandler = false; state.failFetch = false;
  const healthy = await f.request(call("check_ai_readiness", { url: "https://fixture.example/path-secret" }), source);
  assert.ok(healthy.json.result.structuredContent.score < 100);
  assert.equal(healthy.json.result.isError, undefined, "negative readiness findings remain normal");
  assert.equal((await f.request(paid, source)).json.result.isError, undefined);
  assert.equal(state.reads, 3, "one license retrieval per admitted paid call");
  const human = await f.request(undefined, {}, "/mcp?cs=cs_test_secret", "GET");
  assert.match(human.raw, /Trouble\? Email help@samedaydesk\.com/);
  await f.drain();
  const counts = (await f.summary()).mcpProtocol.outcomes.counts;
  for (const reason of ["license_unverified", "tool_error", "handler_error"]) assert.equal(counts[key("generate_complete_fix_pack", reason, "agentverse-a2a-v1")], 1);
  assert.equal(counts["agentverse-a2a-v1|check_ai_readiness|normal_result"], 1);
  const retained = readFileSync(f.wal, "utf8") + JSON.stringify(await f.summary());
  for (const raw of ["path-secret", "cs_test_secret", "id-secret", "upstream-error-secret", "handler-error-secret", "fixture-body-secret"]) assert.equal(retained.includes(raw), false);
});

test("disconnect, duplicate callbacks and observation write failure cannot repeat tool work", async t => {
  const { atomicWriteJson } = await import("../lib/pulse-store/atomic-write.js");
  let failWrite = true;
  const f = await mountRefusalFixture(t, { fallbackOptions: { writeJson: (file, value) => failWrite && value.pendingFlushes.length ? false : atomicWriteJson(file, value) } });
  const state = await controlledTools(t);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { state.entered = resolve; });
  const req = http.request({ host: "127.0.0.1", port: f.server.address().port, path: "/mcp", method: "POST", headers: { "content-type": "application/json" } });
  req.on("error", () => {});
  req.end(JSON.stringify(call("check_ai_readiness", { url: "https://fixture.example" })));
  await entered; req.destroy();
  await new Promise(resolve => setTimeout(resolve, 20));
  release(); state.gate = null; state.entered = null;
  for (let i = 0; i < 100 && !f.pulse.pulseSnapshot().mcpProtocol.outcomes.counts["unattributed|check_ai_readiness|normal_result"]; i++) await new Promise(resolve => setTimeout(resolve, 10));
  await f.request(call("generate_complete_fix_pack", { url: "https://fixture.example", license: "cs_fixture" }));
  const reads = state.reads, fetches = state.fetches;
  assert.equal(reads, 1);
  assert.equal(f.pulse.flushPulseSnapshot(), false);
  assert.equal(f.pulse.pulseSnapshot().knownGap.walWritePending, true);
  failWrite = false; await f.drain();
  assert.equal(state.reads, reads); assert.equal(state.fetches, fetches);
  const fakeReq = { method: "POST", path: "/mcp", headers: {}, body: call() };
  const res = new EventEmitter(); res.writableFinished = true;
  f.pulse.pulseMiddleware(fakeReq, res, () => {}); f.pulse.pulseMiddleware(fakeReq, res, () => {});
  const entry = fakeReq.mcpAdmission.entries[0];
  f.pulse.recordMcpProduced(fakeReq, entry, { result: { isError: true } }, "raw-cause-secret");
  f.pulse.recordMcpProduced(fakeReq, entry, { result: { isError: true } }, "tool_input");
  res.emit("finish"); res.emit("finish"); res.emit("close");
  await f.drain();
  const snapshot = await f.summary();
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("check_ai_readiness", "unknown")], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("check_ai_readiness", "tool_input")], undefined);
  assert.equal(snapshot.mcpProtocol.outcomes.counts["unattributed|_none|disconnected"], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts["unattributed|check_ai_readiness|normal_result"], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts["unattributed|_none|response_finished"], 2);
  assert.equal(snapshot.complete, true);
  assert.equal(JSON.stringify(snapshot).includes("raw-cause-secret"), false);
});

test("exact f629 admission/parser/route keep response/status/header parity except the two authorized machine contacts", async t => {
  const f = await mountRefusalFixture(t);
  const state = await controlledTools(t);
  const baseModules = new Map();
  for (const path of ["lib/mcp-admission.js", "lib/mcp-http.js", "routes/mcp.js"]) {
    const result = spawnSync("git", ["show", `f629597d9e865bd6709d4b10d96a9905cc9ea3c3:server/${path}`], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const originalUrl = new URL(`../${path}`, import.meta.url).href;
    const text = result.stdout.replace(/(from\s+)["']([^"']+)["']/g, (_, prefix, spec) => {
      const resolved = spec.startsWith(".") ? new URL(spec, originalUrl).href : import.meta.resolve(spec);
      return prefix + JSON.stringify(baseModules.get(resolved) || resolved);
    });
    baseModules.set(originalUrl, `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`);
  }
  const { default: baseRouter } = await import(baseModules.get(new URL("../routes/mcp.js", import.meta.url).href));
  const { mcpHeaders, mcpJsonParser, mcpBodyError } = await import(baseModules.get(new URL("../lib/mcp-http.js", import.meta.url).href));
  const app = express(); app.use("/mcp", mcpHeaders, mcpJsonParser, mcpBodyError, baseRouter);
  const baseServer = http.createServer(app); await new Promise(resolve => baseServer.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => baseServer.close(resolve)));
  const cases = [rpc("initialize"), rpc("tools/list"), rpc("ping"), [], [rpc("ping")], Array.from({ length: 26 }, () => rpc("ping")), { invalid: true }, call("unknown-secret"), rpc("unknown-secret"), call(), call("check_agent_readiness"), call("check_ai_readiness", { url: [] }), notify(call()), { jsonrpc: "2.0", id: 1, result: {} }];
  for (const body of cases) {
    const old = await loopbackRequest(baseServer, body), now = await f.request(body);
    assert.equal(now.status, old.status); assert.equal(now.raw, old.raw);
    for (const header of ["access-control-allow-origin", "access-control-allow-headers", "cache-control", "referrer-policy", "content-type"]) assert.equal(now.headers[header], old.headers[header]);
  }
  for (const [body, headers] of [
    ['{"raw-secret":', {}], [rpc("tools/list"), { "mcp-protocol-version": "unsupported-secret" }],
    [[rpc("ping")], { "mcp-protocol-version": "2025-11-25" }], ['{}', { "content-type": "application/json; charset=invalid-secret" }],
  ]) {
    const old = await loopbackRequest(baseServer, body, headers), now = await f.request(body, headers);
    assert.equal(now.status, old.status); assert.equal(now.raw, old.raw);
  }
  const paid = call("generate_complete_fix_pack", { url: "https://fixture.example", license: "cs_fixture" });
  for (const generationFailure of [false, true]) {
    state.paid = generationFailure; state.failFetch = generationFailure;
    const before = state.reads;
    const old = await loopbackRequest(baseServer, paid), now = await f.request(paid);
    assert.equal(state.reads - before, 2);
    assert.equal(now.status, old.status);
    assert.equal(now.raw, old.raw.replace("help@samedaydesk.com", "contact@neomorphic.io"));
  }
  assert.equal((await f.request(undefined, {}, "/mcp?cs=cs_fixture", "GET")).raw, (await loopbackRequest(baseServer, undefined, {}, "/mcp?cs=cs_fixture", "GET")).raw);
});
