import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { availableCatalogOffers } from "../conformance/catalog.js";
import { publicFacts } from "../conformance/privacy.js";
import { loadExistingProbeRecords } from "../conformance/records.js";
import { createConformanceRouter } from "../conformance/routes.js";
import { renderBadgeSvg } from "../conformance/badge.js";
import { STALE_AFTER_MS, buildScorecard, listDirectory } from "../conformance/scorecard.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = Date.parse("2026-11-26T12:40:00.000Z");
const FRESH = "2026-11-20T00:00:00.000Z";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function mount(t, options = {}) {
  const app = express();
  app.use("/directory", createConformanceRouter({
    repoRoot: REPO_ROOT,
    now: () => options.now ?? NOW,
    env: options.env || {},
    loadRecords: options.loadRecords,
    staleAfterMs: options.staleAfterMs ?? STALE_AFTER_MS,
  }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  return { base };
}

test("catalog omits the unavailable 49 offer and keeps 100 and 499", () => {
  const off = availableCatalogOffers({});
  assert.deepEqual(off.map((item) => item.offer), ["keep_it_working", "machine_payment_route"]);
  assert.equal(off.find((item) => item.offer === "keep_it_working").cents, 10000);
  assert.equal(off.find((item) => item.offer === "machine_payment_route").cents, 49900);
  const on = availableCatalogOffers({ SDS_AGENT_FIRST_USE_REPORT: "1" });
  assert.deepEqual(on.map((item) => item.offer), ["agent_first_use_report", "keep_it_working", "machine_payment_route"]);
});

test("publicFacts drops private customer rows", () => {
  const cleaned = publicFacts({
    host: "agents.samedaydesk.com",
    email: "buyer@example.test",
    customer_id: "cus_secret",
    order_id: "ord_1",
    client_secret: "pi_123_secret",
    payment_intent: "pi_123",
    route: "/extract",
  });
  assert.equal(cleaned.host, "agents.samedaydesk.com");
  assert.equal(cleaned.route, "/extract");
  assert.equal(cleaned.email, undefined);
  assert.equal(cleaned.customer_id, undefined);
  assert.equal(cleaned.order_id, undefined);
  assert.equal(cleaned.client_secret, undefined);
  assert.equal(cleaned.payment_intent, undefined);
});

test("existing presence and crawl records stay stale, partial, and uncertified", () => {
  const records = loadExistingProbeRecords(REPO_ROOT);
  const mcp = records.filter((record) => record.kind === "mcp");
  const x402 = records.filter((record) => record.kind === "x402" && record.subject.host === "agents.samedaydesk.com");
  const mcpCard = buildScorecard("mcp", mcp[0].subject, mcp, { now: NOW, env: {} });
  const x402Card = buildScorecard("x402", x402[0].subject, x402, { now: NOW, env: {} });
  assert.equal(mcpCard.subjectKey, "epistemedeus/x402-url-extractor");
  assert.equal(mcpCard.checkedAt, "2026-09-03T17:03:44Z");
  assert.equal(mcpCard.status, "stale");
  assert.equal(mcpCard.freshness, "stale");
  assert.equal(mcpCard.completeness, "incomplete");
  assert.match(mcpCard.limitations.join("\n"), /version drift/i);
  assert.match(mcpCard.limitations.join("\n"), /Windows\/macOS\/Linux/);
  assert.equal(mcpCard.certification, false);
  assert.equal(mcpCard.livePayment, false);
  assert.equal(x402Card.status, "stale");
  assert.equal(x402Card.checkedAt, "2026-09-07T18:50:05.000Z");
  assert.match(x402Card.methods.join("; "), /unpaid GET 402/);
  assert.match(x402Card.limitations.join("\n"), /POST routes were not transmitted/);
  assert.match(x402Card.limitations.join("\n"), /not an independent certification/);
  assert.ok(x402Card.observations.some((item) => item.registryStatus === "alternate"));
  assert.deepEqual(mcpCard.catalog.map((item) => item.offer), ["keep_it_working", "machine_payment_route"]);
});

test("a current complete MCP record is checked without becoming a certification", () => {
  const records = [{
    kind: "mcp",
    subject: { org: "example", repo: "ok-server" },
    checkedAt: FRESH,
    method: "unpaid initialize and registry GET",
    source: "test-fixture",
    observations: [
      { id: "mcp-registry-listing", method: "GET", registryVersion: "2.0.0", registryStatus: "active" },
      { id: "mcp-initialize", method: "unpaid initialize", serverVersion: "2.0.0", protocolVersion: "2025-03-26", osPassRates: { windows: 1, macos: 1, linux: 1 } },
    ],
  }];
  const card = buildScorecard("mcp", records[0].subject, records, { now: NOW, env: {} });
  assert.equal(card.status, "checked");
  assert.equal(card.freshness, "current");
  assert.equal(card.completeness, "complete");
  assert.equal(card.certification, false);
  assert.equal(card.livePayment, false);
  const svg = renderBadgeSvg(card);
  assert.match(svg, /checked · 2026-11-20 · not a certification/);
  assert.match(svg, /scope: mcp.registry.listing, mcp.initialize/);
  assert.doesNotMatch(svg, /Agent-Verified|Agent-Tested/);
  assert.match(svg, /not a certification/);
});

test("HTTP 200 alone is not a pass", () => {
  const records = [{
    kind: "mcp",
    subject: { org: "example", repo: "status-only" },
    checkedAt: FRESH,
    method: "GET",
    httpStatus: 200,
    observations: [],
  }];
  const card = buildScorecard("mcp", records[0].subject, records, { now: NOW, env: {} });
  assert.notEqual(card.status, "checked");
  assert.equal(card.completeness, "incomplete");
  assert.match(card.limitations.join("\n"), /HTTP status alone is not a pass/);
});

test("failed and unknown observation states are preserved", () => {
  const failed = buildScorecard("x402", { host: "fail.example" }, [{
    kind: "x402",
    subject: { host: "fail.example" },
    checkedAt: FRESH,
    method: "GET unpaid 402",
    observations: [{ id: "route-a", method: "GET", route: "/pay", registryStatus: "failed" }],
  }], { now: NOW, env: {} });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failed, true);
  const unknown = buildScorecard("mcp", { org: "example", repo: "missing" }, [], { now: NOW, env: {} });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.freshness, "unknown");
});

test("directory and badge HTTP surfaces consume real records and refuse bad subjects", async (t) => {
  const { base } = await mount(t, { env: {} });
  const index = await fetch(`${base}/directory?format=json`);
  assert.equal(index.status, 200);
  const listing = await index.json();
  assert.ok(listing.mcp.some((item) => item.subjectKey === "epistemedeus/x402-url-extractor" && item.status === "stale"));
  assert.ok(listing.x402.some((item) => item.subjectKey === "agents.samedaydesk.com" && item.status === "stale"));
  assert.deepEqual(listing.catalog.map((item) => item.offer), ["keep_it_working", "machine_payment_route"]);
  assert.match(listing.disclaimer, /not an independent certification/i);

  const mcp = await fetch(`${base}/directory/mcp/epistemedeus/x402-url-extractor?format=json`);
  assert.equal(mcp.status, 200);
  const mcpBody = await mcp.json();
  assert.equal(mcpBody.status, "stale");
  assert.equal("email" in mcpBody, false);
  assert.equal(mcpBody.certification, false);

  const badge = await fetch(`${base}/directory/mcp/epistemedeus/x402-url-extractor/badge.svg`);
  assert.equal(badge.status, 200);
  assert.match(badge.headers.get("content-type"), /image\/svg\+xml/);
  const svg = await badge.text();
  assert.match(svg, /stale · 2026-09-03 · not a certification/);
  assert.match(svg, /not an independent certification/);

  const x402 = await fetch(`${base}/directory/x402/agents.samedaydesk.com?format=json`);
  assert.equal(x402.status, 200);
  const x402Body = await x402.json();
  assert.ok(x402Body.observations.some((item) => item.registryStatus === "alternate"));
  assert.ok(x402Body.observations.some((item) => item.method === "POST") === false || x402Body.limitations.join(" ").includes("POST routes were not transmitted"));

  const missing = await fetch(`${base}/directory/mcp/epistemedeus/does-not-exist?format=json`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).reason, "no_public_check");

  const invalid = await fetch(`${base}/directory/mcp/../etc/passwd?format=json`);
  assert.ok([404, 400].includes(invalid.status));

  const badHost = await fetch(`${base}/directory/x402/localhost?format=json`);
  assert.equal(badHost.status, 404);

  const privateRecords = [{
    kind: "mcp",
    subject: { org: "example", repo: "leaky" },
    checkedAt: FRESH,
    method: "GET",
    email: "buyer@example.test",
    observations: [
      { id: "mcp-registry-listing", method: "GET", registryVersion: "1.0.0", registryStatus: "active", customer_email: "buyer@example.test" },
      { id: "mcp-initialize", method: "unpaid initialize", serverVersion: "1.0.0", osPassRates: { windows: 1, macos: 1, linux: 1 }, payment_intent: "pi_hidden" },
    ],
  }];
  const { base: privateBase } = await mount(t, { env: {}, loadRecords: () => privateRecords, now: NOW });
  const leaked = await (await fetch(`${privateBase}/directory/mcp/example/leaky?format=json`)).json();
  assert.equal(leaked.email, undefined);
  assert.ok(!JSON.stringify(leaked).includes("buyer@example.test"));
  assert.ok(!JSON.stringify(leaked).includes("pi_hidden"));
});
