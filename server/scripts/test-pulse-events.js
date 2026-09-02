import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import express from "express";

const pulseTempDir = mkdtempSync(join(tmpdir(), "pulse-events-root-"));
process.env.PULSE_FILE = join(pulseTempDir, "pulse.json");

const { sellerRepairBriefs } = await import("../../client/src/data/sellerRepairBriefs.ts");
const {
  flushPulseSnapshot,
  mcpMethodClass,
  parseMcpProtocolBody,
  pulseMiddleware,
  pulseSnapshot,
  recordClientEvent,
  sellerRepairFindingIds,
  sellerRepairFindingRouteClasses,
} = await import("../lib/pulse.js");
const { default: pulseRouter } = await import("../routes/pulse.js");

test("keeps the server event allowlist equal to the canonical public briefs", () => {
  assert.deepEqual(
    [...sellerRepairFindingIds].sort(),
    sellerRepairBriefs.map((brief) => brief.id).sort(),
  );
  assert.deepEqual(
    Object.fromEntries(
      sellerRepairBriefs.map((brief) => [brief.id, brief.routeClass]),
    ),
    sellerRepairFindingRouteClasses,
  );
});

test("records only bounded seller-repair funnel events", () => {
  assert.equal(recordClientEvent("other_event", {}), false);
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "bad id",
      route_class: "paid_get",
    }),
    false,
  );

  const props = {
    finding_id: "vibe-springs-btc-usd-20260830",
    route_class: "paid_get",
  };
  const before = structuredClone(pulseSnapshot().sellerRepair);
  assert.equal(recordClientEvent("seller_repair_brief_viewed", props), true);
  assert.equal(recordClientEvent("seller_repair_scope_clicked", props), true);

  const snapshot = pulseSnapshot();
  assert.equal(snapshot.sellerRepair.briefViews, before.briefViews + 1);
  assert.equal(snapshot.sellerRepair.scopeClicks, before.scopeClicks + 1);
  assert.deepEqual(snapshot.sellerRepair.byFinding[props.finding_id], {
    routeClass: "paid_get",
    briefViews: (before.byFinding[props.finding_id]?.briefViews || 0) + 1,
    scopeClicks: (before.byFinding[props.finding_id]?.scopeClicks || 0) + 1,
    checkoutStarts: before.byFinding[props.finding_id]?.checkoutStarts || 0,
  });
});

test("records seller-repair checkout starts separately from scope clicks", () => {
  const props = {
    finding_id: "blockrun-exa-search-20260830",
    route_class: "paid_post",
  };
  const before = structuredClone(pulseSnapshot().sellerRepair);
  assert.equal(recordClientEvent("seller_repair_checkout_started", props), true);
  const snapshot = pulseSnapshot();
  assert.equal(snapshot.sellerRepair.checkoutStarts, before.checkoutStarts + 1);
  assert.equal(snapshot.sellerRepair.scopeClicks, before.scopeClicks);
  assert.equal(
    snapshot.sellerRepair.byFinding[props.finding_id].checkoutStarts,
    (before.byFinding[props.finding_id]?.checkoutStarts || 0) + 1,
  );
});

test("rejects a conflicting route class for an existing finding", () => {
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "vibe-springs-btc-usd-20260830",
      route_class: "paid_post",
    }),
    false,
  );
});

test("accepts the canonical paid POST finding only with its exact route class", () => {
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "blockrun-exa-search-20260830",
      route_class: "paid_post",
    }),
    true,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "blockrun-exa-search-20260830",
      route_class: "paid_get",
    }),
    false,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "exa-direct-search-20260830",
      route_class: "paid_post",
    }),
    true,
  );
});

test("keeps the AgentToll finding bound to paid_post", () => {
  const findingId = "agenttoll-market-radar-20260901";
  assert.equal(sellerRepairFindingRouteClasses[findingId], "paid_post");
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: findingId,
      route_class: "paid_post",
    }),
    true,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: findingId,
      route_class: "paid_get",
    }),
    false,
  );
});

test("exposes only the bounded event write route", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/pulse", pulseRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address.port}/api/pulse/event`;

  const accepted = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "seller_repair_brief_viewed",
      props: {
        finding_id: "hypernatt-liq-radar-20260830",
        route_class: "paid_get",
      },
    }),
  });
  assert.equal(accepted.status, 204);

  const rejected = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "seller_repair_brief_viewed",
      props: { finding_id: "invented-finding", route_class: "paid_get" },
    }),
  });
  assert.equal(rejected.status, 400);
});

test("persists and reloads bounded seller-repair counters", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-test-"));
  const file = join(dir, "pulse.json");
  const wal = `${file}.fallback.json`;
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const env = { ...process.env, PULSE_FILE: file };

  const writer = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { recordClientEvent, flushPulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `if (!recordClientEvent("seller_repair_brief_viewed", { finding_id: "vibe-springs-btc-usd-20260830", route_class: "paid_get" })) process.exit(2);\n` +
        `if (!flushPulseSnapshot()) process.exit(3);`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const saved = JSON.parse(readFileSync(wal, "utf8"));
  assert.equal(saved.pendingFlushes[0].delta.sellerRepair.byFinding["vibe-springs-btc-usd-20260830"].briefViews, 1);

  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify(pulseSnapshot().sellerRepair));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const reloaded = JSON.parse(reader.stdout);
  assert.equal(reloaded.briefViews, 1);
  assert.equal(reloaded.byFinding["vibe-springs-btc-usd-20260830"].briefViews, 1);
});

function mockReq({ method = "GET", headers = {}, path = "/mcp", body } = {}) {
  return { method, path, headers, body, ip: "127.0.0.1" };
}

function recordRequest(req) {
  const before = structuredClone(pulseSnapshot());
  pulseMiddleware(req, {}, () => {});
  return { before, after: pulseSnapshot() };
}

function recordGet(headers, path = "/mcp") {
  return recordRequest(mockReq({ headers, path }));
}

function recordMcpPost(body) {
  return recordRequest(mockReq({ method: "POST", path: "/mcp", body }));
}

test("reproduces the live false-human case as plain GET /mcp surface access", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const { before, after } = recordGet({ "user-agent": ua });
  assert.equal(after.humans, before.humans);
  assert.equal(after.uniqueHumansEstimate.count, before.uniqueHumansEstimate.count);
  assert.equal(after.byPath["/mcp"] || 0, before.byPath["/mcp"] || 0);
  assert.equal(after.mcpSurfaceGet.requests, before.mcpSurfaceGet.requests + 1);
  assert.equal(after.recent[0]?.kind, "mcpSurfaceGet");
});

test("classifies every GET /mcp as mcpSurfaceGet regardless of user agent", () => {
  for (const headers of [
    { "user-agent": "Mozilla/5.0" },
    { "user-agent": "python-requests/2.32" },
    {},
  ]) {
    const { after } = recordGet(headers);
    assert.equal(after.recent[0]?.kind, "mcpSurfaceGet");
    assert.equal(after.recent[0]?.p, "/mcp");
  }

  const trailingSlash = recordGet({ "user-agent": "Mozilla/5.0" }, "/mcp/");
  assert.equal(trailingSlash.after.recent[0]?.kind, "mcpSurfaceGet");
  assert.equal(trailingSlash.after.recent[0]?.p, "/mcp");
});

test("does not persist GET /mcp query values such as purchase-return cs codes", () => {
  const { after } = recordGet({ "user-agent": "Mozilla/5.0" }, "/mcp?cs=secret-license-code");
  assert.equal(after.recent[0]?.p, "/mcp");
  assert.equal(JSON.stringify(after.recent[0]).includes("secret"), false);
  assert.equal(JSON.stringify(after).includes("secret-license-code"), false);
});

test("counts shape-valid POST /mcp JSON-RPC by safe method class", () => {
  const cases = [
    { body: { jsonrpc: "2.0", id: 1, method: "initialize" }, methodClass: "initialize" },
    { body: { jsonrpc: "2.0", id: 2, method: "tools/list" }, methodClass: "tools/list" },
    { body: { jsonrpc: "2.0", id: 3, method: "tools/call" }, methodClass: "tools/call" },
    {
      body: { jsonrpc: "2.0", method: "notifications/initialized" },
      methodClass: "notifications",
    },
    { body: { jsonrpc: "2.0", id: 4, method: "ping" }, methodClass: "other" },
  ];
  for (const { body, methodClass } of cases) {
    const { before, after } = recordMcpPost(body);
    assert.equal(after.mcpProtocol.httpRequests, before.mcpProtocol.httpRequests + 1);
    assert.equal(after.mcpProtocol.messages, before.mcpProtocol.messages + 1);
    assert.equal(after.mcpProtocol.byMethod[methodClass], before.mcpProtocol.byMethod[methodClass] + 1);
    assert.equal(after.humans, before.humans);
    assert.equal(after.bots, before.bots);
    assert.equal(after.aiCrawlers, before.aiCrawlers);
    assert.equal(after.recent[0]?.kind, "mcpProtocol");
  }


  const trailingSlash = recordRequest(
    mockReq({
      method: "POST",
      path: "/mcp/",
      body: { jsonrpc: "2.0", id: 5, method: "tools/list" },
    }),
  );
  assert.equal(
    trailingSlash.after.mcpProtocol.httpRequests,
    trailingSlash.before.mcpProtocol.httpRequests + 1,
  );
  assert.equal(trailingSlash.after.recent[0]?.p, "/mcp");
});

test("admits a bounded valid POST /mcp batch and rejects oversized batches", () => {
  const validBatch = Array.from({ length: 3 }, (_, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: "ping",
  }));
  const { before, after } = recordMcpPost(validBatch);
  assert.equal(after.mcpProtocol.httpRequests, before.mcpProtocol.httpRequests + 1);
  assert.equal(after.mcpProtocol.messages, before.mcpProtocol.messages + 3);

  const oversized = Array.from({ length: 26 }, (_, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: "ping",
  }));
  const blocked = recordMcpPost(oversized);
  assert.equal(blocked.after.mcpProtocol.httpRequests, after.mcpProtocol.httpRequests);
});

test("rejects malformed JSON-RPC-shaped POST bodies without counting protocol traffic", () => {
  const rejected = [
    { jsonrpc: "1.0", method: "initialize" },
    { jsonrpc: "2.0" },
    { jsonrpc: "2.0", method: 1 },
    { jsonrpc: "2.0", method: "" },
    null,
    "not-json",
    [],
  ];
  for (const body of rejected) {
    const { before, after } = recordMcpPost(body);
    assert.equal(after.mcpProtocol.httpRequests, before.mcpProtocol.httpRequests);
    assert.equal(after.total, before.total);
  }
});

test("does not count POST JSON-RPC on the wrong path or header-only MCP hints", () => {
  const body = { jsonrpc: "2.0", id: 1, method: "initialize" };
  const wrongPath = recordRequest(mockReq({ method: "POST", path: "/scan", body }));
  assert.equal(wrongPath.after.mcpProtocol.httpRequests, wrongPath.before.mcpProtocol.httpRequests);

  const headerOnly = recordGet({
    accept: "text/event-stream",
    "mcp-session-id": "sess-abc123",
    "mcp-protocol-version": "2024-11-05",
  });
  assert.equal(headerOnly.after.mcpSurfaceGet.requests, headerOnly.before.mcpSurfaceGet.requests + 1);
  assert.equal(headerOnly.after.mcpProtocol.httpRequests, headerOnly.before.mcpProtocol.httpRequests);

  const ordinary = recordGet({ "user-agent": "Mozilla/5.0" }, "/");
  assert.equal(ordinary.after.humans, ordinary.before.humans + 1);
  assert.equal(ordinary.after.mcpSurfaceGet.requests, headerOnly.after.mcpSurfaceGet.requests);
});

test("parseMcpProtocolBody and mcpMethodClass stay bounded and fail closed", () => {
  assert.equal(mcpMethodClass("initialize"), "initialize");
  assert.equal(mcpMethodClass("notifications/cancelled"), "notifications");
  assert.equal(mcpMethodClass("ping"), "other");

  const admitted = parseMcpProtocolBody({ jsonrpc: "2.0", method: "tools/list", id: 1 });
  assert.equal(admitted.admitted, true);
  assert.deepEqual(admitted.messages, [{ methodClass: "tools/list" }]);

  const batch = parseMcpProtocolBody([
    { jsonrpc: "2.0", method: "initialize", id: 1 },
    { jsonrpc: "2.0", method: "tools/call", id: 2 },
  ]);
  assert.equal(batch.admitted, true);
  assert.equal(batch.messages.length, 2);

  const badBatch = parseMcpProtocolBody([
    { jsonrpc: "2.0", method: "initialize", id: 1 },
    { jsonrpc: "2.0", id: 2 },
  ]);
  assert.equal(badBatch.admitted, false);
});

test("seller-repair counters stay unchanged when MCP surface or protocol traffic is recorded", () => {
  const before = pulseSnapshot().sellerRepair;
  recordGet({ "user-agent": "Mozilla/5.0" });
  recordMcpPost({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const after = pulseSnapshot().sellerRepair;
  assert.equal(after.briefViews, before.briefViews);
  assert.equal(after.scopeClicks, before.scopeClicks);
  assert.equal(after.checkoutStarts, before.checkoutStarts);
});

test("isolates legacy v1 request classification behind a coherent uncertainty boundary", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-legacy-test-"));
  const file = join(dir, "pulse.json");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    file,
    JSON.stringify({
      startedAt: "2026-08-30T00:00:00.000Z",
      total: 15265,
      humans: 15179,
      uniqueHumans: ["abc", "def"],
      bots: 12,
      aiCrawlers: 3,
      byPath: { "/mcp": 15142, "/": 20 },
      byReferer: { "(direct)": 100 },
      byAiBot: { GPTBot: 3 },
      funnel: { home: 20, scan: 5, tools: 0, reports: 0, guides: 0, pricing: 1 },
      recent: [{ t: "2026-08-30T01:00:00.000Z", p: "/mcp", kind: "human" }],
      sellerRepair: { briefViews: 2, scopeClicks: 1, checkoutStarts: 0, byFinding: {} },
    }),
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
    { env: { ...process.env, PULSE_FILE: file }, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const snapshot = JSON.parse(reader.stdout);
  assert.equal(snapshot.classificationSchemaVersion, 2);
  assert.notEqual(snapshot.startedAt, "2026-08-30T00:00:00.000Z");
  assert.equal(snapshot.total, 0);
  assert.equal(snapshot.humans, 0);
  assert.equal(snapshot.uniqueHumansEstimate.count, 0);
  assert.equal(snapshot.bots, 0);
  assert.equal(snapshot.aiCrawlers, 0);
  assert.deepEqual(snapshot.byPath, {});
  assert.deepEqual(snapshot.funnel, {
    home: 0,
    scan: 0,
    tools: 0,
    reports: 0,
    guides: 0,
    pricing: 0,
  });
  assert.equal(snapshot.recent.length, 0);
  assert.equal(snapshot.mcpSurfaceGet.requests, 0);
  assert.equal(snapshot.mcpProtocol.httpRequests, 0);
  assert.equal(snapshot.legacyUncertainty.startedAt, "2026-08-30T00:00:00.000Z");
  assert.equal(snapshot.legacyUncertainty.total, 15265);
  assert.equal(snapshot.legacyUncertainty.humans, 15179);
  assert.equal(snapshot.legacyUncertainty.uniqueHumans, 2);
  assert.equal(snapshot.legacyUncertainty.bots, 12);
  assert.equal(snapshot.legacyUncertainty.aiCrawlers, 3);
  assert.equal(snapshot.legacyUncertainty.byPath["/mcp"], 15142);
  assert.equal(snapshot.legacyUncertainty.byReferer["(direct)"], 100);
  assert.equal(snapshot.legacyUncertainty.byAiBot.GPTBot, 3);
  assert.equal(snapshot.legacyUncertainty.funnel.home, 20);
  assert.equal(snapshot.sellerRepair.briefViews, 2);

  const wal = JSON.parse(readFileSync(`${file}.fallback.json`, "utf8"));
  assert.equal(wal.legacyUncertainty.byPath["/mcp"], 15142);
  assert.equal(wal.pendingFlushes[0].delta.sellerRepair.briefViews, 2);
});

test("persists and reloads v2 MCP counters without a second migration", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-v2-test-"));
  const file = join(dir, "pulse.json");
  const wal = `${file}.fallback.json`;
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const env = { ...process.env, PULSE_FILE: file };

  const writer = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { flushPulseSnapshot, pulseMiddleware } = await import(${JSON.stringify(moduleUrl)});\n` +
        `pulseMiddleware({ method: "GET", path: "/mcp", headers: {}, ip: "127.0.0.1" }, {}, () => {});\n` +
        `pulseMiddleware({ method: "POST", path: "/mcp", body: { jsonrpc: "2.0", id: 1, method: "initialize" }, ip: "127.0.0.1" }, {}, () => {});\n` +
        `if (!flushPulseSnapshot()) process.exit(3);\n`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const saved = JSON.parse(readFileSync(wal, "utf8"));
  assert.equal(saved.pendingFlushes.length, 1);
  assert.equal(saved.pendingFlushes[0].delta.mcpSurfaceGets, 1);
  assert.equal(saved.pendingFlushes[0].delta.mcpProtocolRequests, 1);
  assert.equal(saved.pendingFlushes[0].delta.humans, 0);

  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify(pulseSnapshot()));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const snapshot = JSON.parse(reader.stdout);
  assert.equal(snapshot.mcpSurfaceGet.requests, 1);
  assert.equal(snapshot.mcpProtocol.httpRequests, 1);
  assert.equal(snapshot.mcpProtocol.byMethod.initialize, 1);
  assert.match(snapshot.mcpSurfaceGet.meaning, /Not unique agents/i);
  assert.match(snapshot.mcpProtocol.meaning, /Not unique agents/i);
  assert.equal(snapshot.legacyUncertainty, null);
});

test("uses a durable per-user state path in production and migrates the legacy temp snapshot", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-production-test-"));
  const home = join(dir, "home");
  const legacyFile = join(dir, "sdd-pulse-v1.json");
  const durableFile = join(home, ".state", "samedaydesk", "pulse-v1.json");
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(home, { recursive: true });
  writeFileSync(
    legacyFile,
    JSON.stringify({
      startedAt: "2026-08-30T00:00:00.000Z",
      sellerRepair: {
        briefViews: 1,
        scopeClicks: 0,
        byFinding: {
          "hypernatt-liq-radar-20260830": {
            routeClass: "paid_get",
            briefViews: 1,
            scopeClicks: 0,
          },
        },
      },
    }),
  );

  const env = {
    ...process.env,
    NODE_ENV: "production",
    HOME: home,
    TMPDIR: dir,
    XDG_STATE_HOME: join(home, ".state"),
  };
  delete env.PULSE_FILE;
  const writer = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { flushPulseSnapshot, pulseSnapshot, recordClientEvent } = await import(${JSON.stringify(moduleUrl)});\n` +
        `if (!recordClientEvent("seller_repair_brief_viewed", { finding_id: "hypernatt-liq-radar-20260830", route_class: "paid_get" })) process.exit(2);\n` +
        `if (!flushPulseSnapshot()) process.exit(3);\n` +
        `console.log(JSON.stringify({ storage: pulseSnapshot().storage, sellerRepair: pulseSnapshot().sellerRepair }));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const payload = JSON.parse(writer.stdout);
  assert.equal(payload.storage.mode, "production_state_home");
  assert.equal(payload.storage.migratedLegacySnapshot, true);
  assert.equal(payload.sellerRepair.briefViews, 2);
  const wal = JSON.parse(readFileSync(`${durableFile}.fallback.json`, "utf8"));
  assert.ok(wal.pendingFlushes.length >= 1);
});
