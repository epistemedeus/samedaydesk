// Actual GET /api/tools/ai-readiness handler plus the configured pulse store.
// Loopback and TEST-NET only. No live host, paid API, or production database.
import assert from "node:assert/strict";
import http from "node:http";
import dnsCb from "node:dns";
import dnsPromises from "node:dns/promises";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe, before, after } from "node:test";
import express from "express";
import { emptyDelta, deltaToRpcPayload, validateDelta } from "../lib/pulse-store/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pulseTempDir = mkdtempSync(join(tmpdir(), "h145010-pulse-"));
const pulseFile = join(pulseTempDir, "pulse.json");
process.env.PULSE_FILE = pulseFile;
process.env.PULSE_TOKEN = "h145010-test-token";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

const {
  configurePulseStoreForTests,
  flushPulseSnapshot,
  pulseMiddleware,
  pulseSnapshot,
  __pulseTestInternals,
} = await import("../lib/pulse.js");
const { default: toolsRouter } = await import("../routes/tools.js");
const { default: pulseRouter } = await import("../routes/pulse.js");

__pulseTestInternals().stopScheduledFlush();

const FIXTURE_IP = "203.0.113.10";
const HOST = "h145010-loop.example";
const SECRET_PATH = "/h145010-secret-path";
const TARGET = `http://${HOST}${SECRET_PATH}`;
const PAGE = `<!doctype html><html lang="en"><head>
<title>Fixture readiness title ok</title>
<meta name="description" content="Fixture description text for the free checker meta rule, sized to pass the length bounds.">
<meta property="og:title" content="Fixture"><meta property="og:description" content="Fixture description text for the free checker."><meta property="og:url" content="http://fixture.test/">
<script type="application/ld+json">{"@type":"Organization","name":"Fixture"}</script>
</head><body><h1>Fixture</h1><p>Useful checker fixture page.</p></body></html>`;

function resetPulse(name) {
  configurePulseStoreForTests({
    forceFallback: true,
    fallbackFile: join(pulseTempDir, `${name}.fallback.json`),
    autoHydrate: true,
  });
  __pulseTestInternals().setFreeToolFault(null);
}

function assertUnobserved() {
  const view = pulseSnapshot().freeTool;
  assert.equal(view.coverage, "unknown");
  assert.equal(view.requests, null);
  assert.equal(view.outcomes, null);
  assert.equal(view.callers, null);
  assert.equal(view.complete, false);
  assert.equal(view.reportedAcquisition, "not_stored_here");
  assert.equal(view.observedFrom, null);
}

function assertPartition(view) {
  const outcomes = Object.values(view.outcomes).reduce((sum, value) => sum + value, 0);
  const callers = Object.values(view.callers).reduce((sum, value) => sum + value, 0);
  assert.equal(outcomes, view.requests);
  assert.equal(callers, view.requests);
  assert.equal(view.complete, false);
  assert.equal(view.coverage, "lower_bound_from_first_observation");
  assert.equal(view.reportedAcquisition, "not_stored_here");
  assert.match(view.observedFrom, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}

function acquisition() {
  const snap = pulseSnapshot();
  return {
    total: snap.total,
    humans: snap.humans,
    bots: snap.bots,
    aiCrawlers: snap.aiCrawlers,
    funnel: { ...snap.funnel },
    byPath: { ...snap.byPath },
    byReferer: { ...snap.byReferer },
    briefs: snap.sellerRepair.briefViews,
  };
}

function assertNoCheckedTarget(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("h145010-secret-path"), false);
  assert.equal(text.includes(HOST), false);
  assert.equal(text.includes("h145010-missing.invalid"), false);
}

function installLookup(resolve) {
  const prevPromise = dnsPromises.lookup;
  const prevCb = dnsCb.lookup;
  const answer = (hostname, all) => {
    const found = resolve(String(hostname));
    if (found.error) return { error: found.error };
    return all ? { addresses: [{ address: found.address, family: 4 }] } : { address: found.address, family: 4 };
  };
  dnsPromises.lookup = async (hostname) => {
    const found = answer(hostname, true);
    if (found.error) throw found.error;
    return found.addresses;
  };
  dnsCb.lookup = (hostname, options, callback) => {
    let cb = callback;
    let opts = options;
    if (typeof options === "function") {
      cb = options;
      opts = {};
    }
    if (typeof opts === "number") opts = { family: opts };
    const found = answer(hostname, Boolean(opts?.all));
    if (found.error) cb(found.error);
    else if (opts?.all) cb(null, found.addresses);
    else cb(null, found.address, found.family);
  };
  return {
    restore() {
      dnsPromises.lookup = prevPromise;
      dnsCb.lookup = prevCb;
    },
  };
}

function publicLookup() {
  return installLookup(() => ({ address: FIXTURE_IP }));
}

function enotfoundLookup() {
  return installLookup(() => {
    const error = new Error("getaddrinfo ENOTFOUND");
    error.code = "ENOTFOUND";
    return { error };
  });
}

function wireAddress(address, port) {
  const { TCP } = process.binding("tcp_wrap");
  const originals = { connect: TCP.prototype.connect, connect6: TCP.prototype.connect6 };
  const attempts = [];
  for (const method of Object.keys(originals)) {
    TCP.prototype[method] = function (request, addr, destPort) {
      if (addr === address) {
        attempts.push({ address: addr, port: destPort });
        return originals.connect.call(this, request, "127.0.0.1", port);
      }
      return originals[method].call(this, request, addr, destPort);
    };
  }
  return {
    attempts,
    restore() { Object.assign(TCP.prototype, originals); },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function reserveClosedPort() {
  const server = http.createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

function fixtureServer() {
  const hits = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === SECRET_PATH) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (req.url === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end("<urlset></urlset>");
      return;
    }
    if (req.url === "/llms.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("fixture llms");
      return;
    }
    res.writeHead(404);
    res.end("missing");
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return { server, hits, sockets };
}

function hangingServer() {
  const sockets = new Set();
  let connections = 0;
  const server = http.createServer(() => {});
  server.on("connection", (socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return {
    server,
    sockets,
    get connections() { return connections; },
  };
}

function requestOnce(port, path, { method = "GET", headers = undefined, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        if (text) {
          try { json = JSON.parse(text); } catch { json = null; }
        }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (body == null) req.end();
    else req.end(body);
  });
}

function checkPath(rawUrl) {
  return `/api/tools/ai-readiness?url=${encodeURIComponent(rawUrl)}`;
}

async function waitUntil(fn, ms = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("waitUntil timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("free-tool terminal outcomes", { concurrency: false }, () => {
  let api;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(pulseMiddleware);
    app.use("/api/tools", toolsRouter);
    app.use("/api/pulse", pulseRouter);
    api = http.createServer(app);
    await listen(api);
  });

  after(async () => {
    await closeServer(api);
    rmSync(pulseTempDir, { recursive: true, force: true });
  });

  test("ordinary deltas omit the field and a broken partition is rejected", () => {
    const at = "2026-11-04T03:45:00.000Z";
    const ordinary = emptyDelta(at);
    assert.equal(Object.hasOwn(ordinary, "freeToolOutcomes"), false);
    assert.equal(Object.hasOwn(validateDelta(ordinary), "freeToolOutcomes"), false);
    assert.equal(Object.hasOwn(deltaToRpcPayload(ordinary), "freeToolOutcomes"), false);
    const broken = emptyDelta(at);
    broken.freeToolOutcomes = {
      observedFrom: at,
      requests: 1,
      outcomes: { completed: 2, invalid_host: 0, unreachable: 0, timeout: 0, abandoned: 0, other_failure: 0 },
      callers: { human: 1, bot: 0, ai: 0, unknown: 0 },
    };
    assert.throws(() => validateDelta(broken), /pulse_invalid_field:freeToolOutcomes/);
    assert.equal(pulseSnapshot().classificationSchemaVersion, 2);
  });

  test("a completed check counts once per caller and not once per downstream fetch", async () => {
    resetPulse("completed");
    assertUnobserved();
    const before = acquisition();
    const fixture = fixtureServer();
    const port = await listen(fixture.server);
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, port);
    const callers = [
      ["Mozilla/5.0 (compatible; H145010Test)", "human"],
      ["curl/8.5.0", "bot"],
      ["GPTBot/1.0", "ai"],
      ["", "unknown"],
    ];
    try {
      const first = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": callers[0][0], accept: "application/json" },
      });
      assert.equal(first.status, 200);
      assert.equal(typeof first.json.score, "number");
      assert.ok(Array.isArray(first.json.checks));
      assert.equal(first.json.url.includes(SECRET_PATH), true);
      assert.deepEqual(fixture.hits.map((hit) => hit.split("?")[0]).sort(), [
        SECRET_PATH, "/llms.txt", "/robots.txt", "/sitemap.xml",
      ].sort());
      for (const [ua, caller] of callers.slice(1)) {
        const response = await requestOnce(api.address().port, checkPath(TARGET), {
          headers: { "user-agent": ua, accept: "application/json" },
        });
        assert.equal(response.status, 200, caller);
      }
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 4);
      assert.equal(view.outcomes.completed, 4);
      assert.equal(view.outcomes.invalid_host, 0);
      assert.equal(view.outcomes.unreachable, 0);
      assert.equal(view.outcomes.timeout, 0);
      assert.equal(view.outcomes.abandoned, 0);
      assert.equal(view.outcomes.other_failure, 0);
      for (const [, caller] of callers) assert.equal(view.callers[caller], 1, caller);
      assertPartition(view);
      assert.equal(fixture.hits.length, 16);
      assert.deepEqual(acquisition(), before);
      assertNoCheckedTarget(pulseSnapshot());
      const recent = pulseSnapshot().recent.filter((event) => event.kind === "freeTool");
      assert.equal(recent.length, 4);
      assert.deepEqual(recent.map((event) => event.p), Array(4).fill("/api/tools/ai-readiness"));
      const readback = await requestOnce(api.address().port, "/api/pulse?k=h145010-test-token");
      assert.equal(readback.status, 200);
      assert.equal(readback.json.freeTool.requests, 4);
      assert.equal(readback.json.freeTool.outcomes.completed, 4);
      assertNoCheckedTarget(readback.json);
    } finally {
      wiring.restore();
      lookup.restore();
      await closeServer(fixture.server);
    }
  });

  test("invalid host, missing URL, unknown route, and preflight are not success", async () => {
    resetPulse("invalid");
    const before = acquisition();
    const lookup = enotfoundLookup();
    try {
      const missing = await requestOnce(api.address().port, "/api/tools/ai-readiness");
      assert.equal(missing.status, 400);
      assert.equal(missing.json.error, "Enter a website URL");
      const unresolved = await requestOnce(api.address().port, checkPath("http://h145010-missing.invalid/h145010-secret-path"));
      assert.equal(unresolved.status, 400);
      assert.equal(unresolved.json.error, "Could not resolve that domain");
      const literal = await requestOnce(api.address().port, checkPath("http://127.0.0.1/h145010-secret-path"));
      assert.equal(literal.status, 400);
      assert.equal(literal.json.error, "That address isn't reachable for a public check");
      const nope = await requestOnce(api.address().port, "/api/tools/nope");
      assert.equal(nope.status, 404);
      const preflight = await requestOnce(api.address().port, "/api/tools/ai-readiness", { method: "OPTIONS" });
      assert.equal(preflight.status, 204);
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 3);
      assert.equal(view.outcomes.completed, 0);
      assert.equal(view.outcomes.invalid_host, 2);
      assert.equal(view.outcomes.other_failure, 1);
      assertPartition(view);
      assert.deepEqual(acquisition(), before);
      assertNoCheckedTarget(pulseSnapshot());
    } finally {
      lookup.restore();
    }
  });

  test("an unreachable public host is not completed", async () => {
    resetPulse("unreachable");
    const closed = await reserveClosedPort();
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, closed);
    try {
      const response = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      assert.equal(response.status, 502);
      assert.equal(response.json.error, "Could not reach that site");
      assert.ok(wiring.attempts.length >= 1);
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 1);
      assert.equal(view.outcomes.unreachable, 1);
      assert.equal(view.outcomes.completed, 0);
      assert.equal(view.callers.human, 1);
      assertPartition(view);
    } finally {
      wiring.restore();
      lookup.restore();
    }
  });

  test("a hung target is a timeout and the fixture accepted the socket", { timeout: 25_000 }, async () => {
    resetPulse("timeout");
    const hanging = hangingServer();
    const port = await listen(hanging.server);
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, port);
    const started = Date.now();
    try {
      const response = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      const elapsed = Date.now() - started;
      assert.equal(response.status, 502);
      assert.equal(response.json.error, "The site took too long to respond");
      assert.ok(elapsed >= 9_000, `elapsed ${elapsed}`);
      assert.ok(hanging.connections >= 1);
      assert.ok(wiring.attempts.length >= 1);
      const view = pulseSnapshot().freeTool;
      assert.equal(view.outcomes.timeout, 1);
      assert.equal(view.outcomes.completed, 0);
      assert.equal(view.outcomes.unreachable, 0);
      assertPartition(view);
    } finally {
      for (const socket of hanging.sockets) socket.destroy();
      wiring.restore();
      lookup.restore();
      await closeServer(hanging.server);
    }
  });

  test("client disconnect during the check is abandoned and a later fetch error is ignored", async () => {
    resetPulse("abandoned");
    const hanging = hangingServer();
    const port = await listen(hanging.server);
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, port);
    try {
      const req = http.request({
        hostname: "127.0.0.1",
        port: api.address().port,
        path: checkPath(TARGET),
        method: "GET",
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      const settled = new Promise((resolve) => {
        req.on("response", (res) => { res.resume(); res.on("end", () => resolve("response")); });
        req.on("error", () => resolve("error"));
      });
      req.end();
      await waitUntil(() => hanging.connections >= 1);
      req.destroy();
      await waitUntil(() => pulseSnapshot().freeTool.outcomes?.abandoned === 1);
      for (const socket of hanging.sockets) socket.destroy();
      await settled;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 1);
      assert.equal(view.outcomes.abandoned, 1);
      assert.equal(view.outcomes.completed, 0);
      assert.equal(view.outcomes.unreachable, 0);
      assert.equal(view.outcomes.timeout, 0);
      assertPartition(view);
    } finally {
      for (const socket of hanging.sockets) socket.destroy();
      wiring.restore();
      lookup.restore();
      await closeServer(hanging.server);
    }
  });

  test("duplicate browser completion events do not count and seller repair still records", async () => {
    resetPulse("duplicate-client");
    const secretBody = JSON.stringify({
      event: "tool_check_done",
      props: { url: TARGET, prompt: "h145010-secret-path" },
    });
    const first = await requestOnce(api.address().port, "/api/pulse/event", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(secretBody) },
      body: secretBody,
    });
    const second = await requestOnce(api.address().port, "/api/pulse/event", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(secretBody) },
      body: secretBody,
    });
    assert.equal(first.status, 400);
    assert.equal(second.status, 400);
    assertUnobserved();
    assertNoCheckedTarget(pulseSnapshot());
    const repair = JSON.stringify({
      event: "seller_repair_brief_viewed",
      props: { finding_id: "hypernatt-liq-radar-20260830", route_class: "paid_get" },
    });
    const accepted = await requestOnce(api.address().port, "/api/pulse/event", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(repair) },
      body: repair,
    });
    assert.equal(accepted.status, 204);
    assert.equal(pulseSnapshot().sellerRepair.briefViews, 1);
    assertUnobserved();
  });

  test("a page view is acquisition and not a free-tool execution", async () => {
    resetPulse("page-view");
    const response = await requestOnce(api.address().port, "/tools/ai-readiness", {
      headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
    });
    assert.equal(response.status, 404);
    const snap = pulseSnapshot();
    assert.equal(snap.humans, 1);
    assert.equal(snap.funnel.tools, 1);
    assert.equal(snap.total, 1);
    assertUnobserved();
  });

  test("telemetry failure still returns the useful check and does not invent success", async () => {
    resetPulse("telemetry-fault");
    const fixture = fixtureServer();
    const port = await listen(fixture.server);
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, port);
    try {
      __pulseTestInternals().failNextFreeToolObservation();
      const failed = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      assert.equal(failed.status, 200);
      assert.equal(typeof failed.json.score, "number");
      assertUnobserved();
      const next = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      assert.equal(next.status, 200);
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 1);
      assert.equal(view.outcomes.completed, 1);
      assert.equal(view.outcomes.abandoned, 0);
      assertPartition(view);
      assert.equal(fixture.hits.length, 8);
    } finally {
      wiring.restore();
      lookup.restore();
      await closeServer(fixture.server);
    }
  });

  test("concurrent success and invalid host each count once", async () => {
    resetPulse("concurrent");
    const fixture = fixtureServer();
    const port = await listen(fixture.server);
    const lookup = installLookup((hostname) => {
      if (hostname.endsWith(".invalid")) {
        const error = new Error("getaddrinfo ENOTFOUND");
        error.code = "ENOTFOUND";
        return { error };
      }
      return { address: FIXTURE_IP };
    });
    const wiring = wireAddress(FIXTURE_IP, port);
    try {
      const [ok, bad] = await Promise.all([
        requestOnce(api.address().port, checkPath(TARGET), {
          headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
        }),
        requestOnce(api.address().port, checkPath("http://h145010-missing.invalid/h145010-secret-path"), {
          headers: { "user-agent": "curl/8.5.0" },
        }),
      ]);
      assert.equal(ok.status, 200);
      assert.equal(bad.status, 400);
      assert.equal(bad.json.error, "Could not resolve that domain");
      const view = pulseSnapshot().freeTool;
      assert.equal(view.requests, 2);
      assert.equal(view.outcomes.completed, 1);
      assert.equal(view.outcomes.invalid_host, 1);
      assert.equal(view.callers.human, 1);
      assert.equal(view.callers.bot, 1);
      assertPartition(view);
      assert.equal(fixture.hits.length, 4);
      assertNoCheckedTarget(pulseSnapshot());
    } finally {
      wiring.restore();
      lookup.restore();
      await closeServer(fixture.server);
    }
  });

  test("a flushed handler result is readable by a restarted process", async () => {
    configurePulseStoreForTests({
      forceFallback: true,
      fallbackFile: `${pulseFile}.fallback.json`,
      autoHydrate: true,
    });
    __pulseTestInternals().setFreeToolFault(null);
    const fixture = fixtureServer();
    const port = await listen(fixture.server);
    const lookup = publicLookup();
    const wiring = wireAddress(FIXTURE_IP, port);
    try {
      const response = await requestOnce(api.address().port, checkPath(TARGET), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; H145010Test)" },
      });
      assert.equal(response.status, 200);
      assert.equal(typeof response.json.score, "number");
      assert.equal(flushPulseSnapshot(), true);
      assert.equal(pulseSnapshot().freeTool.requests, 1);
      assert.equal(pulseSnapshot().freeTool.outcomes.abandoned, 0);
      const wal = JSON.parse(readFileSync(`${pulseFile}.fallback.json`, "utf8"));
      assert.equal(wal.pendingFlushes[0].delta.freeToolOutcomes.outcomes.completed, 1);
      assert.equal(Object.hasOwn(wal.pendingFlushes[0].delta, "freeToolOutcomes"), true);
      assertNoCheckedTarget(wal);
      const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
      const env = { ...process.env, PULSE_FILE: pulseFile, PULSE_TOKEN: "h145010-test-token" };
      delete env.SUPABASE_URL;
      delete env.SUPABASE_SERVICE_ROLE_KEY;
      delete env.SUPABASE_ANON_KEY;
      const reader = spawnSync(process.execPath, [
        "--input-type=module",
        "-e",
        `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
          `console.log(JSON.stringify(pulseSnapshot().freeTool));`,
      ], { env, encoding: "utf8", timeout: 15_000 });
      assert.equal(reader.status, 0, reader.stderr || reader.stdout);
      const view = JSON.parse(reader.stdout.trim().split("\n").pop());
      assert.equal(view.requests, 1);
      assert.equal(view.outcomes.completed, 1);
      assert.equal(view.callers.human, 1);
      assert.equal(view.coverage, "lower_bound_from_first_observation");
      assertNoCheckedTarget(view);
    } finally {
      wiring.restore();
      lookup.restore();
      await closeServer(fixture.server);
    }
  });

  test("PostgreSQL 16 accepts an old delta, merges outcomes, restarts, and rejects a bad partition", { timeout: 120_000 }, async (t) => {
    const initdb = "/usr/lib/postgresql/16/bin/initdb";
    if (!existsSync(initdb)) {
      t.skip("postgres 16 initdb missing");
      return;
    }
    process.env.PULSE_PG_BIN = "/usr/lib/postgresql/16/bin";
    const pg = await import("./helpers/pulse-pg-cluster.js");
    const cluster = pg.startDisposableCluster();
    t.after(() => cluster.stop());
    const names = [
      "0002_pulse_durable.sql",
      "0003_pulse_mcp_tool_demand.sql",
      "0005_pulse_admit_declared_mcp_tools.sql",
      "0006_pulse_admit_declared_mcp_tools.sql",
      "0007_pulse_mcp_source_outcomes.sql",
      "0008_pulse_browse_result_coverage.sql",
      "0009_pulse_mcp_refusal_reasons.sql",
      "0010_pulse_free_tool_outcomes.sql",
    ];
    const sql = names.map((name) => readFileSync(join(root, "supabase/migrations", name), "utf8")).join("\n");
    pg.psql(cluster, null, {
      input: `CREATE ROLE anon NOLOGIN;\nCREATE ROLE authenticated NOLOGIN;\nCREATE ROLE service_role NOLOGIN;\nGRANT USAGE ON SCHEMA public TO service_role;\n${sql}`,
    });
    const grants = pg.psqlTuples(
      cluster,
      "SELECT has_function_privilege('anon','public.pulse_validate_free_tool_outcomes(jsonb)','EXECUTE')::text || '|' || has_function_privilege('authenticated','public.pulse_merge_free_tool_outcomes(jsonb,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.pulse_apply_delta(uuid,jsonb)','EXECUTE')::text || '|' || has_function_privilege('service_role','public.pulse_read_snapshot(timestamptz,timestamptz)','EXECUTE')::text;",
    );
    assert.equal(grants, "false|false|true|true");
    const transport = pg.createPsqlPulseTransport(cluster);
    const at = "2026-11-04T03:45:00.000Z";
    const later = "2026-11-04T03:50:00.000Z";
    const end = "2026-11-04T04:00:00.000Z";
    const oldDelta = emptyDelta(at);
    oldDelta.total = 3;
    oldDelta.humans = 3;
    const oldApplied = await transport.rpc("pulse_apply_delta", {
      p_flush_id: "a1450100-0000-4000-8000-000000000001",
      p_delta: deltaToRpcPayload(oldDelta),
    });
    assert.equal(oldApplied.error, null, JSON.stringify(oldApplied.error));
    assert.equal(oldApplied.data.status, "applied");
    let snap = await transport.rpc("pulse_read_snapshot", {
      p_observation_start: at,
      p_observation_end: end,
    });
    assert.equal(snap.error, null, JSON.stringify(snap.error));
    assert.equal(snap.data.freeToolOutcomes, null);
    assert.equal(Number(snap.data.total), 3);
    const outcome = (completed, invalidHost, human, unknown, observedFrom) => ({
      observedFrom,
      requests: completed + invalidHost,
      outcomes: {
        completed, invalid_host: invalidHost, unreachable: 0, timeout: 0, abandoned: 0, other_failure: 0,
      },
      callers: { human, bot: 0, ai: 0, unknown },
    });
    const first = emptyDelta(at);
    first.freeToolOutcomes = outcome(1, 0, 1, 0, at);
    const firstApplied = await transport.rpc("pulse_apply_delta", {
      p_flush_id: "a1450100-0000-4000-8000-000000000002",
      p_delta: deltaToRpcPayload(first),
    });
    assert.equal(firstApplied.error, null, JSON.stringify(firstApplied.error));
    const second = emptyDelta(later);
    second.freeToolOutcomes = outcome(0, 1, 0, 1, later);
    const secondApplied = await transport.rpc("pulse_apply_delta", {
      p_flush_id: "a1450100-0000-4000-8000-000000000003",
      p_delta: deltaToRpcPayload(second),
    });
    assert.equal(secondApplied.error, null, JSON.stringify(secondApplied.error));
    snap = await transport.rpc("pulse_read_snapshot", {
      p_observation_start: at,
      p_observation_end: end,
    });
    assert.equal(Number(snap.data.total), 3);
    assert.equal(snap.data.freeToolOutcomes.observedFrom, at);
    assert.equal(Number(snap.data.freeToolOutcomes.requests), 2);
    assert.equal(Number(snap.data.freeToolOutcomes.outcomes.completed), 1);
    assert.equal(Number(snap.data.freeToolOutcomes.outcomes.invalid_host), 1);
    assert.equal(Number(snap.data.freeToolOutcomes.callers.human), 1);
    assert.equal(Number(snap.data.freeToolOutcomes.callers.unknown), 1);
    const bad = deltaToRpcPayload(first);
    bad.freeToolOutcomes = {
      ...bad.freeToolOutcomes,
      outcomes: { ...bad.freeToolOutcomes.outcomes, completed: 2 },
    };
    const rejected = await transport.rpc("pulse_apply_delta", {
      p_flush_id: "a1450100-0000-4000-8000-000000000004",
      p_delta: bad,
    });
    assert.ok(rejected.error);
    assert.match(String(rejected.error.message), /pulse_invalid_field:freeToolOutcomes/);
    const extra = deltaToRpcPayload(first);
    extra.freeToolOutcomes = {
      ...extra.freeToolOutcomes,
      outcomes: { ...extra.freeToolOutcomes.outcomes, checkedUrl: 0 },
    };
    const rejectedKey = await transport.rpc("pulse_apply_delta", {
      p_flush_id: "a1450100-0000-4000-8000-000000000005",
      p_delta: extra,
    });
    assert.ok(rejectedKey.error);
    const denied = pg.run(pg.PSQL, [
      "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
      "SET ROLE anon; SELECT public.pulse_apply_delta('a1450100-0000-4000-8000-000000000006'::uuid, '{}'::jsonb);",
    ], cluster.env);
    assert.notEqual(denied.status, 0);
    const PG_CTL = "/usr/lib/postgresql/16/bin/pg_ctl";
    const stopped = spawnSync(PG_CTL, ["-D", cluster.pgdata, "stop", "-m", "fast"], {
      env: { ...process.env, ...cluster.env },
      encoding: "utf8",
    });
    assert.equal(stopped.status, 0, stopped.stderr || stopped.stdout);
    const started = spawnSync(PG_CTL, ["-D", cluster.pgdata, "-l", cluster.logFile, "start", "-w"], {
      env: { ...process.env, ...cluster.env },
      encoding: "utf8",
    });
    assert.equal(started.status, 0, started.stderr || started.stdout);
    const reread = await transport.rpc("pulse_read_snapshot", {
      p_observation_start: at,
      p_observation_end: end,
    });
    assert.equal(reread.error, null, JSON.stringify(reread.error));
    assert.equal(Number(reread.data.total), 3);
    assert.equal(reread.data.freeToolOutcomes.observedFrom, at);
    assert.equal(Number(reread.data.freeToolOutcomes.requests), 2);
    assert.equal(Number(reread.data.freeToolOutcomes.outcomes.completed), 1);
    assert.equal(JSON.stringify(reread.data).includes(SECRET_PATH), false);
  });
});
