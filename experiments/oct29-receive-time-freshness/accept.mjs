import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashGrantToken } from "../../server/lib/managed-watch/limits.mjs";
import { readPinnedSnapshot } from "../../server/lib/managed-watch/source.mjs";
import { startDisposablePg } from "../../server/scripts/fixtures/disposable-pg.mjs";
import { deliveryIdFor, reportDigestFor } from "./recipient.mjs";
import {
  advanceClockFile,
  fetchPinnedThrough,
  publicLookup,
  readClockInstant,
  startSourceServer,
  writeClockFile,
  writeModeFile,
} from "./source-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const evidenceDir = path.join(here, "evidence");
const workDir = path.join(here, "evidence", "work");
const serviceMain = path.join(here, "service-main.mjs");
const recipientMain = path.join(here, "recipient.mjs");
const archivePath = path.join(root, "server/lib/managed-watch/pins/change-monitor-0.1.0.tgz");
const TOKEN = "h64331_receive_clock_token";
const PROJECT = "projfresh1";
const ORIGIN = "2026-10-29T18:00:00.000Z";
const EXPIRES = "2026-11-20T00:00:00.000Z";
const TASK = "receive-fresh";
const ARCHIVE_SHA = "a5248cac86ae604b365d95e3c21da5c15cd09f1a962428eb7d60b4c3b210100f";
const ARCHIVE_BYTES = 88319;

const evidence = {
  schema: "h64331.receive-time-freshness.v1",
  ok: false,
  startedAt: new Date().toISOString(),
  cases: {},
  rssKb: [],
  commands: [],
};
const log = [];
function note(line) {
  log.push(line);
  evidence.commands.push(line);
}

function httpJson(port, urlPath, { method = "GET", token, body } = {}) {
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

function spawnReady(script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      NODE_ENV: "test",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`not ready\n${out}\n${err}`)), 20_000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const match = out.match(/READY (\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`exit ${code || signal}\n${out}\n${err}`));
    });
  });
  return { child, ready, output: () => `${out}\n${err}` };
}

async function stopChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return null;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  const [code, signal] = await exited;
  clearTimeout(timer);
  return { code, signal };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { PATH: process.env.PATH || "" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enrollment(taskId, extra = {}) {
  return {
    taskId,
    source: { kind: "source-projection", scope: "source-projection:moltjobs" },
    predicate: "material-change",
    cadenceMs: 60_000,
    expiresAt: EXPIRES,
    budget: { maxChecks: 8, maxBodyBytes: 262_144, maxTimeMs: 8_000, maxOperations: 8, maxUsefulEvents: 4 },
    ...extra,
  };
}

function molt(document) {
  const slot = document.projection.sources.find((entry) => entry.sourceId === "moltjobs");
  return {
    state: slot.freshness.state,
    ageMs: slot.freshness.ageMs,
    fetchedAt: slot.freshness.fetchedAt,
    providerTimestamp: slot.freshness.providerTimestamp,
    projectionObservedAt: document.projection.observedAt,
  };
}

function sampleRss() {
  const rows = [];
  let names;
  try { names = readdirSync("/proc"); } catch { return null; }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const status = readFileSync(`/proc/${name}/status`, "utf8");
      const rss = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0);
      const cmd = readFileSync(`/proc/${name}/cmdline`, "utf8").replaceAll("\0", " ").slice(0, 160);
      if (/postgres|service-main|recipient\.mjs|accept\.mjs/.test(cmd)) {
        rows.push({ pid: Number(name), rssKb: rss, cmd });
      }
    } catch { /* process exited while reading */ }
  }
  const totalKb = rows.reduce((sum, row) => sum + row.rssKb, 0);
  evidence.rssKb.push({ at: new Date().toISOString(), totalKb, rows });
  return totalKb;
}

async function readLab(mode, now, extra = {}) {
  const before = evidence._requestCount;
  void before;
  return readPinnedSnapshot({
    timeoutMs: extra.timeoutMs || 4_000,
    maxBodyBytes: 262_144,
    now,
    signal: extra.signal,
    lookup: publicLookup,
    fetchImpl: (url, init) => fetchPinnedThrough(url, init, { port: extra.port, mode }),
  });
}

const children = [];
let pgCluster = null;
let pool = null;
let source = null;

try {
  await mkdir(workDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  const archive = await readFile(archivePath);
  const archiveSha = createHash("sha256").update(archive).digest("hex");
  assert.equal(archive.length, ARCHIVE_BYTES);
  assert.equal(archiveSha, ARCHIVE_SHA);
  note(`archive sha256 ${archiveSha} bytes ${archive.length}`);
  evidence.archive = { sha256: archiveSha, bytes: archive.length };

  const clockFile = path.join(workDir, "clock.json");
  const modeFile = path.join(workDir, "mode.json");
  writeClockFile(clockFile, ORIGIN);
  writeModeFile(modeFile, "fresh");
  source = await startSourceServer({ clock: () => readClockInstant(clockFile), delayMs: 400 });
  note(`source server 127.0.0.1:${source.port} delay 400`);

  const frozenAt = readClockInstant(clockFile);
  const frozenRead = await readLab("fresh", frozenAt, { port: source.port });
  const frozenBody = source.requests.at(-1);
  assert.equal(frozenRead.document?.capture, "injected");
  const frozenFresh = molt(frozenRead.document);
  assert.equal(frozenFresh.state, "clock_ahead");
  assert.ok(frozenFresh.ageMs < 0, JSON.stringify(frozenFresh));
  assert.equal(frozenRead.clocks.requestStartedAt, frozenAt);
  assert.equal(frozenRead.clocks.observedAt, frozenAt);
  assert.ok(Date.parse(frozenFresh.fetchedAt) > Date.parse(frozenAt));
  assert.equal(frozenRead.clocks.observedAt, frozenFresh.projectionObservedAt);
  note(`frozen ageMs ${frozenFresh.ageMs} state ${frozenFresh.state}`);

  const liveRead = await readLab("fresh", () => readClockInstant(clockFile), { port: source.port });
  const liveBody = source.requests.at(-1);
  const liveFresh = molt(liveRead.document);
  assert.equal(liveFresh.state, "fresh");
  assert.ok(liveFresh.ageMs >= 0 && liveFresh.ageMs <= 48 * 60 * 60 * 1000);
  assert.ok(Date.parse(liveFresh.fetchedAt) >= Date.parse(liveRead.clocks.requestStartedAt) + 40);
  assert.ok(Date.parse(liveRead.clocks.observedAt) >= Date.parse(liveFresh.fetchedAt));
  assert.equal(liveRead.clocks.observedAt, liveFresh.projectionObservedAt);
  assert.ok(Date.parse(liveRead.clocks.receivedAt) >= Date.parse(liveRead.clocks.observedAt));
  note(`receipt ageMs ${liveFresh.ageMs} state ${liveFresh.state}`);

  const futureRead = await readLab("future", () => readClockInstant(clockFile), { port: source.port });
  const futureFresh = molt(futureRead.document);
  assert.equal(futureFresh.state, "clock_ahead");
  assert.ok(futureFresh.ageMs < 0);
  assert.ok(Date.parse(futureRead.clocks.observedAt) > Date.parse(futureRead.clocks.requestStartedAt));
  note(`future ageMs ${futureFresh.ageMs} observedAfterStart true`);

  const staleRead = await readLab("stale", () => readClockInstant(clockFile), { port: source.port });
  const staleFresh = molt(staleRead.document);
  assert.equal(staleFresh.state, "stale");
  assert.ok(staleFresh.ageMs > 48 * 60 * 60 * 1000);

  const malformedRead = await readLab("malformed", () => readClockInstant(clockFile), { port: source.port });
  assert.equal(molt(malformedRead.document).state, "clock_unparsed");

  const partialRead = await readLab("partial", () => readClockInstant(clockFile), { port: source.port });
  assert.equal(molt(partialRead.document).state, "fresh");

  const httpRead = await readLab("http", () => readClockInstant(clockFile), { port: source.port });
  assert.equal(httpRead.failure?.code, "http");
  assert.equal(httpRead.document, undefined);

  const parseRead = await readLab("parse", () => readClockInstant(clockFile), { port: source.port });
  assert.equal(parseRead.failure?.code, "parse");

  const timeoutRead = await readLab("hold", () => readClockInstant(clockFile), { port: source.port, timeoutMs: 300 });
  assert.equal(timeoutRead.failure?.code, "timeout");

  const abort = new AbortController();
  const aborting = readLab("fresh", () => readClockInstant(clockFile), { port: source.port, signal: abort.signal });
  setTimeout(() => abort.abort(), 40);
  const aborted = await aborting;
  assert.equal(aborted.failure?.code, "cancelled");

  let privateHits = 0;
  await assert.rejects(readPinnedSnapshot({
    now: () => readClockInstant(clockFile),
    timeoutMs: 1000,
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async (url, init) => {
      privateHits += 1;
      return fetchPinnedThrough(url, init, { port: source.port, mode: "fresh" });
    },
  }), (error) => error.code === "ssrf");
  assert.equal(privateHits, 0);
  note("private lookup refused before fetch");

  evidence.cases.direct = {
    frozen: {
      clocks: frozenRead.clocks,
      freshness: frozenFresh,
      response: frozenBody.body,
    },
    receipt: {
      clocks: liveRead.clocks,
      freshness: liveFresh,
      response: liveBody.body,
    },
    future: { clocks: futureRead.clocks, freshness: futureFresh },
    stale: { ageMs: staleFresh.ageMs, state: staleFresh.state },
    malformed: molt(malformedRead.document).state,
    partialProjectionState: molt(partialRead.document).state,
    http: httpRead.failure.code,
    parse: parseRead.failure.code,
    timeout: timeoutRead.failure.code,
    cancelled: aborted.failure.code,
    privateHits,
  };

  pgCluster = await startDisposablePg();
  note(`disposable postgres port ${pgCluster.port}`);
  const { createPostgresStore } = await import("../../vendor/visitor-foundry-receiver/services/correspondence/dist/store/postgres.js");
  const correspondence = await createPostgresStore(pgCluster.url, { schema: "pilot_correspondence" });
  await correspondence.close();
  const { default: Pg } = await import("pg");
  pool = new Pg.Pool({ connectionString: pgCluster.url, max: 2 });
  pool.on("error", () => {});
  await pool.query(
    `INSERT INTO pilot_correspondence.correspondence_projects (id, title, summary, status, version, created_at, updated_at)
     VALUES ($1, 'receive-time', 'receive-time', 'open', 1, now(), now())`,
    [PROJECT],
  );
  await pool.query(
    `INSERT INTO pilot_correspondence.correspondence_grants (id, project_id, role, token_hash, created_at)
     VALUES ('gr_fresh', $1, 'owner', $2, now())`,
    [PROJECT, hashGrantToken(TOKEN)],
  );
  note("grant row inserted");

  const recipientDir = path.join(workDir, "recipient");
  let recipient = spawnReady(recipientMain, { RECIPIENT_DIR: recipientDir });
  children.push(recipient.child);
  const recipientPort = await recipient.ready;
  note(`recipient ready ${recipientPort}`);

  function startService(extra = {}) {
    const started = spawnReady(serviceMain, {
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CLOCK_FILE: clockFile,
      MODE_FILE: modeFile,
      SOURCE_PORT: String(source.port),
      ...extra,
    });
    children.push(started.child);
    return started;
  }

  async function enroll(port, taskId, extra) {
    const response = await httpJson(port, "/api/managed-watch/enrollments", {
      method: "POST",
      token: TOKEN,
      body: enrollment(taskId, extra),
    });
    assert.equal(response.status, 201, response.text);
    return response.json;
  }

  async function due(port) {
    return httpJson(port, "/api/managed-watch/due", { method: "POST", token: TOKEN, body: {} });
  }

  async function retrieve(port, taskId) {
    const response = await httpJson(port, `/api/managed-watch/enrollments/${taskId}`, { token: TOKEN });
    assert.equal(response.status, 200, response.text);
    return response.json;
  }

  async function watchDocument(taskId) {
    const result = await pool.query(
      `SELECT document FROM pilot_correspondence.correspondence_l12_managed_watch
       WHERE project_id = $1 AND task_id = $2`,
      [PROJECT, taskId],
    );
    return result.rows[0]?.document || null;
  }

  let service = startService();
  const servicePort = await service.ready;
  const health = await httpJson(servicePort, "/api/managed-watch/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.json.paidServiceLaunch, false);
  assert.equal(health.json.scheduler.enabled, false);
  assert.equal(health.json.scheduler.armed, false);
  note("service mounted scheduler disarmed paidServiceLaunch false");

  await enroll(servicePort, TASK);
  writeModeFile(modeFile, "fresh");
  const beforeBaseline = source.requests.length;
  const baselineDue = await due(servicePort);
  assert.equal(baselineDue.status, 200, baselineDue.text);
  assert.equal(baselineDue.json.action, "completed");
  assert.equal(baselineDue.json.results[0].outcome, "baseline_established");
  assert.equal(baselineDue.json.results[0].usefulChange, false);
  assert.equal(baselineDue.json.results[0].publicSourceChanged, false);
  assert.equal(baselineDue.json.watch.costs.sourceCalls, 1);
  assert.equal(source.requests.length, beforeBaseline + 1);
  const baselineReport = baselineDue.json.results[0];
  const baselinePost = await postReport(recipientPort, TASK, baselineReport);
  assert.equal(baselinePost.response.status, 200);
  assert.equal(baselinePost.response.json.duplicate, false);

  advanceClockFile(clockFile, 61_000);
  writeModeFile(modeFile, "changed");
  const beforeChanged = source.requests.length;
  const changedDue = await due(servicePort);
  assert.equal(changedDue.status, 200, changedDue.text);
  assert.equal(changedDue.json.results[0].outcome, "content_changed");
  assert.equal(changedDue.json.results[0].usefulChange, true);
  assert.equal(changedDue.json.results[0].publicSourceChanged, false);
  assert.equal(changedDue.json.watch.costs.sourceCalls, 2);
  assert.equal(source.requests.length, beforeChanged + 1);
  const changedReport = changedDue.json.results[0];
  const dropped = await postReport(recipientPort, TASK, changedReport, { drop: true });
  assert.equal(dropped.response, null);
  const readback = await httpJson(recipientPort, `/v1/deliveries/${dropped.deliveryId}`);
  assert.equal(readback.status, 200, readback.text);
  assert.equal(readback.json.deliveryId, dropped.deliveryId);
  assert.equal(readback.json.reportDigest, dropped.reportDigest);
  assert.equal(readback.json.httpAcknowledged, false);
  assert.equal(readback.json.adoptedFrom, "readback");
  assert.equal(readback.json.usefulAcceptance, "accepted");
  note(`lost response readback ${dropped.deliveryId.slice(0, 12)}`);

  const beforeRestart = await watchDocument(TASK);
  const eventIds = Object.keys(beforeRestart.monitorState.events || {}).sort();
  const deliveryIds = Object.keys(beforeRestart.monitorState.deliveries || {}).sort();
  assert.ok(eventIds.length >= 1);
  assert.deepEqual(deliveryIds, eventIds);

  await stopChild(recipient.child);
  recipient = spawnReady(recipientMain, { RECIPIENT_DIR: recipientDir });
  children.push(recipient.child);
  const recipientPort2 = await recipient.ready;
  const afterRecipient = await httpJson(recipientPort2, `/v1/deliveries/${dropped.deliveryId}`);
  assert.equal(afterRecipient.json.deliveryId, dropped.deliveryId);
  assert.equal(afterRecipient.json.reportDigest, dropped.reportDigest);
  const again = await postReport(recipientPort2, TASK, changedReport);
  assert.equal(again.response.json.duplicate, true);
  assert.equal(again.response.json.duplicateCount, 1);
  note("recipient restart retained the delivery id");

  const callsBeforeRestart = (await retrieve(servicePort, TASK)).costs.sourceCalls;
  await stopChild(service.child);
  service = startService();
  const restartedPort = await service.ready;
  const retained = await retrieve(restartedPort, TASK);
  assert.equal(retained.costs.sourceCalls, callsBeforeRestart);
  assert.equal(retained.results.length, 2);
  assert.equal(retained.results[0].outcome, "baseline_established");
  assert.equal(retained.results[1].outcome, "content_changed");
  assert.equal(retained.results[1].usefulChange, true);
  const beforeIdle = source.requests.length;
  const idle = await due(restartedPort);
  assert.equal(idle.json.action, "idle");
  assert.equal(idle.json.read, false);
  assert.equal(source.requests.length, beforeIdle);
  const afterIdle = await retrieve(restartedPort, TASK);
  assert.equal(afterIdle.costs.sourceCalls, 2);
  const afterService = await watchDocument(TASK);
  assert.deepEqual(Object.keys(afterService.monitorState.events || {}).sort(), eventIds);
  assert.deepEqual(Object.keys(afterService.monitorState.deliveries || {}).sort(), deliveryIds);
  note("service restart retained results and did not refetch");

  await stopChild(service.child);
  await pool.end();
  pool = null;
  const dataDir = path.join(pgCluster.dir, "pg");
  const restartedPg = await run("/usr/lib/postgresql/16/bin/pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "-t", "20", "restart"]);
  assert.equal(restartedPg.code, 0, restartedPg.stderr);
  note("postgres restarted");
  pool = new Pg.Pool({ connectionString: pgCluster.url, max: 2 });
  pool.on("error", () => {});
  service = startService();
  const portAfterPg = await service.ready;
  const afterPg = await retrieve(portAfterPg, TASK);
  assert.equal(afterPg.costs.sourceCalls, 2);
  assert.equal(afterPg.results[1].outcome, "content_changed");
  assert.equal(afterPg.results[1].operationId, changedReport.operationId);
  const docAfterPg = await watchDocument(TASK);
  assert.deepEqual(Object.keys(docAfterPg.monitorState.events || {}).sort(), eventIds);
  note("postgres readback retained the same result");

  writeModeFile(modeFile, "future");
  await enroll(portAfterPg, "future-stamp");
  const futureDue = await due(portAfterPg);
  assert.equal(futureDue.status, 200, futureDue.text);
  assert.equal(futureDue.json.watch.taskId, "future-stamp");
  assert.equal(futureDue.json.results[0].failureCode, "freshness_clock_ahead");
  assert.equal(futureDue.json.results[0].usefulChange, false);
  assert.equal(futureDue.json.results[0].outcome, "evidence_unavailable");
  writeModeFile(modeFile, "partial");
  await enroll(portAfterPg, "partial-metrics");
  const partialDue = await due(portAfterPg);
  assert.equal(partialDue.status, 200, partialDue.text);
  assert.equal(partialDue.json.watch.taskId, "partial-metrics");
  assert.equal(partialDue.json.results[0].failureCode, "partial_metrics");
  assert.equal(partialDue.json.results[0].usefulChange, false);
  assert.equal(partialDue.json.results[0].outcome, "evidence_unavailable");
  note("mounted future and partial metrics stay refused");

  writeModeFile(modeFile, "fetched");
  await enroll(portAfterPg, "crash-fetched");
  await stopChild(service.child);
  const crashing = startService({ CRASH_AFTER: "fetched" });
  const crashPort = await crashing.ready;
  const beforeFetched = source.requests.filter((row) => row.mode === "fetched").length;
  const crashed = once(crashing.child, "exit");
  await assert.rejects(due(crashPort));
  const [crashCode, crashSignal] = await crashed;
  assert.equal(crashSignal, "SIGKILL", `code ${crashCode}`);
  await sleep(500);
  assert.equal(source.requests.filter((row) => row.mode === "fetched").length, beforeFetched + 1);
  const pendingFetched = await watchDocument("crash-fetched");
  assert.equal(pendingFetched.pending.phase, "fetched");
  assert.ok(pendingFetched.pending.document);
  const originalFetchedAt = pendingFetched.pending.document.projection.sources
    .find((entry) => entry.sourceId === "moltjobs").freshness.fetchedAt;
  const originalObservedAt = pendingFetched.pending.document.projection.observedAt;
  const fetchedCalls = pendingFetched.costs.sourceCalls;
  advanceClockFile(clockFile, 5_000);
  service = startService();
  const recoverPort = await service.ready;
  const beforeRecover = source.requests.length;
  const recoveredDue = await due(recoverPort);
  assert.equal(recoveredDue.json.action, "idle");
  assert.equal(source.requests.length, beforeRecover);
  const recovered = await retrieve(recoverPort, "crash-fetched");
  assert.equal(recovered.costs.sourceCalls, fetchedCalls);
  assert.equal(recovered.results.at(-1).outcome, "baseline_established");
  assert.ok(Date.parse(recovered.results.at(-1).at) > Date.parse(originalObservedAt));
  const recoveredDoc = await watchDocument("crash-fetched");
  assert.equal(recoveredDoc.pending, null);
  const kept = Object.values(recoveredDoc.monitorState.evidence).find((row) => row.nonSemantic?.fetchedAt === originalFetchedAt);
  assert.ok(kept, "original fetchedAt was rewritten");
  assert.equal(kept.nonSemantic.fetchedAt, originalFetchedAt);
  note("pending fetch recovered at a new instant without rewriting fetchedAt");

  writeModeFile(modeFile, "lost");
  await enroll(recoverPort, "crash-reading");
  await stopChild(service.child);
  const dying = startService({ CRASH_DURING: "1" });
  const dyingPort = await dying.ready;
  const beforeLost = source.requests.filter((row) => row.mode === "lost").length;
  const died = once(dying.child, "exit");
  await assert.rejects(due(dyingPort));
  const [, lostSignal] = await died;
  assert.equal(lostSignal, "SIGKILL");
  await sleep(700);
  const lostSeen = source.requests.filter((row) => row.mode === "lost").length;
  assert.equal(lostSeen, beforeLost + 1);
  const pendingLost = await watchDocument("crash-reading");
  assert.equal(pendingLost.pending.phase, "reading");
  assert.equal(pendingLost.pending.document, null);
  advanceClockFile(clockFile, 5_000);
  service = startService();
  const lostPort = await service.ready;
  const beforeLostRecover = source.requests.filter((row) => row.mode === "lost").length;
  const lostDue = await due(lostPort);
  assert.equal(lostDue.json.action, "idle");
  assert.equal(source.requests.filter((row) => row.mode === "lost").length, beforeLostRecover);
  const lostRow = await retrieve(lostPort, "crash-reading");
  assert.equal(lostRow.results.at(-1).outcome, "unknown");
  assert.equal(lostRow.results.at(-1).failureCode, "lost_reply_no_body");
  assert.equal(lostRow.results.at(-1).usefulChange, false);
  assert.equal(lostRow.costs.sourceCalls, 1);
  const still = await retrieve(lostPort, TASK);
  assert.equal(still.costs.sourceCalls, 2);
  assert.equal(still.results[1].operationId, changedReport.operationId);
  const baselineStill = await httpJson(recipientPort2, `/v1/deliveries/${baselinePost.deliveryId}`);
  const changedStill = await httpJson(recipientPort2, `/v1/deliveries/${dropped.deliveryId}`);
  assert.equal(baselineStill.json.deliveryId, baselinePost.deliveryId);
  assert.equal(changedStill.json.deliveryId, dropped.deliveryId);
  assert.equal(changedStill.json.reportDigest, dropped.reportDigest);
  const finalDoc = await watchDocument(TASK);
  assert.deepEqual(Object.keys(finalDoc.monitorState.events || {}).sort(), eventIds);
  note("lost reply did not refetch and old delivery ids remain");

  const rss = sampleRss();
  assert.ok(rss == null || rss < 1_500_000, `spawned rss ${rss}`);
  evidence.cases.installed = {
    baseline: { outcome: baselineReport.outcome, usefulChange: false, at: baselineReport.at, operationId: baselineReport.operationId },
    changed: { outcome: changedReport.outcome, usefulChange: true, at: changedReport.at, operationId: changedReport.operationId },
    eventIds,
    recipient: {
      baselineDeliveryId: baselinePost.deliveryId,
      changedDeliveryId: dropped.deliveryId,
      reportDigest: dropped.reportDigest,
      adoptedFrom: "readback",
      duplicateCount: 1,
    },
    recoveredFetchedAt: originalFetchedAt,
    recoveredClassificationAt: recovered.results.at(-1).at,
    lostReply: lostRow.results.at(-1),
    sourceCalls: still.costs.sourceCalls,
  };
  evidence.ok = true;
  note("acceptance ok");
} catch (error) {
  evidence.ok = false;
  evidence.error = { message: error.message, stack: String(error.stack || "").slice(0, 4000) };
  note(`FAIL ${error.message}`);
} finally {
  evidence.finishedAt = new Date().toISOString();
  await mkdir(evidenceDir, { recursive: true }).catch(() => {});
  await writeFile(path.join(evidenceDir, "acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(path.join(evidenceDir, "commands.log"), `${log.join("\n")}\n`);
  if (evidence.cases.direct) {
    await writeFile(path.join(evidenceDir, "delayed-response.json"), `${JSON.stringify({
      frozen: evidence.cases.direct.frozen,
      receipt: evidence.cases.direct.receipt,
      future: evidence.cases.direct.future,
    }, null, 2)}\n`);
    await writeFile(path.join(evidenceDir, "clocks.json"), `${JSON.stringify({
      frozen: evidence.cases.direct.frozen.clocks,
      frozenFreshness: evidence.cases.direct.frozen.freshness,
      receipt: evidence.cases.direct.receipt.clocks,
      receiptFreshness: evidence.cases.direct.receipt.freshness,
      future: evidence.cases.direct.future,
    }, null, 2)}\n`);
  }
  if (source) await source.close().catch(() => {});
  for (const child of children) await stopChild(child).catch(() => {});
  if (pool) await pool.end().catch(() => {});
  if (pgCluster) await pgCluster.stop().catch(() => {});
}

function postReport(port, taskId, report, { drop = false } = {}) {
  const deliveryId = deliveryIdFor(report);
  const reportDigest = reportDigestFor(report);
  const urlPath = `/v1/deliveries${drop ? "?drop=1" : ""}`;
  return httpJson(port, urlPath, {
    method: "POST",
    body: { deliveryId, reportDigest, taskId, report },
  }).then(
    (response) => ({ response, deliveryId, reportDigest }),
    (error) => {
      if (!drop) throw error;
      return { response: null, deliveryId, reportDigest, error: error.message };
    },
  );
}

if (!evidence.ok) process.exit(1);
