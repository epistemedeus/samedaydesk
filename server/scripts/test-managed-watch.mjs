import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile, chmod, mkdir } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashToken } from "../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { createSdsApp } from "../app.js";
import { hashGrantToken } from "../lib/managed-watch/limits.mjs";
import { digestMatchesPin, loadPinnedMonitor } from "../lib/managed-watch/runtime.mjs";
import { readPinnedSnapshot, refuseCallerTarget } from "../lib/managed-watch/source.mjs";
import { armScheduler } from "../lib/managed-watch/scheduler.mjs";
import { createManagedWatch } from "../lib/managed-watch/service.mjs";
import { openFileWatchStore } from "../lib/managed-watch/store-file.mjs";
import { openPgWatchStore } from "../lib/managed-watch/store-pg.mjs";
import { WatchError } from "../lib/managed-watch/errors.mjs";
import { runDirectAlternative } from "../lib/managed-watch/direct-alternative.mjs";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(root, "../lib/managed-watch/worker-main.mjs");
const client = path.join(root, "../lib/managed-watch/client.mjs");
const TOKEN = "neo_watch_owner_token_0001";
const FOREIGN = "neo_watch_foreign_token_002";
const READER = "neo_watch_reader_token_0003";

function metric(key, value, population) {
  return { key, value, state: "ok", unit: "count", population, window: "point" };
}

function covered(marketplaceCompleted, availability = "ok") {
  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    availability,
    fetchedAt: "2026-10-07T00:00:00.000Z",
    providerTimestamp: "2026-10-07T00:00:00.000Z",
    providerTimestampState: "ok",
    metrics: [
      metric("jobCount", 122, "moltjobs_work_market"),
      metric("marketplaceCompleted", marketplaceCompleted, "moltjobs_marketplace_ordinary_third_party"),
      metric("marketplaceEmployers", 4, "moltjobs_marketplace_employers"),
      metric("liquidityRegisteredAgents", 434, "moltjobs_registered_agents"),
      metric("liquidityAgentsEverPaid", 3, "moltjobs_agents_ever_paid"),
      metric("liquidityAgentsBidding30d", 2, "moltjobs_agents_bidding_30d"),
      metric("platformProgramJobs", 1, "moltjobs_platform_programs"),
    ],
  };
}

async function documents() {
  const { projection } = await loadPinnedMonitor();
  const observedAt = "2026-10-07T00:00:00.000Z";
  const base = projection.applySourceUpdate(
    projection.emptyProjection({ observedAt }),
    covered(15),
    { observedAt },
  ).projection;
  const changed = projection.applySourceUpdate(base, covered(16), { observedAt }).projection;
  const later = projection.applySourceUpdate(changed, covered(17), { observedAt }).projection;
  const unavailable = projection.applySourceUpdate(
    base,
    covered(0, "unavailable"),
    { observedAt },
  ).projection;
  const partialReading = covered(15);
  partialReading.metrics = partialReading.metrics.filter((entry) => entry.key !== "platformProgramJobs");
  const partial = projection.applySourceUpdate(base, partialReading, { observedAt }).projection;
  const asDocument = (value, capture = "injected") => ({
    capture, integration: "maintained", projection: value, publicSourceChanged: false,
  });
  return {
    baseline: asDocument(base),
    changed: asDocument(changed),
    later: asDocument(later),
    unavailable: asDocument(unavailable),
    partial: asDocument(partial),
    seeded: projection.seedMeaningfulMutation
      ? null
      : null,
    projection,
    asDocument,
    base,
  };
}

function enrollment(extra = {}) {
  return {
    taskId: "moltjobs-hold",
    source: { kind: "source-projection", scope: "source-projection:moltjobs" },
    predicate: "material-change",
    cadenceMs: 60_000,
    expiresAt: "2026-11-01T00:00:00.000Z",
    budget: { maxChecks: 8, maxBodyBytes: 262_144, maxTimeMs: 8_000, maxOperations: 8, maxUsefulEvents: 4 },
    ...extra,
  };
}

async function tempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "l12-watch-"));
  const store = await openFileWatchStore(dir);
  await store.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  await store.seedGrant({ id: "gr_foreign", projectId: "projother1", role: "owner", tokenHash: hashGrantToken(FOREIGN), expiresAt: null, revokedAt: null });
  await store.seedGrant({ id: "gr_reader", projectId: "projwatch1", role: "reader", tokenHash: hashGrantToken(READER), expiresAt: null, revokedAt: null });
  return { dir, store, async cleanup() { await store.close(); await rm(dir, { recursive: true, force: true }); } };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, urlPath, { method = "GET", token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnWorker(env, action) {
  const child = spawn(process.execPath, [worker, action], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = once(child, "exit").then(([code, signal]) => ({ code, signal, stdout, stderr }));
  return { child, exited };
}

test("grant hash matches correspondence and a tampered archive is refused before extract", async () => {
  assert.equal(hashGrantToken(TOKEN), hashToken(TOKEN));
  const pin = JSON.parse(await readFile(new URL("../lib/managed-watch/pins/PINS.json", import.meta.url), "utf8"));
  const bytes = await readFile(new URL("../lib/managed-watch/pins/change-monitor-0.1.0.tgz", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.changeMonitor.sha256);
  const flipped = Buffer.from(bytes);
  flipped[flipped.length - 1] ^= 0xff;
  assert.notEqual(createHash("sha256").update(flipped).digest("hex"), pin.changeMonitor.sha256);
  assert.throws(() => digestMatchesPin(flipped), (error) => error.code === "monitor_pin");
  const loaded = await loadPinnedMonitor();
  assert.equal(loaded.pin.sha256, pin.changeMonitor.sha256);
  assert.equal(pin.stagedSealNotUsed.sha256.startsWith("d2b093c5"), true);
});

test("feature-off preserves health and does not mount the watch", async (t) => {
  const env = { ...process.env };
  delete env.MANAGED_WATCH_OPT_IN;
  delete env.MANAGED_WATCH_SCHEDULER;
  const app = createSdsApp({ managedWatch: { env, enabled: false }, correspondence: { env } });
  const correspondence = app.get("s51Correspondence");
  await correspondence.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await app.get("l12ManagedWatch").close();
    await correspondence.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.service, "samedaydesk");
  const absent = await request(port, "/api/managed-watch/healthz");
  assert.equal(absent.status, 404);
  const ready = await request(port, "/api/correspondence/healthz");
  assert.equal(ready.json.enabled, false);
  const invalidApp = createSdsApp({ managedWatch: { env: { ...env, MANAGED_WATCH_OPT_IN: "yes" } } });
  assert.equal(invalidApp.get("l12ManagedWatch").enabled, false);
  const invalidListen = await listen(invalidApp);
  t.after(() => new Promise((resolve) => invalidListen.server.close(resolve)));
  const invalidHealth = await request(invalidListen.port, "/api/managed-watch/healthz");
  assert.equal(invalidHealth.status, 200);
  assert.equal(invalidHealth.json.reason, "invalid_config");
  assert.equal(invalidHealth.json.paidServiceLaunch, false);
  const invalidEnroll = await request(invalidListen.port, "/api/managed-watch/enrollments", { method: "POST", body: {} });
  assert.equal(invalidEnroll.status, 404);
  const invalidSds = await request(invalidListen.port, "/api/health");
  assert.equal(invalidSds.status, 200);
  const source = await readFile(new URL("../lib/managed-watch/scheduler.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("setInterval"), false);
  const adapter = await readdir(new URL("../lib/managed-watch/", import.meta.url));
  const texts = await Promise.all(adapter.filter((name) => name.endsWith(".mjs")).map((name) => readFile(new URL(`../lib/managed-watch/${name}`, import.meta.url), "utf8")));
  const joined = texts.join("\n");
  assert.equal(joined.includes("setInterval"), false);
  assert.equal(joined.includes("correspondence_vf04_invocations"), false);
  assert.equal(joined.includes("requestRevalidation"), false);
  assert.equal(joined.includes("stripe"), false);
});

test("mounted lifecycle, refusals before a read, and separate retrieval", async (t) => {
  const docs = await documents();
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  let clock = Date.parse("2026-10-07T00:00:00.000Z");
  let current = docs.baseline;
  let reads = 0;
  const readSource = async () => {
    reads += 1;
    return { document: current, bytes: Buffer.byteLength(JSON.stringify(current)), calls: 1 };
  };
  const app = createSdsApp({
    managedWatch: {
      enabled: true,
      store,
      now: () => new Date(clock).toISOString(),
      readSource,
      allowDeliveryMode: true,
    },
  });
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const created = await request(port, "/api/managed-watch/enrollments", { method: "POST", token: TOKEN, body: enrollment() });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, "scheduled");
  assert.equal(created.json.paidServiceLaunch, false);
  assert.equal(created.json.subscriptionOffered, false);
  assert.equal(created.json.proposedManagedPrice, null);
  assert.equal(reads, 0);
  const healthz = await request(port, "/api/managed-watch/healthz");
  assert.equal(healthz.json.enabled, true);
  assert.equal(healthz.json.paidServiceLaunch, false);

  const missing = await request(port, "/api/managed-watch/due", { method: "POST", body: {} });
  assert.equal(missing.status, 401);
  assert.equal(reads, 0);
  const tampered = await request(port, "/api/managed-watch/due", { method: "POST", token: `${TOKEN}x`, body: {} });
  assert.equal(tampered.status, 401);
  assert.equal(reads, 0);
  const foreign = await request(port, "/api/managed-watch/due", { method: "POST", token: FOREIGN, body: {} });
  assert.equal(foreign.json.action, "idle");
  assert.equal(reads, 0);
  const reader = await request(port, "/api/managed-watch/enrollments", { method: "POST", token: READER, body: enrollment({ taskId: "other-task" }) });
  assert.equal(reader.status, 403);
  assert.equal(reads, 0);

  const baseline = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(baseline.status, 200, JSON.stringify(baseline.json));
  assert.equal(baseline.json.results[0].outcome, "baseline_established");
  assert.equal(baseline.json.results[0].usefulChange, false);
  assert.equal(reads, 1);
  const again = await request(port, "/api/managed-watch/enrollments", { method: "POST", token: TOKEN, body: enrollment() });
  assert.equal(again.status, 409);
  assert.equal(reads, 1);

  const separate = createManagedWatch({ store, now: () => new Date(clock).toISOString(), readSource });
  const retrieved = await separate.retrieve({ token: TOKEN, taskId: "moltjobs-hold" });
  assert.equal(retrieved.results.at(-1).outcome, "baseline_established");
  assert.equal(retrieved.naturalCustomerDemand, false);

  clock += 60_000;
  const unchanged = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(unchanged.json.results[0].outcome, "unchanged");
  assert.equal(unchanged.json.results[0].usefulNegative, true);
  assert.equal(unchanged.json.results[0].usefulChange, false);
  assert.equal(unchanged.json.results[0].delivered, false);
  assert.equal(reads, 2);

  clock += 60_000;
  current = docs.changed;
  const useful = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(useful.json.results[0].outcome, "content_changed");
  assert.equal(useful.json.results[0].usefulChange, true);
  assert.equal(useful.json.results[0].publicSourceChanged, false);
  assert.equal(useful.json.results[0].delivered, true);
  assert.equal(reads, 3);

  clock += 60_000;
  current = docs.unavailable;
  const down = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(down.json.results[0].usefulChange, false);
  assert.notEqual(down.json.results[0].outcome, "content_changed");
  assert.equal(JSON.stringify(down.json.results[0]).includes('"value":0'), false);
  assert.equal(reads, 4);

  clock += 60_000;
  current = docs.partial;
  const part = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(part.json.results[0].outcome, "evidence_unavailable");
  assert.equal(part.json.results[0].usefulChange, false);
  assert.equal(reads, 5);

  clock += 60_000;
  current = docs.later;
  const unknown = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: { deliveryMode: "unknown" } });
  assert.equal(unknown.json.results[0].outcome, "content_changed");
  assert.equal(unknown.json.results[0].delivered, false);
  assert.equal(unknown.json.results[0].deliveryState, "unknown");
  const postsAfterUnknown = unknown.json.watch.costs.deliveryPosts;
  assert.equal(postsAfterUnknown, part.json.watch.costs.deliveryPosts + 1);
  clock += 60_000;
  const replay = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: { deliveryMode: "unknown" } });
  assert.equal(replay.json.results[0].outcome, "unchanged");
  assert.equal(replay.json.watch.costs.deliveryPosts, postsAfterUnknown);

  const paused = await request(port, "/api/managed-watch/enrollments/moltjobs-hold/pause", { method: "POST", token: TOKEN, body: {} });
  assert.equal(paused.json.status, "paused");
  clock += 60_000;
  const pausedDue = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(pausedDue.json.action, "idle");
  assert.equal(reads, 7);
  const resumed = await request(port, "/api/managed-watch/enrollments/moltjobs-hold/resume", { method: "POST", token: TOKEN, body: {} });
  assert.equal(resumed.json.status, "scheduled");
  const cancelled = await request(port, "/api/managed-watch/enrollments/moltjobs-hold/cancel", { method: "POST", token: TOKEN, body: {} });
  assert.equal(cancelled.json.status, "cancelled");
  const afterCancel = await request(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  assert.equal(afterCancel.json.action, "idle");
  assert.equal(reads, 7);
  const resurrect = await request(port, "/api/managed-watch/enrollments/moltjobs-hold/resume", { method: "POST", token: TOKEN, body: {} });
  assert.equal(resurrect.status, 409);
});

test("negative cadence, expiry, budget, malformed input, SSRF and redirect refuse before the side effect", async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  const now = "2026-10-07T00:00:00.000Z";
  let reads = 0;
  const service = createManagedWatch({
    store,
    now: () => now,
    readSource: async () => { reads += 1; throw new Error("read was not allowed"); },
  });
  await assert.rejects(service.enroll({ token: TOKEN, body: enrollment({ cadenceMs: -1 }) }), (error) => error.code === "invalid_cadence");
  await assert.rejects(service.enroll({ token: TOKEN, body: enrollment({ cadenceMs: 0 }) }), (error) => error.code === "invalid_cadence");
  await assert.rejects(service.enroll({ token: TOKEN, body: enrollment({ expiresAt: "2020-01-01T00:00:00.000Z" }) }), (error) => error.code === "invalid_expiry");
  await assert.rejects(service.enroll({ token: TOKEN, body: enrollment({ source: { kind: "source-projection", scope: "source-projection:moltjobs", url: "http://127.0.0.1/" } }) }), (error) => error.code === "url_rejected");
  let sockets = 0;
  const trap = net.createServer((socket) => { sockets += 1; socket.destroy(); });
  await new Promise((resolve) => trap.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => trap.close(resolve)));
  const trapUrl = `http://127.0.0.1:${trap.address().port}/secret`;
  await assert.rejects(refuseCallerTarget(trapUrl, async () => { sockets += 1; throw new Error("fetch"); }), (error) => error.code === "ssrf");
  await assert.rejects(service.enroll({ token: TOKEN, body: { ...enrollment(), url: trapUrl } }), (error) => error.code === "url_rejected" || error.code === "invalid_enrollment" || error.code === "ssrf");
  assert.equal(sockets, 0);
  assert.equal(reads, 0);

  let redirectCalls = 0;
  const redirected = await readPinnedSnapshot({
    now,
    timeoutMs: 1000,
    maxBodyBytes: 1000,
    lookup: async () => [{ address: "1.1.1.1", family: 4 }],
    fetchImpl: async (url) => {
      redirectCalls += 1;
      assert.equal(url, "https://samedaydesk.com/api/observatory/snapshot");
      return { status: 302, headers: { get: () => trapUrl } };
    },
  });
  assert.equal(redirectCalls, 1);
  assert.equal(redirected.failure.code, "redirect_refused");
  assert.equal(redirected.document, undefined);
  assert.notEqual(redirected.document, trapUrl);

  let privateCalls = 0;
  await assert.rejects(readPinnedSnapshot({
    now,
    timeoutMs: 1000,
    maxBodyBytes: 1000,
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async () => { privateCalls += 1; return { status: 200 }; },
  }), (error) => error.code === "ssrf");
  assert.equal(privateCalls, 0);

  await service.enroll({
    token: TOKEN,
    body: enrollment({ budget: { maxChecks: 1, maxBodyBytes: 262_144, maxTimeMs: 8_000, maxOperations: 2, maxUsefulEvents: 1 } }),
  });
  const docs = await documents();
  let budgetClock = Date.parse("2026-10-07T00:00:00.000Z");
  const reading = createManagedWatch({
    store,
    now: () => new Date(budgetClock).toISOString(),
    readSource: async () => {
      reads += 1;
      const document = docs.baseline;
      return { document, bytes: Buffer.byteLength(JSON.stringify(document)), calls: 1 };
    },
  });
  const first = await reading.runDueForGrant({ token: TOKEN });
  assert.equal(first.results[0].outcome, "baseline_established");
  budgetClock += 60_000;
  const blocked = await reading.runDue({ projectId: "projwatch1" });
  assert.equal(blocked.action, "budget_exhausted");
  assert.equal(blocked.read, false);
  assert.equal(reads, 1);
  await reading.cancel({ token: TOKEN, taskId: "moltjobs-hold" });

  const limited = createManagedWatch({
    store,
    now: () => "2026-10-07T01:00:00.000Z",
    readSource: async () => {
      const document = docs.baseline;
      return { document, bytes: Buffer.byteLength(JSON.stringify(document)), calls: 1 };
    },
  });
  await limited.enroll({
    token: TOKEN,
    body: enrollment({
      taskId: "body-hold",
      expiresAt: "2026-11-01T00:00:00.000Z",
      budget: { maxChecks: 4, maxBodyBytes: 32, maxTimeMs: 8_000, maxOperations: 4, maxUsefulEvents: 2 },
    }),
  });
  const oversized = await limited.runDue({ projectId: "projwatch1" });
  assert.equal(oversized.read, true);
  assert.equal(oversized.results[0].outcome, "evidence_unavailable");
  assert.equal(oversized.results[0].failureCode, "body_limit");
  assert.equal(oversized.results[0].usefulChange, false);
  assert.equal(oversized.results[0].publicSourceChanged, false);
  await limited.cancel({ token: TOKEN, taskId: "body-hold" });

  const { monitor } = await loadPinnedMonitor();
  const seededDoc = monitor.seedMeaningfulMutation(docs.baseline, {
    sourceId: "moltjobs",
    key: "marketplaceCompleted",
    now: "2026-10-07T03:05:00.000Z",
  });
  assert.equal(seededDoc.capture, "seeded");
  assert.equal(seededDoc.publicSourceChanged, false);
  let seedClock = Date.parse("2026-10-07T03:00:00.000Z");
  let seedPhase = "baseline";
  const seeding = createManagedWatch({
    store,
    now: () => new Date(seedClock).toISOString(),
    readSource: async () => {
      const document = seedPhase === "baseline" ? docs.baseline : seededDoc;
      return { document, bytes: Buffer.byteLength(JSON.stringify(document)), calls: 1 };
    },
  });
  await seeding.enroll({ token: TOKEN, body: enrollment({ taskId: "seed-hold", expiresAt: "2026-11-01T00:00:00.000Z" }) });
  const seededBase = await seeding.runDueForGrant({ token: TOKEN });
  assert.equal(seededBase.results[0].outcome, "baseline_established");
  seedPhase = "seeded";
  seedClock += 60_000;
  const seededRun = await seeding.runDueForGrant({ token: TOKEN });
  assert.equal(seededRun.results[0].capture, "seeded");
  assert.equal(seededRun.results[0].outcome, "content_changed");
  assert.equal(seededRun.results[0].usefulChange, false);
  assert.equal(seededRun.results[0].publicSourceChanged, false);
  assert.equal(seededRun.results[0].naturalCustomerDemand, false);
  await seeding.cancel({ token: TOKEN, taskId: "seed-hold" });

  const malformed = createManagedWatch({
    store,
    now: () => "2026-10-07T02:00:00.000Z",
    readSource: async () => ({ failure: { code: "malformed", message: "not json" }, bytes: 4, calls: 1 }),
  });
  await malformed.enroll({ token: TOKEN, body: enrollment({ taskId: "malformed-hold", expiresAt: "2026-11-01T00:00:00.000Z" }) });
  const bad = await malformed.runDue({ projectId: "projwatch1" });
  assert.equal(bad.read, true);
  assert.notEqual(bad.results[0].outcome, "content_changed");
  assert.equal(bad.results[0].usefulChange, false);

  const expiring = createManagedWatch({
    store,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => { reads += 1; throw new Error("expired watch was read"); },
  });
  await expiring.enroll({ token: TOKEN, body: enrollment({ taskId: "expire-hold", expiresAt: "2026-10-07T00:01:00.000Z" }) });
  const later = createManagedWatch({
    store,
    now: () => "2026-10-07T00:02:00.000Z",
    readSource: async () => { reads += 1; throw new Error("expired watch was read"); },
  });
  const expired = await later.runDue({ projectId: "projwatch1" });
  assert.equal(expired.action, "expired");
  assert.equal(expired.read, false);
});

test("restart, overlap, cancel, lost reply, and store failure use the disposable file store", async (t) => {
  const docs = await documents();
  const dir = await mkdtemp(path.join(tmpdir(), "l12-proc-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await openFileWatchStore(dir);
  await store.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  await store.close();
  const body = JSON.stringify(enrollment());
  const baseEnv = {
    MANAGED_WATCH_STORE_DIR: dir,
    MANAGED_WATCH_TOKEN: TOKEN,
    MANAGED_WATCH_TASK: "moltjobs-hold",
    MANAGED_WATCH_NOW: "2026-10-07T00:00:00.000Z",
    MANAGED_WATCH_BODY: body,
    MANAGED_WATCH_DOCUMENT: path.join(dir, "doc.json"),
    MANAGED_WATCH_COUNTER: path.join(dir, "reads.txt"),
  };
  await writeFile(baseEnv.MANAGED_WATCH_DOCUMENT, JSON.stringify(docs.baseline));
  const enrolled = await spawnWorker(baseEnv, "enroll").exited;
  assert.equal(enrolled.code, 0, enrolled.stderr);
  assert.equal(JSON.parse(enrolled.stdout).status, "scheduled");

  const crashed = spawnWorker({ ...baseEnv, MANAGED_WATCH_CRASH_DURING_READ: "1" }, "due");
  const crashResult = await crashed.exited;
  assert.equal(crashResult.signal, "SIGKILL");
  const readsAfterCrash = (await readFile(baseEnv.MANAGED_WATCH_COUNTER, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(readsAfterCrash.length, 1);
  const recovered = await spawnWorker(baseEnv, "due").exited;
  assert.equal(recovered.code, 0, recovered.stderr);
  const afterUnknown = await spawnWorker(baseEnv, "retrieve").exited;
  const unknownWatch = JSON.parse(afterUnknown.stdout);
  assert.equal(unknownWatch.results.at(-1).outcome, "unknown");
  assert.equal(unknownWatch.results.at(-1).failureCode, "lost_reply_no_body");
  const stillOne = (await readFile(baseEnv.MANAGED_WATCH_COUNTER, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(stillOne.length, 1);

  const freshDir = await mkdtemp(path.join(tmpdir(), "l12-ok-"));
  t.after(() => rm(freshDir, { recursive: true, force: true }));
  const fresh = await openFileWatchStore(freshDir);
  await fresh.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  await fresh.close();
  const doc = path.join(freshDir, "doc.json");
  const counter = path.join(freshDir, "reads.txt");
  await writeFile(doc, JSON.stringify(docs.baseline));
  const env2 = { ...baseEnv, MANAGED_WATCH_STORE_DIR: freshDir, MANAGED_WATCH_DOCUMENT: doc, MANAGED_WATCH_COUNTER: counter };
  assert.equal((await spawnWorker(env2, "enroll").exited).code, 0);
  const killed = await spawnWorker({ ...env2, MANAGED_WATCH_CRASH_AFTER: "fetched" }, "due").exited;
  assert.equal(killed.signal, "SIGKILL");
  const continued = await spawnWorker(env2, "due").exited;
  assert.equal(continued.code, 0, continued.stderr);
  const viewed = JSON.parse((await spawnWorker(env2, "retrieve").exited).stdout);
  assert.equal(viewed.results.some((row) => row.outcome === "baseline_established"), true);
  const count = (await readFile(counter, "utf8")).trim().split("\n").filter(Boolean).length;
  assert.equal(count, 1);

  const overlapDir = await mkdtemp(path.join(tmpdir(), "l12-overlap-"));
  t.after(() => rm(overlapDir, { recursive: true, force: true }));
  const overlapStore = await openFileWatchStore(overlapDir);
  await overlapStore.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  await overlapStore.close();
  const overlapDoc = path.join(overlapDir, "doc.json");
  const overlapCount = path.join(overlapDir, "reads.txt");
  await writeFile(overlapDoc, JSON.stringify(docs.baseline));
  const overlapEnv = {
    ...baseEnv,
    MANAGED_WATCH_STORE_DIR: overlapDir,
    MANAGED_WATCH_DOCUMENT: overlapDoc,
    MANAGED_WATCH_COUNTER: overlapCount,
    MANAGED_WATCH_READ_DELAY_MS: "250",
  };
  assert.equal((await spawnWorker(overlapEnv, "enroll").exited).code, 0);
  const first = spawnWorker(overlapEnv, "due");
  const second = spawnWorker(overlapEnv, "due");
  const both = await Promise.all([first.exited, second.exited]);
  assert.equal(both.every((row) => row.code === 0), true, both.map((row) => row.stderr).join("\n"));
  const overlapReads = (await readFile(overlapCount, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(overlapReads.length, 1);

  const cancelDir = await mkdtemp(path.join(tmpdir(), "l12-cancel-"));
  t.after(() => rm(cancelDir, { recursive: true, force: true }));
  const cancelStore = await openFileWatchStore(cancelDir);
  await cancelStore.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  await cancelStore.close();
  const waitFile = path.join(cancelDir, "wait.txt");
  await writeFile(waitFile, "wait");
  const cancelDoc = path.join(cancelDir, "doc.json");
  const cancelCount = path.join(cancelDir, "reads.txt");
  await writeFile(cancelDoc, JSON.stringify(docs.baseline));
  const cancelEnv = {
    ...baseEnv,
    MANAGED_WATCH_STORE_DIR: cancelDir,
    MANAGED_WATCH_DOCUMENT: cancelDoc,
    MANAGED_WATCH_COUNTER: cancelCount,
    MANAGED_WATCH_WAIT_FILE: waitFile,
  };
  assert.equal((await spawnWorker(cancelEnv, "enroll").exited).code, 0);
  const waiting = spawnWorker(cancelEnv, "due");
  const opened = await openFileWatchStore(cancelDir);
  const started = Date.now();
  let running = null;
  while (Date.now() - started < 5000) {
    running = await opened.getWatch("projwatch1", "moltjobs-hold");
    if (running?.status === "running") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(running.status, "running");
  const stopper = createManagedWatch({ store: opened, now: () => "2026-10-07T00:00:00.000Z" });
  const stopped = await stopper.cancel({ token: TOKEN, taskId: "moltjobs-hold" });
  assert.equal(stopped.status, "cancelled");
  await writeFile(waitFile, "go");
  const finished = await waiting.exited;
  assert.equal(finished.code, 0, finished.stderr);
  await assert.rejects(readFile(cancelCount, "utf8"));
  await opened.close();

  const failDir = await mkdtemp(path.join(tmpdir(), "l12-fail-"));
  t.after(() => rm(failDir, { recursive: true, force: true }));
  const failStore = await openFileWatchStore(failDir);
  await failStore.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  let failReads = 0;
  const failing = createManagedWatch({
    store: failStore,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => {
      failReads += 1;
      return { document: docs.baseline, bytes: 10, calls: 1 };
    },
  });
  const original = failStore.compareAndSave.bind(failStore);
  let saves = 0;
  failStore.compareAndSave = async (...args) => {
    saves += 1;
    if (saves === 1) throw new WatchError("store_unavailable", "disk full", 503);
    return original(...args);
  };
  await failing.enroll({ token: TOKEN, body: enrollment() });
  await assert.rejects(failing.runDueForGrant({ token: TOKEN }), (error) => error.code === "store_unavailable");
  assert.equal(failReads, 1);
  failStore.compareAndSave = original;
  const afterFailure = await failing.runDueForGrant({ token: TOKEN });
  assert.equal(afterFailure.action === "idle" || afterFailure.read === false, true);
  assert.equal(failReads, 1);
  const stored = await failing.retrieve({ token: TOKEN, taskId: "moltjobs-hold" });
  assert.equal(stored.results.at(-1).failureCode, "lost_reply_no_body");
  await failStore.close();
});

test("idle scheduler does not arm and the direct alternative records real exits", async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  let reads = 0;
  const service = createManagedWatch({
    store,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => { reads += 1; return { document: {}, bytes: 2, calls: 1 }; },
  });
  const scheduler = armScheduler(service);
  await scheduler.plan();
  assert.equal(scheduler.armed, false);
  assert.equal(reads, 0);
  scheduler.stop();
  const report = await runDirectAlternative();
  assert.equal(report.fiveGetStrawman, false);
  assert.equal(report.steps.slice(0, -1).every((step) => step.exit === 0), true, JSON.stringify(report.steps));
  assert.equal(report.steps.at(-1).exit, 3);
  assert.equal(report.outcomes[0], "baseline_established");
  assert.equal(report.outcomes[1], "unchanged");
  assert.equal(report.outcomes[2], "content_changed");
  assert.equal(report.paidServiceLaunch, false);
  assert.equal(report.proposedManagedPrice, null);
  assert.ok(report.runtimeMs >= 0);
  assert.ok(report.storageBytes > 0);
});

test("disposable postgres reuses grant rows and does not write foundry invocations", async (t) => {
  const pgCluster = await startDisposablePg();
  const { createPostgresStore } = await import("../../vendor/visitor-foundry-receiver/services/correspondence/dist/store/postgres.js");
  const correspondence = await createPostgresStore(pgCluster.url, { schema: "pilot_correspondence" });
  await correspondence.close();
  const { default: Pg } = await import("pg");
  const pool = new Pg.Pool({ connectionString: pgCluster.url, max: 4 });
  pool.on("error", () => {});
  let store;
  t.after(async () => {
    const logPath = path.join(pgCluster.dir, "pg.log");
    if (store) await store.close().catch(() => {});
    await pool.end().catch(() => {});
    const log = await readFile(logPath, "utf8").catch(() => "");
    if (/FATAL|PANIC/.test(log)) process.stderr.write(log.slice(-1500));
    await pgCluster.stop();
  });
  const setup = await pool.connect();
  try {
    await setup.query("SET search_path TO pilot_correspondence");
    await setup.query("CREATE TABLE IF NOT EXISTS correspondence_vf04_invocations (id text primary key)");
  } finally {
    setup.release();
  }
  const hash = hashGrantToken(TOKEN);
  await pool.query(
    `INSERT INTO pilot_correspondence.correspondence_projects (id, title, summary, status, version, created_at, updated_at)
     VALUES ('projwatch1', 'watch', 'watch', 'open', 1, now(), now())`,
  );
  await pool.query(
    `INSERT INTO pilot_correspondence.correspondence_grants (id, project_id, role, token_hash, created_at)
     VALUES ('gr_owner', 'projwatch1', 'owner', $1, now())`,
    [hash],
  );
  store = await openPgWatchStore({ databaseUrl: pgCluster.url });
  const docs = await documents();
  let reads = 0;
  const service = createManagedWatch({
    store,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => {
      reads += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { document: docs.baseline, bytes: 20, calls: 1 };
    },
  });
  const other = createManagedWatch({
    store,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => {
      reads += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { document: docs.baseline, bytes: 20, calls: 1 };
    },
  });
  await service.enroll({ token: TOKEN, body: enrollment() });
  const raced = await Promise.all([service.runDueForGrant({ token: TOKEN }), other.runDueForGrant({ token: TOKEN })]);
  assert.equal(raced.filter((row) => row.read).length, 1);
  assert.equal(reads, 1);
  const invocations = await pool.query("SELECT count(*)::int AS n FROM pilot_correspondence.correspondence_vf04_invocations");
  const grants = await pool.query("SELECT count(*)::int AS n FROM pilot_correspondence.correspondence_grants");
  assert.equal(invocations.rows[0].n, 0);
  assert.equal(grants.rows[0].n, 1);
  const restarted = createManagedWatch({
    store,
    now: () => "2026-10-07T00:00:00.000Z",
    readSource: async () => { reads += 1; throw new Error("restart re-read"); },
  });
  const again = await restarted.retrieve({ token: TOKEN, taskId: "moltjobs-hold" });
  assert.equal(again.results[0].outcome, "baseline_established");
  assert.equal(reads, 1);
});

test("cold client retrieves a retained baseline from a different process", async (t) => {
  const docs = await documents();
  const dir = await mkdtemp(path.join(tmpdir(), "l12-client-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await openFileWatchStore(dir);
  await store.seedGrant({ id: "gr_owner", projectId: "projwatch1", role: "owner", tokenHash: hashGrantToken(TOKEN), expiresAt: null, revokedAt: null });
  let current = docs.baseline;
  const app = createSdsApp({
    managedWatch: {
      enabled: true,
      store,
      now: () => "2026-10-07T00:00:00.000Z",
      readSource: async () => ({ document: current, bytes: 30, calls: 1 }),
    },
  });
  const { server, port } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const tokenFile = path.join(dir, "grant.token");
  const bodyFile = path.join(dir, "body.json");
  await writeFile(tokenFile, `${TOKEN}\n`, { mode: 0o644 });
  await chmod(tokenFile, 0o600);
  await writeFile(bodyFile, JSON.stringify(enrollment()));
  const base = `http://127.0.0.1:${port}`;
  const run = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [client, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
  const enrolled = await run(["enroll", "--base", base, "--token-file", tokenFile, "--body-file", bodyFile]);
  assert.equal(enrolled.code, 0, enrolled.stderr + enrolled.stdout);
  const due = await run(["due", "--base", base, "--token-file", tokenFile]);
  assert.equal(due.code, 0, due.stderr + due.stdout);
  assert.equal(JSON.parse(due.stdout).json.results[0].outcome, "baseline_established");
  const got = await run(["get", "--base", base, "--token-file", tokenFile, "--task", "moltjobs-hold"]);
  assert.equal(got.code, 0, got.stderr);
  assert.equal(JSON.parse(got.stdout).json.results[0].outcome, "baseline_established");
  assert.equal(JSON.parse(got.stdout).json.costs.providerMarginalCostStatus, "unknown");
  await mkdir(path.join(dir, "loose"), { recursive: true });
  const loose = path.join(dir, "loose.token");
  await writeFile(loose, TOKEN);
  await chmod(loose, 0o644);
  const refused = await run(["get", "--base", base, "--token-file", loose, "--task", "moltjobs-hold"]);
  assert.equal(refused.code, 1);
});
