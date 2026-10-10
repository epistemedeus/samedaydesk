/**
 * Mounted-handler proof for GET /api/observatory/convergence.
 * The original capture stays a separate window. A refresh ranks only rows
 * fetched on that request.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createObservatoryRouter } from "../routes/observatory.js";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import { MAX_RESPONSE_BYTES } from "../lib/observatory/bounded-fetch.js";
import { MOLTJOBS_STATS_SOURCE_URL } from "../lib/market-observations/moltjobs-stats-adapter.js";
import { upstreamUrl as OPEN_JOBS_UPSTREAM } from "../lib/observatory/adapters/moltjobs-open-jobs.js";
import { CONVERGENCE_SCHEMA, discoveryPageUrl } from "../lib/observatory/convergence-enrollment.js";

const HISTORICAL_CAPTURE = process.env.OBSERVATORY_ORIGINAL_CAPTURE || "";
const REQUEST_TIME = "2026-10-10T17:14:15.909Z";
const REQUEST_MS = Date.parse(REQUEST_TIME);
const EXTRACT = "https://agents.samedaydesk.com/extract";

const URLS = Object.freeze({
  moltjobs: MOLTJOBS_STATS_SOURCE_URL,
  x402stats: "https://x402stats.io/api/stats",
  smithery: "https://api.smithery.ai/servers?pageSize=1",
  openJobs: OPEN_JOBS_UPSTREAM,
});

const MOLTJOBS_FIXTURE = Object.freeze({
  data: {
    totalJobs: 12,
    totalCompleted: 4,
    totalAgents: 3,
    totalVolumeUsdc: "10.50",
    escrowedUsdc: "1.25",
    avgCompletionTimeMs: 1500,
    medianCompletionTimeMs: 900,
    avgTimeToFillMs: 2000,
    medianTimeToFillMs: 1800,
    completionSampleSize: 4,
    disputeRate: "0.01",
    updatedAt: "2026-10-10T17:10:00.000Z",
  },
});

const X402STATS_FIXTURE = Object.freeze({
  updatedAt: "2026-10-10T17:10:00.000Z",
  methodologyVersion: "2026-07-01.v1",
  series: [
    { date: "2026-10-10", buyers: 11, newSellers: 2, sellers: 5, transactions: 17, volumeUsd: 19.25 },
  ],
  history: [],
  snapshot: {
    avgPaymentUsd: 0.12,
    computedAt: "2026-10-10T17:10:00.000Z",
    facilitatorShare: [],
    medianSellerRevenueUsd: 0.01,
    organicSellers: 84,
    organicVolumeUsd: 840.5,
    sellers: 47303,
    top10VolumeShare: 0.73,
    volumeUsd: 1021.25,
    windowDays: 30,
  },
});

const SMITHERY_FIXTURE = Object.freeze({
  servers: [{ qualifiedName: "fixture/example", useCount: 999, displayName: "Fixture" }],
  pagination: { currentPage: 1, pageSize: 1, totalPages: 40, totalCount: 777 },
});

const OPEN_JOBS_FIXTURE = Object.freeze({
  data: [{ status: "OPEN", purpose: "PLATFORM_REFERRAL", funded: true, requiredSkills: [], preferredSkills: [] }],
  meta: { hasMore: false, limit: 20 },
});

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function discoveryItem(resource, calls, payers, lastUpdated, extra = {}) {
  const item = {
    resource,
    lastUpdated,
    quality: {
      l30DaysTotalCalls: calls,
      l30DaysUniquePayers: payers,
    },
    accepts: extra.accepts || [{
      scheme: "exact",
      network: "eip155:8453",
      asset: extra.asset || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      amount: extra.amount || "2500",
    }],
  };
  if (extra.omitTime) delete item.lastUpdated;
  if (extra.quality) item.quality = extra.quality;
  return item;
}

function pageBody(items, { limit, offset, total }) {
  const pagination = { limit, offset };
  if (total !== undefined) pagination.total = total;
  return { items, pagination };
}

function createFetch(discoveryHandler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, method: init.method || "GET", init });
    if (target.startsWith("https://api.cdp.coinbase.com/")) {
      if (!discoveryHandler) throw new Error(`unexpected discovery ${target}`);
      return discoveryHandler(target, init, calls);
    }
    if (target === URLS.moltjobs) return jsonResponse(MOLTJOBS_FIXTURE);
    if (target === URLS.x402stats) return jsonResponse(X402STATS_FIXTURE);
    if (target === URLS.smithery) {
      return jsonResponse(SMITHERY_FIXTURE, 200, { "last-modified": "Sat, 10 Oct 2026 17:10:00 GMT" });
    }
    if (target === URLS.openJobs) return jsonResponse(OPEN_JOBS_FIXTURE);
    throw new Error(`unexpected upstream ${target}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function mount(t, { fetchImpl, capturePath = "", capturePin, ownedResources, timeoutMs = 8000, maxBytes, now } = {}) {
  const app = express();
  app.use("/api/observatory", createObservatoryRouter({
    fetchImpl: fetchImpl || createFetch(),
    now: now || (() => REQUEST_MS),
    timeoutMs,
    maxBytes,
    cacheTtlMs: 0,
    originalCapturePath: capturePath,
    capturePin,
    ownedResources,
  }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  return { base, fetchImpl };
}

async function getJson(base, route, headers = {}) {
  const response = await fetch(`${base}${route}`, { method: "GET", headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, text, headers: response.headers };
}

function metric(observations, sourceId, key) {
  const observation = observations.find((entry) => entry.sourceId === sourceId);
  return observation && observation.metrics.find((entry) => entry.key === key);
}

test("same-call duplicate payer or clock conflicts never use first-row facts", async (t) => {
  for (const changed of ["payer", "clock"]) {
    const rows = [discoveryItem(EXTRACT, 5, 2, "2026-10-10T17:10:00Z"),
      discoveryItem(EXTRACT, 5, changed === "payer" ? 3 : 2,
        changed === "clock" ? "2026-10-10T17:11:00Z" : "2026-10-10T17:10:00Z")];
    const fetchImpl = createFetch((target) => {
      const offset = Number(new URL(target).searchParams.get("offset"));
      return jsonResponse(pageBody(offset === 0 ? rows : [], { limit: 20, offset, total: 2 }));
    });
    const { base } = await mount(t, { fetchImpl });
    const { body } = await getJson(base, "/api/observatory/convergence/refresh");
    assert.deepEqual(body.currentCut.contradictoryResources, [EXTRACT]);
    assert.equal(body.currentCut.ownRow[0].listing, "contradictory_duplicate");
    assert.equal(body.currentCut.ownRow[0].payerLabel.value, null);
    assert.equal(body.currentCut.ownRow[0].callLabel.value, null);
    assert.equal(body.currentCut.convergence, null);
  }
});

test("mounted convergence does not emit objects or nonfinite values as valid metrics", async (t) => {
  const app = express();
  const supplied = [{ invalid: "object" }, [], true, Number.NaN, Number.POSITIVE_INFINITY];
  const runtime = { observeAll: async () => ({ schemaVersion: SCHEMA_VERSION,
    fetchedAt: REQUEST_TIME, additivity: "not_additive", observations: [{
      sourceId: "x402stats", availability: "ok", metrics: supplied.map((value, i) => ({
        key: "invalid-" + i, state: "ok", value, unit: "transactions",
      })).concat([{ key: "valid-zero", state: "ok", value: 0, unit: "transactions" }]),
    }] }) };
  app.use("/api/observatory", createObservatoryRouter({ runtime, now: () => REQUEST_MS }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const { body } = await getJson(base, "/api/observatory/convergence");
  const metrics = body.bridge.observations[0].metrics;
  for (const entry of metrics.slice(0, supplied.length)) {
    assert.equal(entry.state, "invalid");
    assert.equal(entry.value, null);
  }
  assert.equal(metrics.at(-1).state, "ok");
  assert.equal(metrics.at(-1).value, 0);
  assert.equal(metrics.at(-1).unit, "transactions");
});

test("mounted metrics keep zero and reject invalid enums, units, and signs", async (t) => {
  const app = express();
  const runtime = { observeAll: async () => ({ schemaVersion: SCHEMA_VERSION,
    fetchedAt: REQUEST_TIME, additivity: "not_additive", observations: [{
      sourceId: "moltjobs", availability: "ok", metrics: [
        { key: "false-value", state: "ok", value: false, unit: "USDC" },
        { key: "negative", state: "ok", value: -1, unit: "USD" },
        { key: "bad-enum", state: "not-a-state", value: 1, unit: "USD" },
        { key: "bad-unit", state: "ok", value: 1, unit: { name: "USD" } },
        { key: "unavailable-zero", state: "unavailable", value: 0, unit: "USD" },
        { key: "omitted-state", value: 4, unit: "USD" },
        { key: "string-zero", state: "ok", value: "0", unit: "USDC", population: "provider_reported_usdc", window: "unspecified_provider_snapshot" },
        { key: "decimal-usdc", state: "ok", value: "10.50", unit: "USDC", population: { coerced: true }, window: 30 },
      ],
    }] }) };
  app.use("/api/observatory", createObservatoryRouter({ runtime, now: () => REQUEST_MS, originalCapturePath: "" }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const { body } = await getJson(base, "/api/observatory/convergence");
  const byKey = Object.fromEntries(body.bridge.observations[0].metrics.map((entry) => [entry.key, entry]));
  for (const key of ["false-value", "negative", "bad-enum", "bad-unit"]) {
    assert.equal(byKey[key].state, "invalid");
    assert.equal(byKey[key].value, null);
  }
  assert.equal(byKey["bad-unit"].unit, null);
  assert.equal(byKey["unavailable-zero"].state, "unavailable");
  assert.equal(byKey["unavailable-zero"].value, null);
  assert.equal(byKey["omitted-state"].state, "missing");
  assert.equal(byKey["omitted-state"].value, null);
  assert.equal(byKey["string-zero"].state, "ok");
  assert.equal(byKey["string-zero"].value, "0");
  assert.equal(byKey["string-zero"].unit, "USDC");
  assert.equal(byKey["string-zero"].population, "provider_reported_usdc");
  assert.equal(byKey["decimal-usdc"].state, "ok");
  assert.equal(byKey["decimal-usdc"].value, "10.50");
  assert.equal(byKey["decimal-usdc"].population, null);
  assert.equal(byKey["decimal-usdc"].window, null);
  assert.notEqual(byKey["string-zero"].unit, byKey["negative"].unit);
});

function syntheticRosterFile(resources) {
  const document = {
    role: "synthetic_conflict_roster",
    observedAt: "2026-01-02T00:00:01.000Z",
    sources: {
      cdp: {
        freshness: {
          newestLastUpdated: "2026-01-02T00:00:00.000Z",
          retrievedAt: "2026-01-02T00:00:01.000Z",
        },
        coverage: { advertisedTotal: 6, state: "synthetic" },
        window: { kind: "synthetic", counterName: "l30DaysTotalCalls" },
        resources,
      },
    },
  };
  const bytes = Buffer.from(JSON.stringify(document));
  const file = path.join(mkdtempSync(path.join(tmpdir(), "observatory-synthetic-")), "roster.json");
  writeFileSync(file, bytes);
  return { file, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function normalizedResource(resource, { call = 5, payer = 2, time = "2026-01-02T00:00:00.000Z", amount = "1000", omitCall = false } = {}) {
  const counters = { l30DaysUniquePayers: payer };
  if (!omitCall) counters.l30DaysTotalCalls = call;
  return {
    resource,
    clusterKey: resource,
    lastUpdated: time,
    counters,
    listedAccept: { entries: [{ scheme: "exact", network: "eip155:8453", asset: "0xabc", amountAtomic: amount }] },
  };
}

test("original and fresh cuts refuse listed-accept and state conflicts", async (t) => {
  const clock = "2026-01-02T00:00:00.000Z";
  const resources = [
    normalizedResource("https://fixture.example/call-a", { call: 5 }),
    normalizedResource("https://fixture.example/call-a", { call: 6 }),
    normalizedResource("https://fixture.example/payer-b", { payer: 2 }),
    normalizedResource("https://fixture.example/payer-b", { payer: 3 }),
    normalizedResource("https://fixture.example/state-c", { call: 4 }),
    normalizedResource("https://fixture.example/state-c", { omitCall: true }),
    normalizedResource("https://fixture.example/clock-d", { time: clock }),
    normalizedResource("https://fixture.example/clock-d", { time: "2026-01-02T00:05:00.000Z" }),
    normalizedResource(EXTRACT, { amount: "1000" }),
    normalizedResource(EXTRACT, { amount: "2000" }),
    normalizedResource("https://fixture.example/clean", { call: 11, payer: 1, amount: "3" }),
  ];
  const roster = syntheticRosterFile(resources);
  const original = await mount(t, {
    fetchImpl: createFetch(),
    capturePath: roster.file,
    capturePin: { sha256: roster.sha256 },
  });
  const originalBody = await getJson(original.base, "/api/observatory/convergence");
  assert.equal(originalBody.body.originalWindow.sourceTime, "2026-01-02T00:00:00.000Z");
  assert.notEqual(originalBody.body.originalWindow.sourceTime, "2026-10-10T13:22:24.391Z");
  assert.equal(originalBody.body.originalWindow.coverage.advertisedTotal, "6");
  assert.notEqual(originalBody.body.originalWindow.coverage.advertisedTotal, "32228");
  assert.equal(originalBody.body.enrollment.originalCapture.installed, false);
  assert.equal(originalBody.body.enrollment.originalCapture.required, false);
  for (const resource of [
    "https://fixture.example/call-a",
    "https://fixture.example/payer-b",
    "https://fixture.example/state-c",
    "https://fixture.example/clock-d",
    EXTRACT,
  ]) {
    assert.ok(originalBody.body.originalWindow.contradictoryResources.includes(resource));
    assert.equal(originalBody.body.originalWindow.convergence.rankCount === 1, true);
  }
  assert.equal(originalBody.body.originalWindow.convergence.top.clusterKey, "https://fixture.example/clean");
  assert.equal(originalBody.body.originalWindow.convergence.top.callLabel.value, "11");
  assert.equal(originalBody.body.originalWindow.ownRow[0].listing, "contradictory_duplicate");
  assert.equal(originalBody.body.originalWindow.ownRow[0].callLabel.value, null);
  assert.equal(originalBody.body.originalWindow.ownRow[0].payerLabel.value, null);
  assert.equal(originalBody.body.originalWindow.ownRow[0].listedAccept, null);

  const page1 = discoveryPageUrl({ limit: 20, offset: 0 });
  const fetchImpl = createFetch((url) => {
    if (url === page1) {
      return jsonResponse(pageBody([
        discoveryItem(EXTRACT, 5, 2, "2026-10-10T17:00:00.000Z", { amount: "1000" }),
        discoveryItem(EXTRACT, 5, 2, "2026-10-10T17:00:00.000Z", { amount: "2000" }),
        discoveryItem("https://fixture.example/state-c", 4, 2, "2026-10-10T17:00:00.000Z"),
        discoveryItem("https://fixture.example/state-c", 4, 2, "2026-10-10T17:00:00.000Z", {
          quality: { l30DaysUniquePayers: 2 },
        }),
        discoveryItem("https://fixture.example/clean", 11, 1, "2026-10-10T17:00:00.000Z", { amount: "3" }),
      ], { limit: 20, offset: 0, total: 5 }));
    }
    if (url === discoveryPageUrl({ limit: 20, offset: 20 })) {
      return jsonResponse(pageBody([], { limit: 20, offset: 20, total: 5 }));
    }
    throw new Error(url);
  });
  const fresh = await mount(t, { fetchImpl });
  const freshBody = await getJson(fresh.base, "/api/observatory/convergence/refresh");
  assert.ok(freshBody.body.currentCut.contradictoryResources.includes(EXTRACT));
  assert.ok(freshBody.body.currentCut.contradictoryResources.includes("https://fixture.example/state-c"));
  assert.equal(freshBody.body.currentCut.convergence.top.clusterKey, "https://fixture.example/clean");
  assert.equal(freshBody.body.currentCut.ownRow[0].listing, "contradictory_duplicate");
  assert.equal(freshBody.body.currentCut.ownRow[0].listedAccept, null);
  assert.equal(freshBody.body.currentCut.ownRow[0].callLabel.value, null);
  assert.equal(freshBody.body.originalWindow.reason, "original_capture_absent");
  assert.equal(freshBody.body.denominatorDelta.rankRefreshed, false);
  assert.equal(freshBody.body.denominatorDelta.rowsMixed, false);
  assert.equal(freshBody.body.currentCut.coverage.marketWide, false);
});

test("metadata read keeps the denominator and does not rank rows", async (t) => {
  const page1 = discoveryPageUrl({ limit: 20, offset: 0 });
  const fetchImpl = createFetch((url) => {
    if (url === page1) {
      return jsonResponse(pageBody([
        discoveryItem(EXTRACT, 12, 10, "2026-10-10T17:00:00.000Z", { amount: "5000" }),
        discoveryItem("https://fixture.example/high", 40, 4, "2026-10-10T17:00:00.000Z"),
      ], { limit: 20, offset: 0, total: 90 }));
    }
    throw new Error(url);
  });
  const { base } = await mount(t, { fetchImpl });
  const { status, body } = await getJson(base, "/api/observatory/convergence/metadata");
  assert.equal(status, 200);
  assert.equal(body.schemaVersion, CONVERGENCE_SCHEMA);
  assert.equal(body.route, "/api/observatory/convergence/metadata");
  assert.equal(fetchImpl.calls.filter((call) => call.url.includes("api.cdp.coinbase.com")).length, 1);
  assert.equal(fetchImpl.calls.some((call) => call.url === URLS.moltjobs), false);
  assert.equal(body.bridge.fetched, false);
  assert.equal(body.upstreamBudget.discoveryPagesMax, 1);
  assert.equal(body.upstreamBudget.discoveryPagesFetched, 1);
  assert.equal(body.currentCut.reason, "metadata_only");
  assert.equal(body.currentCut.itemsAdmitted, false);
  assert.equal(body.currentCut.convergence, null);
  assert.equal(body.currentCut.coverage.advertisedTotal, "90");
  assert.equal(body.currentCut.coverage.observedListingCount, null);
  assert.equal(body.currentCut.coverage.marketWide, false);
  assert.equal(body.currentCut.pages[0].itemsUsedForRank, false);
  assert.equal(body.currentCut.ownRow[0].listing, "metadata_only");
  assert.equal(body.currentCut.ownRow[0].callLabel.value, null);
  assert.equal(body.denominatorDelta.rankRefreshed, false);
  assert.equal(body.denominatorDelta.eventDataRefreshed, false);
  assert.equal(body.denominatorDelta.rowsMixed, false);
  assert.equal(body.originalWindow.reason, "original_capture_absent");
});

test("default routes keep the convergence schema separate from the legacy schema", async (t) => {
  const { base } = await mount(t, { fetchImpl: createFetch() });
  const convergence = await getJson(base, "/api/observatory/convergence");
  assert.equal(convergence.body.schemaVersion, CONVERGENCE_SCHEMA);
  assert.equal(convergence.body.bridge.schemaVersion, SCHEMA_VERSION);
  assert.equal(convergence.body.enrollment.originalCapture.required, false);
  assert.equal(convergence.body.enrollment.originalCapture.installed, false);
  assert.equal(convergence.body.originalWindow.reason, "original_capture_absent");
  const snapshot = await getJson(base, "/api/observatory/snapshot");
  assert.equal(snapshot.body.schemaVersion, SCHEMA_VERSION);
  assert.notEqual(snapshot.body.schemaVersion, CONVERGENCE_SCHEMA);
  const sources = await getJson(base, "/api/observatory/sources");
  assert.equal(sources.status, 200);
  assert.equal(JSON.stringify(sources.body).includes(CONVERGENCE_SCHEMA), false);
});

test("configured historical capture keeps its clocks and labels", { skip: HISTORICAL_CAPTURE ? false : "optional historical capture is not configured" }, async (t) => {
  const CAPTURE = JSON.parse(readFileSync(HISTORICAL_CAPTURE, "utf8"));
  const fetchImpl = createFetch();
  const { base } = await mount(t, { fetchImpl, capturePath: HISTORICAL_CAPTURE });
  const { status, body, text } = await getJson(base, "/api/observatory/convergence");
  assert.equal(status, 200);
  assert.equal(body.schemaVersion, CONVERGENCE_SCHEMA);
  assert.equal(body.authority.paid, false);
  assert.deepEqual(body.authority.methods, ["GET", "OPTIONS"]);
  assert.equal(body.authority.postUsed, false);
  assert.equal(body.authority.quotePostUsed, false);
  assert.equal(body.additivity, "not_additive");
  assert.equal(body.upstreamBudget.discoveryPagesFetched, 0);
  assert.equal(body.currentCut.reason, "not_requested");
  assert.equal(body.currentCut.coverage.observedListingCount, null);
  assert.equal(body.currentCut.measuredZero, false);
  assert.equal(body.originalWindow.rowsEmitted, false);
  assert.equal(body.originalWindow.separatedFromCurrentCut, true);
  assert.equal(body.originalWindow.sourceTime, "2026-10-10T13:22:24.391Z");
  assert.equal(body.originalWindow.collectionTime, "2026-10-10T13:29:15.623Z");
  assert.equal(body.originalWindow.pageRetrievedAt, "2026-10-10T13:29:15.612Z");
  assert.notEqual(body.originalWindow.sourceTime, body.originalWindow.collectionTime);
  assert.equal(body.originalWindow.sourceClock, "stale");
  assert.equal(body.originalWindow.collectionClock, "current");
  assert.equal(body.originalWindow.availability, "stale");
  assert.equal(body.originalWindow.coverage.advertisedTotal, CAPTURE.sources.cdp.coverage.advertisedTotal);
  assert.equal(body.originalWindow.coverage.observedListingCount, String(CAPTURE.sources.cdp.resources.length));
  assert.equal(body.originalWindow.coverage.marketWide, false);
  assert.equal(body.originalWindow.window.realtime, false);
  assert.equal(body.originalWindow.convergence.top.clusterKey, "https://www.ax1.vc/api/dashboard/q-verdict/resource");
  assert.equal(body.originalWindow.convergence.top.callLabel.value, "410601");
  assert.equal(body.originalWindow.convergence.top.responseOrderUsed, false);
  assert.equal(body.originalWindow.convergence.rowsEmitted, false);
  assert.equal(body.originalWindow.convergence.rankCount, CAPTURE.sources.cdp.resources.length);
  const own = body.originalWindow.ownRow[0];
  assert.equal(own.resource, EXTRACT);
  assert.equal(own.listing, "listed_in_fetched_pages");
  assert.equal(own.callLabel.value, "12");
  assert.equal(own.callLabel.unit, "provider_call_label");
  assert.equal(own.payerLabel.value, "10");
  assert.equal(own.payerLabel.unit, "provider_payer_label");
  assert.equal(own.listedAccept.income, null);
  assert.equal(own.listedAccept.entries[0].amountAtomic, "5000");
  assert.equal(own.listedAccept.entries[0].unit, "atomic");
  assert.equal(own.listedAccept.convertedToCurrency, false);
  assert.equal(own.ownedSettlements.state, "unknown");
  assert.equal(own.ownedSettlements.value, null);
  assert.equal(own.declaredUsefulness.value, null);
  assert.equal(own.outsideAcceptance.value, null);
  assert.equal(own.walletInference, false);
  assert.equal(own.labelToMoney, false);
  assert.equal(own.nextAction, null);
  assert.equal(body.denominatorDelta.rankRefreshed, false);
  assert.equal(body.denominatorDelta.eventDataRefreshed, false);
  assert.equal(body.denominatorDelta.rowsMixed, false);
  assert.equal(body.bridge.fetched, true);
  assert.equal(body.bridge.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(body.enrollment.bridge.enrolled, ["moltjobs", "x402stats", "smithery_mcp"]);
  assert.ok(body.enrollment.bridge.presentNotEnrolled.includes("moltjobs_open_jobs"));
  assert.equal(Buffer.byteLength(text), text.length);
  assert.ok(Buffer.byteLength(text) < MAX_RESPONSE_BYTES, `convergence body ${text.length}`);
  assert.equal(text.includes("https://example-not-in-top.invalid"), false);
  const buried = CAPTURE.sources.cdp.resources[1500].resource;
  assert.equal(buried === EXTRACT, false);
  assert.equal(text.includes(buried), false);
  assert.equal(fetchImpl.calls.some((call) => call.url.includes("api.cdp.coinbase.com")), false);
});

test("bridge observations keep USD and USDC from the mounted adapters", async (t) => {
  const { base } = await mount(t, { fetchImpl: createFetch() });
  const { status, body } = await getJson(base, "/api/observatory/convergence");
  assert.equal(status, 200);
  const usd = metric(body.bridge.observations, "x402stats", "volume_usd_30d");
  const usdc = metric(body.bridge.observations, "moltjobs", "volumeUsdc");
  assert.equal(usd.unit, "USD");
  assert.equal(usd.state, "ok");
  assert.equal(usd.value, 1021.25);
  assert.equal(usdc.unit, "USDC");
  assert.equal(usdc.state, "ok");
  assert.equal(usdc.value, "10.50");
  assert.notEqual(usd.unit, usdc.unit);
  const legacy = await getJson(base, "/api/observatory/snapshot");
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(legacy.body.observations.length, 4);
  assert.equal(legacy.body.additivity, "not_additive");
  const sources = await getJson(base, "/api/observatory/sources");
  assert.equal(sources.status, 200);
  assert.equal(sources.body.sources.length, 4);
  const unknown = await getJson(base, "/api/observatory/sources/cdp_x402_discovery_resources");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "unknown_source");
});

test("refresh ranks two provider pages and does not mix the original rows", async (t) => {
  const page1 = discoveryPageUrl({ limit: 20, offset: 0 });
  const lowFirst = "https://fixture.example/low";
  const highSecond = "https://fixture.example/high";
  const fetchImpl = createFetch((url) => {
    if (url === page1) {
      return jsonResponse(pageBody([
        discoveryItem(lowFirst, 3, 1, "2026-10-10T17:00:00.000Z", { asset: "USD", amount: "1" }),
        discoveryItem("https://fixture.example/mid", 8, 2, "2026-10-10T16:00:00.000Z"),
      ], { limit: 15, offset: 0, total: 90 }));
    }
    const page2 = discoveryPageUrl({ limit: 15, offset: 15 });
    if (url === page2) {
      return jsonResponse(pageBody([
        discoveryItem(highSecond, 40, 4, "2026-10-10T17:05:00.000Z", { asset: "USDC", amount: "9" }),
        discoveryItem(lowFirst, 3, 1, "2026-10-10T17:00:00.000Z", { asset: "USD", amount: "1" }),
      ], { limit: 15, offset: 15, total: 90 }));
    }
    throw new Error(`unexpected page ${url}`);
  });
  const { base } = await mount(t, { fetchImpl });
  const { status, body } = await getJson(base, "/api/observatory/convergence/refresh");
  assert.equal(status, 200);
  assert.equal(fetchImpl.calls.filter((call) => call.url.includes("api.cdp.coinbase.com")).length, 2);
  assert.equal(fetchImpl.calls.some((call) => call.url === URLS.moltjobs), false);
  assert.equal(body.bridge.fetched, false);
  assert.equal(body.bridge.observations.find((entry) => entry.sourceId === "x402stats").metrics, null);
  assert.equal(body.bridge.observations.find((entry) => entry.sourceId === "x402stats").measuredZero, false);
  assert.equal(body.currentCut.rowsFromOriginal, false);
  assert.equal(body.currentCut.coverage.advertisedTotal, "90");
  assert.equal(body.currentCut.coverage.observedListingCount, "3");
  assert.equal(body.currentCut.coverage.truncated, true);
  assert.equal(body.currentCut.coverage.marketWide, false);
  assert.equal(body.currentCut.pages[0].observedLimit, "15");
  assert.equal(body.currentCut.pages[1].requested.offset, 15);
  assert.equal(body.currentCut.duplicatePages.includes(lowFirst), true);
  assert.equal(body.currentCut.convergence.top.clusterKey, highSecond);
  assert.equal(body.currentCut.convergence.top.callLabel.value, "40");
  assert.equal(body.currentCut.convergence.responseOrderUsed, false);
  assert.equal(body.currentCut.convergence.rank.length, 3);
  const high = body.currentCut.convergence.rank[0];
  const low = body.currentCut.convergence.rank.find((row) => row.clusterKey === lowFirst);
  assert.equal(high.resources[0] !== lowFirst, true);
  assert.equal(low.callLabel.value, "3");
  assert.notEqual(
    body.currentCut.convergence.rank.find((row) => row.clusterKey === highSecond).payerLabels[0].unit,
    "USD",
  );
  const assets = body.currentCut.convergence.rank.flatMap((row) => row.listedAccepts.flatMap((entry) => entry.entries.map((item) => item.asset)));
  assert.ok(assets.includes("USD"));
  assert.ok(assets.includes("USDC"));
  assert.equal(assets.includes("USD") && assets.includes("USDC"), true);
  assert.ok(body.currentCut.convergence.rank.every((row) => row.listedAccepts.every((entry) => entry.convertedToCurrency === false && entry.income === null)));
  assert.equal(body.originalWindow.availability, "unavailable");
  assert.equal(body.originalWindow.reason, "original_capture_absent");
  assert.equal(body.originalWindow.convergence, null);
  assert.equal(body.originalWindow.coverage.advertisedTotal, null);
  assert.equal(body.currentCut.ownRow[0].listing, "not_in_fetched_pages");
  assert.equal(body.currentCut.ownRow[0].callLabel.value, null);
  assert.equal(body.currentCut.ownRow[0].callLabel.state, "unavailable");
  assert.equal(body.currentCut.ownRow[0].notInFetchedPagesIsCatalogAbsence, false);
  assert.equal(body.currentCut.coverage.marketWide, false);
  assert.equal(body.denominatorDelta.originalAdvertisedTotal, null);
  assert.equal(body.denominatorDelta.currentAdvertisedTotal, "90");
  assert.equal(body.denominatorDelta.changed, null);
  assert.equal(body.denominatorDelta.rankRefreshed, false);
  assert.equal(body.denominatorDelta.eventDataRefreshed, false);
  assert.equal(body.denominatorDelta.rowsMixed, false);
  assert.equal(JSON.stringify(body.currentCut).includes("410601"), false);
});

test("changed totals, contradictory rows, and corrupt labels stay explicit", async (t) => {
  const page1 = discoveryPageUrl({ limit: 20, offset: 0 });
  const shared = "https://fixture.example/shared";
  const fetchImpl = createFetch((url) => {
    if (url === page1) {
      return jsonResponse(pageBody([
        discoveryItem(shared, 5, 1, "2026-10-10T17:00:00.000Z"),
        discoveryItem("https://fixture.example/clean", 6, 2, "2026-10-10T17:00:00.000Z"),
        discoveryItem("https://fixture.example/bad-number", "nope", true, "yesterday", {
          quality: { l30DaysTotalCalls: "nope", l30DaysUniquePayers: true },
        }),
        discoveryItem("https://fixture.example/object-metric", 2, 1, "2026-10-10T17:00:00.000Z", {
          quality: { l30DaysTotalCalls: { value: "2" }, l30DaysUniquePayers: 1 },
        }),
      ], { limit: 20, offset: 0, total: 40 }));
    }
    if (url === discoveryPageUrl({ limit: 20, offset: 20 })) {
      return jsonResponse(pageBody([
        discoveryItem(shared, 9, 1, "2026-10-10T17:00:00.000Z"),
      ], { limit: 20, offset: 20, total: 41 }));
    }
    throw new Error(`unexpected page ${url}`);
  });
  const { base } = await mount(t, { fetchImpl });
  const { body } = await getJson(base, "/api/observatory/convergence/refresh");
  assert.equal(body.currentCut.coverage.advertisedTotal, null);
  assert.equal(body.currentCut.coverage.advertisedTotalState, "changed_between_pages");
  assert.deepEqual(body.currentCut.coverage.advertisedTotals, ["40", "41"]);
  assert.equal(body.denominatorDelta.changed, null);
  assert.equal(body.denominatorDelta.rankRefreshed, false);
  assert.ok(body.currentCut.contradictoryResources.includes(shared));
  assert.equal(body.currentCut.convergence.top.clusterKey, "https://fixture.example/clean");
  assert.equal(body.currentCut.convergence.rank.some((row) => row.clusterKey === shared), false);
  const bad = body.currentCut.unranked.find((row) => row.clusterKey === "https://fixture.example/bad-number");
  assert.equal(bad.callLabels[0].state, "invalid");
  assert.equal(bad.callLabels[0].value, null);
  const objectMetric = body.currentCut.unranked.find((row) => row.clusterKey === "https://fixture.example/object-metric");
  assert.equal(objectMetric.callLabels[0].state, "invalid");
  assert.equal(objectMetric.callLabels[0].value, null);
  assert.equal(body.currentCut.ownRow[0].listing, "not_in_fetched_pages");
});

test("stale, future, unknown, and mixed row clocks stay distinct", async (t) => {
  async function cut(items) {
    const page1 = discoveryPageUrl({ limit: 20, offset: 0 });
    const fetchImpl = createFetch((url) => {
      if (url === page1) {
        return jsonResponse(pageBody(items, { limit: 20, offset: 0, total: 2 }));
      }
      if (url === discoveryPageUrl({ limit: 20, offset: 20 })) {
        return jsonResponse(pageBody([], { limit: 20, offset: 20, total: 2 }));
      }
      throw new Error(url);
    });
    const { base } = await mount(t, { fetchImpl });
    const { body } = await getJson(base, "/api/observatory/convergence/refresh");
    return body.currentCut;
  }
  const stale = await cut([
    discoveryItem("https://fixture.example/old", 4, 1, "2020-01-01T00:00:00.000Z"),
  ]);
  assert.equal(stale.availability, "stale");
  assert.equal(stale.clock.staleCount, 1);
  assert.equal(stale.convergence.top.callLabel.value, "4");
  const future = await cut([
    discoveryItem("https://fixture.example/later", 4, 1, "2026-10-10T18:00:00.000Z"),
  ]);
  assert.equal(future.availability, "error");
  assert.equal(future.clock.futureCount, 1);
  assert.equal(future.convergence, null);
  assert.equal(future.measuredZero, false);
  const unknown = await cut([
    discoveryItem("https://fixture.example/unknown", 4, 1, "not-a-clock", { omitTime: false }),
  ]);
  assert.equal(unknown.clock.unknownCount, 1);
  assert.equal(unknown.convergence.top.callLabel.value, "4");
  const mixed = await cut([
    discoveryItem("https://fixture.example/now", 7, 1, "2026-10-10T17:00:00.000Z"),
    discoveryItem("https://fixture.example/old", 3, 1, "2020-01-01T00:00:00.000Z"),
  ]);
  assert.equal(mixed.availability, "partial");
  assert.equal(mixed.clock.mixed, true);
  assert.equal(mixed.convergence.top.clusterKey, "https://fixture.example/now");
  assert.ok(mixed.convergence.rank.length >= 2);
});

test("upstream 429, 401, and 402 stay unavailable and unquoted", async (t) => {
  for (const statusCode of [429, 401, 402]) {
    const fetchImpl = createFetch(() => jsonResponse({ error: "no" }, statusCode));
    const { base } = await mount(t, { fetchImpl });
    const { status, body } = await getJson(base, "/api/observatory/convergence/refresh");
    assert.equal(status, 200);
    assert.equal(body.currentCut.availability, "unavailable");
    assert.equal(body.currentCut.measuredZero, false);
    assert.equal(body.currentCut.coverage.observedListingCount, null);
    assert.equal(body.currentCut.coverage.advertisedTotal, null);
    assert.equal(body.currentCut.convergence, null);
    assert.equal(body.currentCut.ownRow[0].callLabel.value, null);
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].method, "GET");
    if (statusCode === 402) {
      assert.equal(body.currentCut.pages[0].reason, "upstream_402");
      assert.equal(body.currentCut.pages[0].quoteAccepted, false);
    }
    assert.equal(body.authority.quotePostUsed, false);
    assert.equal(body.authority.purchaseAuthority, false);
  }
});

test("timeout, oversize, and malformed bodies stay bounded", async (t) => {
  const hanging = createFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));
  const keep = setInterval(() => {}, 20);
  try {
    const { base } = await mount(t, { fetchImpl: hanging, timeoutMs: 30 });
    const { status, body } = await getJson(base, "/api/observatory/convergence/refresh");
    assert.equal(status, 200);
    assert.equal(body.currentCut.availability, "unavailable");
    assert.equal(body.currentCut.pages[0].reason, "timeout");
    assert.equal(body.currentCut.coverage.observedListingCount, null);
    assert.equal(body.currentCut.ownRow[0].callLabel.value, null);
  } finally {
    clearInterval(keep);
  }

  const bulky = "x".repeat(300);
  const oversize = createFetch(() => jsonResponse({ items: [{ resource: bulky }] }));
  const over = await mount(t, { fetchImpl: oversize, maxBytes: 80 });
  const overBody = await getJson(over.base, "/api/observatory/convergence/refresh");
  assert.equal(overBody.status, 200);
  assert.equal(overBody.body.currentCut.availability, "error");
  assert.equal(overBody.body.currentCut.pages[0].reason, "oversized_body");
  assert.equal(overBody.body.currentCut.measuredZero, false);
  assert.equal(overBody.body.currentCut.coverage.observedListingCount, null);

  const malformed = createFetch(() => new Response("not-json{", {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  const bad = await mount(t, { fetchImpl: malformed });
  const badBody = await getJson(bad.base, "/api/observatory/convergence/refresh");
  assert.equal(badBody.body.currentCut.availability, "error");
  assert.equal(badBody.body.currentCut.pages[0].reason, "malformed_json");
  assert.equal(badBody.body.currentCut.ownRow[0].payerLabel.value, null);
});

test("query strings and off-host redirects are refused", async (t) => {
  const fetchImpl = createFetch((url) => {
    if (url.includes("api.cdp.coinbase.com")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/collect" },
      });
    }
    throw new Error(url);
  });
  const { base } = await mount(t, { fetchImpl });
  const query = await getJson(base, "/api/observatory/convergence?target=https://evil.example/collect");
  assert.equal(query.status, 400);
  assert.equal(query.body.error, "query_not_allowed");
  assert.equal(fetchImpl.calls.length, 0);
  const refreshQuery = await getJson(base, "/api/observatory/convergence/refresh?offset=999");
  assert.equal(refreshQuery.status, 400);
  const metadataQuery = await getJson(base, "/api/observatory/convergence/metadata?limit=1000");
  assert.equal(metadataQuery.status, 400);
  assert.equal(metadataQuery.body.error, "query_not_allowed");
  const { body } = await getJson(base, "/api/observatory/convergence/refresh");
  assert.equal(body.currentCut.pages[0].reason, "off_host_redirect");
  assert.equal(fetchImpl.calls.every((call) => call.url.startsWith("https://api.cdp.coinbase.com/")), true);
  assert.equal(fetchImpl.calls.some((call) => call.url.includes("evil.example")), false);
  const post = await fetch(`${base}/api/observatory/convergence`, { method: "POST", body: "{}" });
  assert.equal(post.status, 404);
});

test("absent capture and hash mismatch do not become a zero rank", async (t) => {
  const missing = await mount(t, { fetchImpl: createFetch(), capturePath: "" });
  const absent = await getJson(missing.base, "/api/observatory/convergence");
  assert.equal(absent.body.originalWindow.availability, "unavailable");
  assert.equal(absent.body.originalWindow.reason, "original_capture_absent");
  assert.equal(absent.body.originalWindow.coverage.advertisedTotal, null);
  assert.equal(absent.body.originalWindow.coverage.observedListingCount, null);
  assert.equal(absent.body.originalWindow.convergence, null);
  assert.equal(absent.body.originalWindow.measuredZero, false);

  const wrong = path.join(mkdtempSync(path.join(tmpdir(), "observatory-mismatch-")), "wrong.json");
  writeFileSync(wrong, JSON.stringify({ sources: { cdp: { resources: [], coverage: { advertisedTotal: 0 } } } }));
  const mismatched = await mount(t, { fetchImpl: createFetch(), capturePath: wrong });
  const hashed = await getJson(mismatched.base, "/api/observatory/convergence");
  assert.equal(hashed.body.originalWindow.availability, "error");
  assert.equal(hashed.body.originalWindow.reason, "original_capture_hash_mismatch");
  assert.equal(hashed.body.originalWindow.convergence, null);
  assert.equal(hashed.body.originalWindow.coverage.observedListingCount, null);
  assert.equal(hashed.body.originalWindow.ownRow[0].callLabel.value, null);
});

test("a compatible GET task can be linked and a POST task cannot", async (t) => {
  const ownedResources = [{
    resource: EXTRACT,
    offeringId: "samedaydesk-extract",
    method: "GET",
    compatibleTask: {
      compatible: true,
      method: "GET",
      path: "/extract",
      input: "document url",
      output: "extracted text",
    },
  }];
  const linked = await mount(t, { fetchImpl: createFetch(), ownedResources });
  const yes = await getJson(linked.base, "/api/observatory/convergence");
  assert.equal(yes.body.originalWindow.ownRow[0].nextAction.method, "GET");
  assert.equal(yes.body.originalWindow.ownRow[0].nextAction.path, "/extract");
  assert.equal(yes.body.originalWindow.ownRow[0].nextAction.trafficReferral, false);
  const postTask = await mount(t, {
    fetchImpl: createFetch(),
    ownedResources: [{
      resource: EXTRACT,
      offeringId: "samedaydesk-extract",
      method: "POST",
      compatibleTask: { compatible: true, method: "POST", path: "/extract", input: "x", output: "y" },
    }],
  });
  const no = await getJson(postTask.base, "/api/observatory/convergence");
  assert.equal(no.body.originalWindow.ownRow[0].nextAction, null);
});

test("options allows the named origin and legacy positioning still answers", async (t) => {
  const { base } = await mount(t, { fetchImpl: createFetch() });
  const allowed = await fetch(`${base}/api/observatory/convergence`, {
    method: "OPTIONS",
    headers: { Origin: "https://neomorphic.io" },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  const denied = await fetch(`${base}/api/observatory/convergence/refresh`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(denied.status, 403);
  const positioning = await getJson(base, "/api/observatory/positioning");
  assert.equal(positioning.status, 200);
  assert.ok(positioning.body);
});

test("mounted metrics use one unit contract for counts, money, and custom units", async (t) => {
  const app = express();
  const beyond = Number.MAX_SAFE_INTEGER + 2;
  const runtime = { observeAll: async () => ({ schemaVersion: SCHEMA_VERSION,
    fetchedAt: REQUEST_TIME, additivity: "not_additive", observations: [{
      sourceId: "unknown-source", availability: "ok", metrics: [
        { key: "count-fraction", state: "ok", value: 1.5, unit: "count" },
        { key: "count-text", state: "ok", value: "10.50", unit: "count" },
        { key: "count-huge-number", state: "ok", value: beyond, unit: "count" },
        { key: "count-huge-text", state: "ok", value: "9007199254740993", unit: "count" },
        { key: "usd-decimal", state: "ok", value: "10.50", unit: "USD" },
        { key: "usdc-zero", state: "ok", value: "0", unit: "USDC" },
        { key: "usd-huge", state: "ok", value: beyond, unit: "USD" },
        { key: "custom-zero", state: "ok", value: 0, unit: "transactions" },
        { key: "negative", state: "ok", value: -1, unit: "USD" },
      ],
    }] }) };
  app.use("/api/observatory", createObservatoryRouter({ runtime, now: () => REQUEST_MS, originalCapturePath: "" }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const { body } = await getJson(base, "/api/observatory/convergence");
  const observation = body.bridge.observations[0];
  assert.equal(observation.sourceId, "unknown-source");
  const byKey = Object.fromEntries(observation.metrics.map((entry) => [entry.key, entry]));
  for (const key of ["count-fraction", "count-text", "count-huge-number", "count-huge-text", "usd-huge", "negative"]) {
    assert.equal(byKey[key].state, "invalid", key);
    assert.equal(byKey[key].value, null, key);
  }
  assert.equal(byKey["count-fraction"].unit, "count");
  assert.equal(byKey["count-fraction"].unitClass, "count");
  assert.equal(byKey["usd-decimal"].state, "ok");
  assert.equal(byKey["usd-decimal"].value, "10.50");
  assert.equal(byKey["usd-decimal"].unit, "USD");
  assert.equal(byKey["usd-decimal"].unitClass, "money");
  assert.equal(byKey["usdc-zero"].value, "0");
  assert.equal(byKey["usdc-zero"].unit, "USDC");
  assert.equal(byKey["usdc-zero"].unitClass, "money");
  assert.notEqual(byKey["usd-decimal"].unit, byKey["usdc-zero"].unit);
  assert.equal(byKey["custom-zero"].state, "ok");
  assert.equal(byKey["custom-zero"].value, 0);
  assert.equal(byKey["custom-zero"].unit, "transactions");
  assert.equal(byKey["custom-zero"].unitClass, "custom");
  assert.equal(byKey["negative"].value, null);
  assert.notEqual(byKey["negative"].value, 0);
});
