import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { before, after } from "node:test";
import express from "express";
import { BASE_TOKEN, TEMPO_TOKEN, networkInfo, taskFixture } from "./helpers/taskmarket-fixtures.js";
import { TASKMARKET_METADATA_TTL_MS, TASKMARKET_NETWORK_INFO } from "../lib/taskmarket-networks.js";
import { browseTaskMarketTasks, planTaskMarketDelegation } from "../lib/taskmarket.js";
import { createFileFallbackStore, createPulseStoreFromTransport } from "../lib/pulse-store/index.js";
import { createFakePulseAuthority, createFakeRpcTransport } from "./helpers/fake-pulse-authority.js";
import { atomicWriteJson } from "../lib/pulse-store/atomic-write.js";
import { classifyBrowseResult } from "../lib/pulse-store/mcp-outcomes.js";

const dir = mkdtempSync(join(tmpdir(), "root4000-mcp-"));
process.env.PULSE_FILE = join(dir, "startup.json");
process.env.PULSE_TOKEN = "root4000-loopback";
process.env.TASKMARKET_HOME = join(dir, "wallet-must-not-exist");
const pulse = await import("../lib/pulse.js");
const { createSdsApp } = await import("../app.js");
const savedFetch = globalThis.fetch;
let server, port, authority, store, fallback, walPath, sequence = 0, fixture, metadata, requests;
let metadataFailure = false;
const source = "agentverse-a2a-v1";
const key = event => `${source}|browse_taskmarket_tasks|${event}`;
const call = (name, args = {}, id = "request-identity-secret") => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const browse = args => call("browse_taskmarket_tasks", args);
const plan = (overrides = {}) => call("plan_taskmarket_delegation", {
  chain_id: 8453, token_address: BASE_TOKEN, request: "Compare public inputs", deliverable: "Markdown evidence", reward_base_units: "3142305", max_spend_base_units: "4000000", deadline_hours: 24, ...overrides,
});

function request(body, path = "/mcp", method = "POST", targetPort = port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: targetPort, path, method, headers: { "content-type": "application/json", "x-samedaydesk-agent-source": source, authorization: "Bearer auth-secret" } }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, raw, json: raw ? JSON.parse(raw) : null }); });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}
async function summary() { return (await request(undefined, "/api/pulse?k=root4000-loopback", "GET")).json; }
async function drain() { pulse.__pulseTestInternals().admitPendingDeltaToWal(); await pulse.__pulseTestInternals().drainPendingFlushes(); }
async function reset({ configured = true, transportOptions = {}, writeJson } = {}) {
  metadata = networkInfo(); metadataFailure = false; fixture = [taskFixture()]; requests = [];
  // A fresh fixture function also gives the public metadata cache a fresh key.
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    assert.equal(options.method, "GET"); assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    assert.deepEqual(Object.keys(options.headers).sort(), ["accept", "user-agent"]);
    if (url === TASKMARKET_NETWORK_INFO) {
      if (metadataFailure) throw new Error("metadata-private-secret");
      return Response.json(metadata);
    }
    assert.ok(String(url).startsWith("https://api.taskmarket.dev/api/tasks"), "only documented public reads may run");
    if (String(url).endsWith("/submissions")) return Response.json([{ id: "submission-secret", artifacts: [{ fileName: "report.md", storageUri: "private-storage-secret" }] }]);
    return Response.json(String(url).includes("/tasks?") ? { tasks: fixture } : fixture[0]);
  };
  authority = createFakePulseAuthority();
  store = createPulseStoreFromTransport(createFakeRpcTransport(authority, transportOptions), { configured });
  walPath = join(dir, `${sequence++}.wal.json`);
  fallback = createFileFallbackStore(walPath, writeJson ? { writeJson } : {});
  pulse.configurePulseStoreForTests({ store, fileFallback: fallback });
  await pulse.waitForPulseHydration();
}
before(async () => {
  pulse.__pulseTestInternals().stopScheduledFlush();
  server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); port = server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = savedFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("mounted Base/Tempo/mixed browse preserves exact rewards and existing search/tag/mode/limit", async () => {
  await reset();
  fixture = [taskFixture({ description: "# arbitrary-task-secret\n" + "x".repeat(1300) + " SearchNeedle" }), taskFixture({ id: "0x" + "b".repeat(64), chainId: 4217, reward: "900719925474099312345678", netReward: "900719925474099312345677" })];
  const result = (await request(browse({ mode: "bounty", limit: 2 }))).json.result;
  assert.equal(result.structuredContent.count, 2);
  const [base, tempo] = result.structuredContent.tasks;
  assert.equal(base.chain_id, 8453); assert.equal(base.reward_usdc, "3.142305");
  assert.equal(tempo.chain_id, 4217); assert.equal(tempo.asset.symbol, "OUSD");
  assert.equal(tempo.asset.payment_protocol, "mpp"); assert.equal(tempo.asset.payment_method, "mpp-tempo");
  assert.equal(tempo.reward.base_units, "900719925474099312345678");
  assert.equal(tempo.reward.amount, "900719925474099312.345678");
  assert.equal(tempo.reward_usdc, undefined); assert.equal(tempo.net_reward_usdc, undefined);
  assert.equal(classifyBrowseResult(result), "browse_non_empty");
  assert.equal((await request(browse({ tag: "RESEARCH", search: "SearchNeedle", limit: 1 }))).json.result.structuredContent.count, 1, "search still sees full original description before truncation");
  assert.match(requests.find(entry => entry.url.includes("tasks?")).url, /mode=bounty/);
  await drain();
  assert.equal((await summary()).mcpProtocol.outcomes.counts[key("browse_non_empty")], 2);
  const retained = JSON.stringify(await authority.readSnapshot()) + readFileSync(walPath, "utf8") + JSON.stringify(await summary());
  for (const secret of ["arbitrary-task-secret", "request-identity-secret", "auth-secret", "SearchNeedle", BASE_TOKEN, TEMPO_TOKEN, fixture[0].id]) assert.equal(retained.includes(secret), false, secret);
});

test("legacy missing chain, unserved chain and unknown served token keep raw units, never guessed USDC", async () => {
  await reset();
  metadata.result.data.chains.push({ chainId: 999, networkName: "Future", tokenAddress: "0x" + "1".repeat(40), tokenSymbol: "XYZ", paymentProtocol: "x402", paymentMethod: "eip3009", tokenDecimals: 18 });
  fixture = [taskFixture({ chainId: undefined }), taskFixture({ chainId: 888 }), taskFixture({ chainId: 999 })];
  const tasks = (await request(browse())).json.result.structuredContent.tasks;
  assert.deepEqual(tasks.map(task => task.asset.metadata_status), ["chain_unknown", "chain_not_served", "served"]);
  for (const task of tasks) { assert.equal(task.reward.base_units, "3142305"); assert.equal(task.reward.amount, null); assert.equal(task.asset.decimals, null); assert.equal(task.reward_usdc, undefined); }
  assert.equal((await request(browse({ min_reward_usdc: "1" }))).json.result.isError, true, "unknown assets cannot silently become a filtered empty list");
  const unknownPlan = (await request(plan({ chain_id: 999, token_address: "0x" + "1".repeat(40) }))).json.result.structuredContent;
  assert.equal(unknownPlan.authorization.reward.amount, null); assert.equal(unknownPlan.official_cli.argv, null);
});

test("legacy USDC threshold selects Base only; OUSD is never compared as dollars", async () => {
  await reset(); fixture.push(taskFixture({ chainId: 4217, id: "0x" + "b".repeat(64), reward: "999999999" }));
  const result = (await request(browse({ min_reward_usdc: "3" }))).json.result.structuredContent;
  assert.equal(result.count, 1); assert.equal(result.tasks[0].chain_id, 8453);
  assert.equal((await request(browse({ chain_id: 4217, min_reward_usdc: "1" }))).json.result.isError, true);
  fixture = [taskFixture({ chainId: 4217 })];
  const empty = (await request(browse({ min_reward_usdc: "1" }))).json.result;
  assert.equal(empty.structuredContent.count, 0); assert.equal(classifyBrowseResult(empty), "browse_empty");
});

test("metadata outage/malformed/duplicate/decimal conflict refuse and recover on actual mounted consumers", async () => {
  for (const corrupt of [() => { metadataFailure = true; }, () => { metadata = {}; }, () => { metadata.result.data.chains.push(metadata.result.data.chains[0]); }, () => { metadata.result.data.chains[1].tokenDecimals = 18; }, () => { metadata.result.data.chains[0].tokenSymbol = "OUSD"; }]) {
    await reset(); corrupt();
    for (const body of [browse(), call("track_taskmarket_task", { task_id: fixture[0].id }), plan()]) {
      const failed = await request(body); assert.equal(failed.status, 200); assert.equal(failed.json.result.isError, true); assert.equal(failed.json.result.structuredContent, undefined);
    }
    metadata = networkInfo(); metadataFailure = false;
    assert.equal((await request(browse())).json.result.structuredContent.count, 1);
    await drain();
    const counts = (await summary()).mcpProtocol.outcomes.counts;
    assert.equal(counts[key("tool_refusal")], 1); assert.equal(counts[key("browse_non_empty")], 1); assert.equal(counts[key("browse_empty")], undefined);
    assert.equal(JSON.stringify(await summary()).includes("metadata-private-secret"), false);
  }
});

test("malformed/unsafe amounts and conflicting task identity refuse or stay explicitly unknown, never zero", async () => {
  for (const reward of [null, 1, 9007199254740992, "-1", "1.1", "1e6", "9".repeat(79)]) {
    await reset(); fixture[0].reward = reward;
    assert.equal((await request(browse())).json.result.isError, true);
  }
  await reset(); fixture[0].tokenDecimals = 18;
  const result = (await request(browse())).json.result.structuredContent.tasks[0];
  assert.equal(result.asset.metadata_status, "task_metadata_conflict"); assert.equal(result.reward.amount, null); assert.equal(result.reward_usdc, undefined);
  await reset(); fixture = Array.from({ length: 101 }, () => taskFixture());
  assert.equal((await request(browse())).json.result.isError, true);
});

test("track qualifies reward/action/award amounts for Tempo and Base and strips storage secrets", async () => {
  for (const id of [4217, 8453]) {
    await reset(); fixture = [taskFixture({ chainId: id, status: "expired", pendingActions: [{ role: "requester", action: "accept", paymentAmount: "1000", requiresPayment: true }], awards: [{ workerPayment: "900719925474099312345678" }] })];
    const result = (await request(call("track_taskmarket_task", { task_id: fixture[0].id }))).json.result.structuredContent;
    assert.equal(result.pending_actions[0].payment.amount, "0.001"); assert.equal(result.awards[0].worker_payment.amount, "900719925474099312.345678");
    assert.equal(result.pending_actions[0].asset.chain_id, id);
    assert.equal(Object.hasOwn(result.awards[0], "worker_payment_usdc"), id === 8453);
    assert.equal(Object.hasOwn(result.pending_actions[0], "payment_usdc"), id === 8453);
    assert.equal(JSON.stringify(result).includes("private-storage-secret"), false);
    assert.equal(result.next_action.includes("x402"), false);
  }
});

test("legacy/unknown tracking retains raw action/award amounts and malformed inventory never becomes empty", async () => {
  for (const chainId of [undefined, 888]) {
    await reset(); fixture = [taskFixture({ chainId, reward: "0003142305", pendingActions: [{ paymentAmount: "0001000" }], awards: [{ workerPayment: "900719925474099312345678" }] })];
    const result = (await request(call("track_taskmarket_task", { task_id: fixture[0].id }))).json.result.structuredContent;
    assert.equal(result.task.reward.base_units, "0003142305");
    assert.equal(result.pending_actions[0].payment.base_units, "0001000");
    assert.equal(result.awards[0].worker_payment.amount, null);
    assert.equal(JSON.stringify(result).includes("_usdc"), false);
  }
  await reset(); fixture = [null];
  assert.equal((await request(browse())).json.result.isError, true);
  fixture = [taskFixture()];
  assert.equal((await request(call("track_taskmarket_task", { task_id: "0x" + "A".repeat(64) }))).json.result.structuredContent.task.id, fixture[0].id, "hex id casing does not change task identity");
  fixture = [taskFixture({ chainId: 4217 })];
  assert.equal((await request(browse({ chain_id: 8453 }))).json.result.isError, true);
  assert.equal((await request(browse({ chain_id: 4217 }))).json.result.structuredContent.count, 1);
});

test("metadata byte bound and timeout refuse without falling back to an empty inventory", async () => {
  const oversized = async () => new Response("x".repeat(65_537));
  await assert.rejects(browseTaskMarketTasks({}, { fetchImpl: oversized }), /metadata unavailable/);
  const stalled = async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("fixture aborted")), { once: true }));
  await assert.rejects(browseTaskMarketTasks({}, { fetchImpl: stalled, timeoutMs: 5 }), /metadata unavailable/);
});

test("plans require explicit matching chain/asset and ceiling, never write, sign or initialize wallets", async () => {
  await reset();
  const base = (await request(plan())).json.result.structuredContent;
  assert.equal(base.request.body.chainId, 8453); assert.equal(base.authorization.reward_usdc, "3.142305");
  assert.deepEqual(base.official_cli.argv.slice(0, 4), ["--network", "base", "task", "create"]);
  const tempo = (await request(plan({ chain_id: 4217, token_address: TEMPO_TOKEN }))).json.result.structuredContent;
  assert.equal(tempo.request.body.chainId, 4217); assert.equal(tempo.authorization.asset.symbol, "OUSD");
  assert.equal(tempo.request.payment_protocol, "mpp"); assert.equal(tempo.request.x402_required, false);
  assert.equal(tempo.authorization.reward_usdc, undefined); assert.equal(tempo.official_cli.argv, null);
  assert.notEqual(base.plan_id, tempo.plan_id);
  const ceiling = (await request(plan({ max_spend_base_units: "5000000" }))).json.result.structuredContent;
  assert.notEqual(base.plan_id, ceiling.plan_id, "plan id binds the ceiling too");
  for (const overrides of [{ chain_id: undefined }, { token_address: undefined }, { chain_id: 4217 }, { token_address: TEMPO_TOKEN }, { max_spend_base_units: "1" }, { chain_id: 4217, token_address: TEMPO_TOKEN, reward_usdc: "1", max_spend_usdc: "2" }, { reward_base_units: undefined, max_spend_base_units: undefined, reward_usdc: 9007199254740992, max_spend_usdc: "9999999999999999" }]) assert.equal((await request(plan(overrides))).json.result.isError, true);
  for (const result of [base, tempo]) { assert.equal(result.request.executed, false); assert.equal(result.official_cli.executed, false); assert.equal(result.authorization.state, "approval_required"); }
  assert.equal(requests.every(entry => entry.url === TASKMARKET_NETWORK_INFO && entry.options.method === "GET"), true);
  assert.equal(existsSync(process.env.TASKMARKET_HOME), false);
});

test("public metadata cache is bounded, never follows RPC/task URLs, expires and recovers without stale fallback", async () => {
  let time = 0, count = 0, broken = false;
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.credentials, "omit"); assert.equal(opts.redirect, "error");
    if (url === TASKMARKET_NETWORK_INFO) { count++; if (broken) throw new Error("offline"); const info = networkInfo(); info.result.data.chains[0].rpcUrl = "http://127.0.0.1/never-fetch"; return Response.json(info); }
    return Response.json({ tasks: [taskFixture({ description: "http://127.0.0.1/never-fetch" })] });
  };
  const deps = { fetchImpl, metadataNowMs: () => time };
  await browseTaskMarketTasks({}, deps); await browseTaskMarketTasks({}, deps); assert.equal(count, 1);
  time += TASKMARKET_METADATA_TTL_MS + 1; broken = true;
  await assert.rejects(browseTaskMarketTasks({}, deps), /metadata unavailable/); assert.equal(count, 2);
  broken = false; await browseTaskMarketTasks({}, deps); assert.equal(count, 3);
  await assert.rejects(planTaskMarketDelegation({}, { fetchImpl: () => { throw new Error("must not fetch"); } }), /chain_id/);
});

test("mounted mixed batch/notification/protocol failure and empty/non-empty result persistence count per entry", async () => {
  await reset(); fixture = [];
  const notification = browse(); delete notification.id;
  const response = await request([browse(), notification, call("browse_taskmarket_tasks", { limit: "bad" }, 2), { invalid: "raw-secret" }, call("track_taskmarket_task", { task_id: "bad" }, 3)]);
  assert.equal(response.status, 200); assert.equal(response.json.length, 4);
  fixture = [taskFixture()]; assert.equal((await request(browse())).json.result.structuredContent.count, 1);
  assert.equal((await request('{"invalid')).json.error.code, -32700);
  await drain(); const durable = await authority.readSnapshot(); const snapshot = await summary();
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("browse_empty")], 2);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("browse_non_empty")], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("normal_result")], 3);
  assert.equal(snapshot.mcpProtocol.outcomes.counts[key("notification_completed")], 1);
  assert.equal(snapshot.mcpProtocol.outcomes.browseResults.complete, false);
  assert.match(snapshot.mcpProtocol.outcomes.browseResults.meaning, /not actionable funding/);
  assert.equal((await request(undefined, "/api/pulse", "GET")).status, 404);
  await drain(); assert.deepEqual((await authority.readSnapshot()).mcpOutcomes, durable.mcpOutcomes);
  pulse.configurePulseStoreForTests({ store, fileFallback: fallback }); await pulse.waitForPulseHydration();
  assert.deepEqual((await summary()).mcpProtocol.outcomes.counts, snapshot.mcpProtocol.outcomes.counts);
});

test("malformed/contradictory normal results cross the mounted producer/store/summary boundary as unclassified", async () => {
  await reset();
  const valid = (await request(browse())).json.result;
  const malformed = [ {}, { ...valid, structuredContent: { ...valid.structuredContent, count: 0 } }, { ...valid, structuredContent: { ...valid.structuredContent, tasks: [] } }, { ...valid, content: [{ type: "text", text: "contradictory-body-secret" }] }, { ...valid, structuredContent: { ...valid.structuredContent, count: 26, tasks: Array(26).fill(valid.structuredContent.tasks[0]) } } ];
  // A self-consistent mirror does not make missing/wrong metadata an empty inventory.
  for (const change of [
    { metadata: null },
    { metadata: { ...valid.structuredContent.metadata, source: "https://invalid.example/metadata" } },
    { metadata: { ...valid.structuredContent.metadata, max_age_ms: 0 } },
    { fetched_at: "January 1, 2001" },
  ]) {
    const value = { ...valid.structuredContent, count: 0, tasks: [], ...change };
    malformed.push({ ...valid, structuredContent: value, content: [{ type: "text", text: `TaskMarket browse taskmarket tasks result:\n\n${JSON.stringify(value, null, 2)}` }] });
  }
  const app = express(); app.use(express.json()); app.use(pulse.pulseMiddleware);
  // Controlled malformed normal producer, using the SAME admission/event boundary.
  // The real TaskMarket handler separately refuses malformed upstream data above.
  app.post("/mcp", (req, res) => { const message = req.mcpAdmission.entries[0]; const result = { jsonrpc: "2.0", id: 1, result: malformed.shift() }; pulse.recordMcpProduced(req, message, result); pulse.recordMcpProduced(req, message, result); res.json(result); });
  const extra = http.createServer(app); await new Promise(resolve => extra.listen(0, "127.0.0.1", resolve));
  try { while (malformed.length) assert.equal((await request(browse(), "/mcp", "POST", extra.address().port)).status, 200); }
  finally { await new Promise(resolve => extra.close(resolve)); }
  await drain();
  assert.equal((await summary()).mcpProtocol.outcomes.counts[key("browse_unclassified")], 9);
  assert.equal((await summary()).mcpProtocol.outcomes.counts[key("normal_result")], 10);
  assert.equal(JSON.stringify(await summary()).includes("contradictory-body-secret"), false);
});

test("failed WAL write and ambiguous durable flush recover, duplicate flushes and fresh process preserve coverage", async () => {
  let writable = false;
  await reset({ writeJson: (path, value) => writable && atomicWriteJson(path, value), transportOptions: { applyThenError: true } });
  assert.equal((await request(browse())).json.result.structuredContent.count, 1, "observation failure cannot change tool output");
  assert.equal(pulse.flushPulseSnapshot(), false);
  assert.equal((await summary()).knownGap.walWritePending, true);
  writable = true; await drain();
  assert.equal(fallback.loadPendingFlushes().length, 1, "acknowledgment loss keeps original WAL entry");
  const retained = fallback.loadPendingFlushes()[0];
  assert.equal((await store.flush(retained.flushId, retained.delta)).status, "already_applied");
  pulse.__pulseTestInternals().setPulseNow(() => Date.now() + 1_000_000);
  await drain(); assert.equal(fallback.loadPendingFlushes().length, 0);
  assert.equal((await summary()).mcpProtocol.outcomes.counts[key("browse_non_empty")], 1);
  await reset({ configured: false }); fixture = []; await request(browse()); await drain();
  const restartFile = join(dir, "restart.json");
  copyFileSync(walPath, `${restartFile}.fallback.json`);
  const restarted = spawnSync(process.execPath, ["--input-type=module", "--eval", `const p=await import('./server/lib/pulse.js'); await p.waitForPulseHydration(); p.__pulseTestInternals().stopScheduledFlush(); console.log(JSON.stringify(p.pulseSnapshot()));`], { env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", PULSE_FILE: restartFile }, encoding: "utf8" });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.equal(JSON.parse(restarted.stdout.trim()).mcpProtocol.outcomes.counts[key("browse_empty")], 1);
  assert.equal(JSON.parse(restarted.stdout.trim()).mcpProtocol.outcomes.browseResults.coverage, "lower_bound_from_first_observation");
});
