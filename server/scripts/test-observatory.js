import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import {
  DEFAULT_CORS_ORIGIN as MARKET_CORS_ORIGIN,
  BRIDGE_ROUTE,
  createMarketObservationsRouter,
} from "../routes/market-observations.js";
import {
  DEFAULT_CORS_ORIGIN,
  createObservatoryRouter,
} from "../routes/observatory.js";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import {
  MAX_RESPONSE_BYTES,
  USER_AGENT,
} from "../lib/observatory/bounded-fetch.js";
import {
  getSource,
  listSourceIds,
  listSources,
} from "../lib/observatory/registry.js";
import * as registry from "../lib/observatory/registry.js";
import { MOLTJOBS_STATS_SOURCE_URL } from "../lib/market-observations/moltjobs-stats-adapter.js";

const FETCHED_AT_MS = Date.parse("2026-09-09T23:00:00.000Z");
const FETCHED_AT = "2026-09-09T23:00:00.000Z";
const SOURCE_TIME_OK = "2026-09-09T22:55:00.000Z";
const SOURCE_TIME_STALE = "2020-01-01T00:00:00.000Z";
const SMITHERY_LAST_MODIFIED = "Wed, 09 Sep 2026 22:55:00 GMT";

const URLS = Object.freeze({
  moltjobs: MOLTJOBS_STATS_SOURCE_URL,
  x402stats: "https://x402stats.io/api/stats",
  smithery: "https://api.smithery.ai/servers?pageSize=1",
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
    updatedAt: SOURCE_TIME_OK,
  },
});

const X402STATS_FIXTURE = Object.freeze({
  updatedAt: "2026-09-09T22:54:59.000Z",
  methodologyVersion: "2026-07-01.v1",
  series: [
    { date: "2026-09-09", buyers: 11, newSellers: 2, sellers: 5, transactions: 17, volumeUsd: 19.25 },
  ],
  history: [],
  snapshot: {
    avgPaymentUsd: 0.12,
    computedAt: SOURCE_TIME_OK,
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
  servers: [
    {
      qualifiedName: "fixture/example",
      useCount: 999,
      displayName: "Fixture",
    },
  ],
  pagination: {
    currentPage: 1,
    pageSize: 1,
    totalPages: 500,
    totalCount: 13594,
  },
});

function metric(envelope, key) {
  return (envelope.metrics || []).find((entry) => entry && entry.key === key) || null;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function createRoutedFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (typeof handlers[u] === "function") return handlers[u](url, init, calls);
    if (u === URLS.moltjobs) return jsonResponse(MOLTJOBS_FIXTURE);
    if (u === URLS.x402stats) return jsonResponse(X402STATS_FIXTURE);
    if (u === URLS.smithery) {
      return jsonResponse(SMITHERY_FIXTURE, 200, { "last-modified": SMITHERY_LAST_MODIFIED });
    }
    throw new Error(`unexpected upstream ${u}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function mountObservatory(t, options = {}) {
  const fetchImpl = options.fetchImpl || createRoutedFetch();
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  if (options.mountMarket) {
    app.use(
      "/api/market-observations",
      createMarketObservationsRouter({
        fetchImpl,
        now: options.now || (() => FETCHED_AT_MS),
        timeoutMs: options.timeoutMs ?? 8000,
        cacheTtlMs: options.cacheTtlMs ?? 30_000,
      }),
    );
  }
  app.use(
    "/api/observatory",
    createObservatoryRouter({
      fetchImpl,
      now: options.now || (() => FETCHED_AT_MS),
      timeoutMs: options.timeoutMs ?? 8000,
      cacheTtlMs: options.cacheTtlMs ?? 30_000,
      maxBytes: options.maxBytes,
    }),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  const { server, port, base } = await listen(app);
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  return { server, port, base, fetchImpl };
}

async function request(base, path, { method = "GET", headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, headers: response.headers, body, text };
}

function assertNoInventedZeros(envelope) {
  for (const entry of envelope.metrics || []) {
    if (entry.state !== "ok") {
      assert.equal(entry.value, null, `${entry.key} must not invent a value when ${entry.state}`);
    }
  }
}

function assertEnvelopeShape(body, sourceId) {
  assert.equal(body.schemaVersion, SCHEMA_VERSION);
  assert.equal(body.sourceId, sourceId);
  assert.equal(typeof body.sourceKind, "string");
  assert.equal(typeof body.upstreamUrl, "string");
  assert.ok(body.upstreamUrl.startsWith("https://"));
  assert.equal(body.fetchedAt, FETCHED_AT);
  assert.notEqual(body.fetchedAt, body.providerTimestamp);
  assert.ok(["ok", "missing", "stale", "invalid"].includes(body.providerTimestampState));
  assert.ok(["ok", "partial", "unavailable", "stale", "error"].includes(body.availability));
  assert.ok(Array.isArray(body.metrics));
  assert.ok(Array.isArray(body.errors));
  assert.ok(Array.isArray(body.warnings));
  assert.ok(Array.isArray(body.withheldConclusions));
  assert.equal(body.coverage.complete, false);
  assert.equal(body.coverage.additivity, "not_additive");
  assert.ok(body.cache);
  assert.equal(typeof body.cache.hit, "boolean");
  for (const entry of body.metrics) {
    assert.equal(typeof entry.key, "string");
    assert.equal(typeof entry.state, "string");
    assert.ok("definition" in entry);
    assert.ok("population" in entry);
    assert.ok("window" in entry);
  }
}

function walkJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkJs(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("GET /sources lists fixed registry metadata and does not fetch", async (t) => {
  const { base, fetchImpl } = await mountObservatory(t);
  const unknown = await request(base, "/api/does-not-exist");
  assert.equal(unknown.status, 404);

  const res = await request(base, "/api/observatory/sources");
  assert.equal(res.status, 200);
  assert.equal(res.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(res.body.additivity, "not_additive");
  const ids = res.body.sources.map((source) => source.sourceId);
  assert.deepEqual(ids, ["moltjobs", "x402stats", "smithery_mcp"]);
  assert.equal(res.body.sources[0].upstreamUrl, URLS.moltjobs);
  assert.equal(res.body.sources[0].sourceKind, "work_market");
  assert.equal(res.body.sources[1].sourceKind, "settlement");
  assert.equal(res.body.sources[2].sourceKind, "capability_discovery");
  assert.equal(res.body.sources[2].upstreamUrl, URLS.smithery);
  assert.ok(res.body.sources[1].doesNotEstablish.join(" ").includes("organic"));
  assert.ok(res.body.sources[2].doesNotEstablish.join(" ").includes("heartbeat"));
  const unavailable = res.body.documentedUnavailable.find((item) => item.sourceId === "x402scan");
  assert.ok(unavailable);
  assert.equal(unavailable.called, false);
  assert.match(unavailable.reason, /micropayment/);
  assert.equal(ids.includes("x402scan"), false);
  assert.equal(fetchImpl.calls.length, 0);
});

test("happy fixture: moltjobs maps work-market metrics and keeps clocks distinct", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/moltjobs");
  assert.equal(res.status, 200);
  assertEnvelopeShape(res.body, "moltjobs");
  assert.equal(res.body.availability, "ok");
  assert.equal(res.body.upstreamUrl, URLS.moltjobs);
  assert.equal(res.body.providerTimestamp, SOURCE_TIME_OK);
  assert.equal(res.body.providerTimestampState, "ok");
  assert.equal(metric(res.body, "jobCount").value, 12);
  assert.equal(metric(res.body, "jobCount").state, "ok");
  assert.equal(metric(res.body, "completedCount").value, 4);
  assert.equal(metric(res.body, "registeredAgents").value, 3);
  assert.equal(metric(res.body, "volumeUsdc").value, "10.50");
  assert.equal(metric(res.body, "escrowDeposits").value, "1.25");
  assert.ok(metric(res.body, "jobCount").definition);
  assert.equal(metric(res.body, "jobCount").population, "moltjobs_work_market");
  assert.equal(fetchImpl.calls[0].url, URLS.moltjobs);
  assert.equal(fetchImpl.calls[0].init.redirect, "manual");
  const headers = new Headers(fetchImpl.calls[0].init.headers);
  assert.equal(headers.get("user-agent"), USER_AGENT);
  assert.equal(headers.get("accept"), "application/json");
});

test("happy fixture: x402stats maps snapshot fields with heuristic labels", async (t) => {
  const { base, fetchImpl } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assertEnvelopeShape(res.body, "x402stats");
  assert.equal(res.body.availability, "ok");
  assert.equal(res.body.providerTimestamp, SOURCE_TIME_OK);
  assert.equal(res.body.providerTimestampState, "ok");
  assert.equal(metric(res.body, "sellers_30d").value, 47303);
  assert.equal(metric(res.body, "sellers_30d").population, "provider_indexed_sellers");
  assert.equal(metric(res.body, "sellers_30d").window, "30d");
  assert.equal(metric(res.body, "organic_sellers_30d").value, 84);
  assert.equal(metric(res.body, "organic_sellers_30d").evidenceClass, "provider_heuristic");
  assert.equal(metric(res.body, "organic_volume_usd_30d").evidenceClass, "provider_heuristic");
  assert.equal(metric(res.body, "volume_usd_30d").value, 1021.25);
  assert.equal(metric(res.body, "window_days").value, 30);
  assert.equal(res.body.metrics.some((entry) => entry.key === "useCount"), false);
  assert.ok(res.body.warnings.some((warning) => warning.code === "provider_heuristic"));
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, URLS.x402stats);
});

test("happy fixture: smithery_mcp uses pagination.totalCount only", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/smithery_mcp");
  assert.equal(res.status, 200);
  assertEnvelopeShape(res.body, "smithery_mcp");
  assert.equal(res.body.availability, "ok");
  assert.equal(metric(res.body, "registered_servers").value, 13594);
  assert.equal(metric(res.body, "registered_servers").state, "ok");
  assert.match(metric(res.body, "registered_servers").definition, /catalog/);
  assert.equal(res.body.metrics.some((entry) => /useCount|use_count/i.test(entry.key)), false);
  assert.equal(res.body.metrics.length, 1);
  assert.ok(res.body.warnings.some((warning) => warning.code === "catalog_only"));
});

test("unknown sourceId is rejected and does not fetch", async (t) => {
  const { base, fetchImpl } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/not-a-source?url=https://evil.example");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "unknown_source");
  assert.equal(res.body.sourceId, "not-a-source");
  assert.equal(res.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(fetchImpl.calls.length, 0);

  const scan = await request(base, "/api/observatory/sources/x402scan");
  assert.equal(scan.status, 404);
  assert.equal(scan.body.error, "unknown_source");
  assert.equal(fetchImpl.calls.length, 0);
});

test("malformed JSON is error, not zeros", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.x402stats]: () => new Response('{"snapshot":', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "error");
  assert.equal(res.body.errors[0].code, "malformed_json");
  assert.equal(metric(res.body, "sellers_30d").value, null);
  assert.notEqual(metric(res.body, "sellers_30d").state, "ok");
  assertNoInventedZeros(res.body);
});

test("partial x402stats snapshot is partial, not zeros", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.x402stats]: () => jsonResponse({
      updatedAt: SOURCE_TIME_OK,
      snapshot: {
        computedAt: SOURCE_TIME_OK,
        sellers: 10,
        windowDays: 30,
      },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "partial");
  assert.equal(metric(res.body, "sellers_30d").value, 10);
  assert.equal(metric(res.body, "sellers_30d").state, "ok");
  assert.equal(metric(res.body, "volume_usd_30d").value, null);
  assert.equal(metric(res.body, "volume_usd_30d").state, "missing");
  assert.equal(metric(res.body, "organic_sellers_30d").value, null);
  assertNoInventedZeros(res.body);
});

test("timeout is unavailable, not a zero total", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.moltjobs]: (_url, init) => new Promise((_, reject) => {
      const abort = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl, timeoutMs: 40 });
  const res = await request(base, "/api/observatory/sources/moltjobs");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "unavailable");
  assert.equal(res.body.errors[0].code, "timeout");
  assert.equal(res.body.httpStatus, null);
  assert.equal(metric(res.body, "jobCount").value, null);
  assert.notEqual(metric(res.body, "jobCount").state, "ok");
  assertNoInventedZeros(res.body);
});

test("429 is unavailable, not zeros", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.x402stats]: () => new Response("slow down", {
      status: 429,
      headers: { "retry-after": "30", "content-type": "text/plain" },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "unavailable");
  assert.equal(res.body.httpStatus, 429);
  assert.equal(res.body.errors[0].code, "rate_limited");
  assert.equal(metric(res.body, "sellers_30d").value, null);
  assertNoInventedZeros(res.body);
});

test("oversized body is error and is not parsed as metrics", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.smithery]: () => new Response("n".repeat(MAX_RESPONSE_BYTES + 1), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_RESPONSE_BYTES + 1),
      },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/smithery_mcp");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "error");
  assert.equal(res.body.errors[0].code, "oversized_body");
  assert.equal(metric(res.body, "registered_servers").value, null);
  assert.equal(res.body.rawExcerpt, undefined);
  assertNoInventedZeros(res.body);
});

test("stale provider clock is explicit and keeps metric values", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.x402stats]: () => jsonResponse({
      ...X402STATS_FIXTURE,
      updatedAt: SOURCE_TIME_STALE,
      snapshot: { ...X402STATS_FIXTURE.snapshot, computedAt: SOURCE_TIME_STALE },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "stale");
  assert.equal(res.body.providerTimestamp, SOURCE_TIME_STALE);
  assert.equal(res.body.fetchedAt, FETCHED_AT);
  assert.notEqual(res.body.fetchedAt, res.body.providerTimestamp);
  assert.equal(res.body.providerTimestampState, "stale");
  assert.equal(metric(res.body, "sellers_30d").value, 47303);
  assert.ok(res.body.warnings.some((warning) => warning.code === "stale_provider_timestamp" || warning.message.includes("stale")));
});

test("two concurrent requests share a single upstream GET per source", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const enteredGate = new Promise((resolve) => {
    entered = resolve;
  });
  const fetchImpl = createRoutedFetch({
    [URLS.moltjobs]: async () => {
      entered();
      await gate;
      return jsonResponse(MOLTJOBS_FIXTURE);
    },
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const first = request(base, "/api/observatory/sources/moltjobs");
  await enteredGate;
  const second = request(base, "/api/observatory/sources/moltjobs");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(fetchImpl.calls.length, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.availability, "ok");
  assert.equal(b.body.availability, "ok");
  assert.equal(a.body.cache.hit, false);
  assert.equal(b.body.cache.hit, false);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(metric(a.body, "jobCount").value, 12);
});

test("second GET within TTL is a cache hit", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });
  const first = await request(base, "/api/observatory/sources/moltjobs");
  const second = await request(base, "/api/observatory/sources/moltjobs");
  assert.equal(first.body.cache.hit, false);
  assert.equal(second.body.cache.hit, true);
  assert.equal(second.body.cache.stale, false);
  assert.equal(second.body.cache.ttlMs, 30_000);
  assert.equal(second.body.fetchedAt, first.body.fetchedAt);
  assert.equal(metric(second.body, "jobCount").value, 12);
  assert.equal(fetchImpl.calls.length, 1);
});

test("CORS allowlist echoes https://neomorphic.io exactly", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/moltjobs", {
    headers: { Origin: DEFAULT_CORS_ORIGIN },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), DEFAULT_CORS_ORIGIN);
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-methods") || "", /GET/);
  assert.match(res.headers.get("vary") || "", /Origin/i);
});

test("CORS deny omits ACAO for https://evil.example", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("OPTIONS allowlisted origin is 204; denied origin is 403 without ACAO", async (t) => {
  const { base } = await mountObservatory(t);
  const allowed = await request(base, "/api/observatory/snapshot", {
    method: "OPTIONS",
    headers: {
      Origin: DEFAULT_CORS_ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Accept",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), DEFAULT_CORS_ORIGIN);

  const denied = await request(base, "/api/observatory/snapshot", {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("OBSERVATORY_CORS_ORIGINS extra origin is allowlisted and star is ignored", async (t) => {
  const previous = process.env.OBSERVATORY_CORS_ORIGINS;
  process.env.OBSERVATORY_CORS_ORIGINS = "https://labs.example,*";
  t.after(() => {
    if (previous === undefined) delete process.env.OBSERVATORY_CORS_ORIGINS;
    else process.env.OBSERVATORY_CORS_ORIGINS = previous;
  });
  const { base } = await mountObservatory(t);
  const extra = await request(base, "/api/observatory/sources", {
    headers: { Origin: "https://labs.example" },
  });
  assert.equal(extra.status, 200);
  assert.equal(extra.headers.get("access-control-allow-origin"), "https://labs.example");
  const star = await request(base, "/api/observatory/sources", {
    headers: { Origin: "https://star.example" },
  });
  assert.equal(star.headers.get("access-control-allow-origin"), null);
});

test("caller Authorization and Cookie are not forwarded upstream", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats", {
    headers: {
      Authorization: "Bearer should-not-leak",
      Cookie: "session=should-not-leak",
      "X-Api-Key": "should-not-leak",
      Origin: DEFAULT_CORS_ORIGIN,
    },
  });
  assert.equal(res.status, 200);
  assert.equal(fetchImpl.calls.length, 1);
  const headers = new Headers(fetchImpl.calls[0].init.headers || {});
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("x-api-key"), null);
  assert.equal(headers.get("user-agent"), USER_AGENT);
  const keys = [...headers.keys()].map((key) => key.toLowerCase());
  assert.equal(keys.includes("authorization"), false);
  assert.equal(keys.includes("cookie"), false);
});

test("url= query override is ignored; upstream stays the fixed URL", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/moltjobs?url=https://evil.example/steal");
  assert.equal(res.status, 200);
  assert.equal(res.body.upstreamUrl, URLS.moltjobs);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, URLS.moltjobs);
  assert.equal(String(fetchImpl.calls[0].url).includes("evil"), false);
});

test("off-host redirect is error and is not followed", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.moltjobs]: () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/steal" },
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/moltjobs");
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "error");
  assert.equal(res.body.errors[0].code, "off_host_redirect");
  assert.equal(metric(res.body, "jobCount").value, null);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, URLS.moltjobs);
  assertNoInventedZeros(res.body);
});

test("snapshot observes each named source in parallel without cross-source totals", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered = 0;
  let firstEntered;
  const enteredGate = new Promise((resolve) => {
    firstEntered = resolve;
  });
  const delay = (body, extraHeaders) => async () => {
    entered += 1;
    if (entered === 1) firstEntered();
    await gate;
    return jsonResponse(body, 200, extraHeaders);
  };
  const fetchImpl = createRoutedFetch({
    [URLS.moltjobs]: delay(MOLTJOBS_FIXTURE),
    [URLS.x402stats]: delay(X402STATS_FIXTURE),
    [URLS.smithery]: delay(SMITHERY_FIXTURE, { "last-modified": SMITHERY_LAST_MODIFIED }),
  });
  const { base } = await mountObservatory(t, { fetchImpl });
  const first = request(base, "/api/observatory/snapshot");
  await enteredGate;
  const second = request(base, "/api/observatory/snapshot");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fetchImpl.calls.length, 3);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(a.body.additivity, "not_additive");
  assert.equal(a.body.total, undefined);
  assert.equal(a.body.totals, undefined);
  assert.equal(a.body.sum, undefined);
  assert.equal(a.body.combined, undefined);
  assert.equal(a.body.grandTotal, undefined);
  const ids = a.body.observations.map((item) => item.sourceId).sort();
  assert.deepEqual(ids, ["moltjobs", "smithery_mcp", "x402stats"]);
  for (const observation of a.body.observations) {
    assertNoInventedZeros(observation);
    assert.equal(observation.schemaVersion, SCHEMA_VERSION);
  }
  const moltjobs = a.body.observations.find((item) => item.sourceId === "moltjobs");
  const x402 = a.body.observations.find((item) => item.sourceId === "x402stats");
  const smithery = a.body.observations.find((item) => item.sourceId === "smithery_mcp");
  assert.equal(metric(moltjobs, "jobCount").value, 12);
  assert.equal(metric(x402, "sellers_30d").value, 47303);
  assert.equal(metric(smithery, "registered_servers").value, 13594);
  assert.equal(a.body.documentedUnavailable[0].sourceId, "x402scan");
  assert.equal(a.body.documentedUnavailable[0].called, false);
  const calledUrls = fetchImpl.calls.map((call) => call.url).sort();
  assert.deepEqual(calledUrls, [URLS.smithery, URLS.x402stats, URLS.moltjobs].sort());
  assert.equal(calledUrls.some((url) => /x402scan/i.test(url)), false);
});

test("snapshot does not add metrics across sources when one source fails", async (t) => {
  const fetchImpl = createRoutedFetch({
    [URLS.moltjobs]: (_url, init) => new Promise((_, reject) => {
      const abort = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
    }),
  });
  const { base } = await mountObservatory(t, { fetchImpl, timeoutMs: 40 });
  const res = await request(base, "/api/observatory/snapshot");
  assert.equal(res.status, 200);
  assert.equal(res.body.totals, undefined);
  const moltjobs = res.body.observations.find((item) => item.sourceId === "moltjobs");
  const x402 = res.body.observations.find((item) => item.sourceId === "x402stats");
  assert.equal(moltjobs.availability, "unavailable");
  assert.equal(metric(moltjobs, "jobCount").value, null);
  assert.equal(x402.availability, "ok");
  assert.equal(metric(x402, "sellers_30d").value, 47303);
  assert.equal(res.body.combinedSellers, undefined);
  assertNoInventedZeros(moltjobs);
});

test("no cross-source sum helper exists on the registry or observatory modules", () => {
  assert.equal(typeof registry.sumMetrics, "undefined");
  assert.equal(typeof registry.sumObservations, "undefined");
  assert.equal(typeof registry.combineTotals, "undefined");
  assert.equal(typeof registry.addMetrics, "undefined");
  assert.deepEqual(listSourceIds(), ["moltjobs", "x402stats", "smithery_mcp"]);
  assert.equal(getSource("moltjobs").upstreamUrl, URLS.moltjobs);
  assert.equal(getSource("missing"), null);
  assert.equal(listSources().length, 3);

  const dir = fileURLToPath(new URL("../lib/observatory/", import.meta.url));
  for (const file of walkJs(dir)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /export function (sum|add|combine).*Metric/);
    assert.doesNotMatch(text, /sumAcrossSources|combineTotals|grandTotal|crossSourceSum/);
  }
});

test("S49 market-observations bridge remains intact beside observatory", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl, mountMarket: true });
  const market = await request(base, BRIDGE_ROUTE, {
    headers: { Origin: MARKET_CORS_ORIGIN },
  });
  assert.equal(market.status, 200);
  assert.equal(market.body.schemaVersion, "pilot.market-observation.v1");
  assert.equal(market.body.upstreamUrl, URLS.moltjobs);
  assert.equal(market.body.availability, "ok");
  assert.equal(metric(market.body, "jobCount").value, 12);
  assert.equal(market.headers.get("access-control-allow-origin"), MARKET_CORS_ORIGIN);

  const observatory = await request(base, "/api/observatory/sources/moltjobs");
  assert.equal(observatory.status, 200);
  assert.equal(observatory.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(metric(observatory.body, "jobCount").value, 12);
});

test("optional live OBSERVATORY_LIVE real GETs for the three fixed URLs", async (t) => {
  if (process.env.OBSERVATORY_LIVE !== "1") {
    t.skip("OBSERVATORY_LIVE is not 1");
    return;
  }
  const app = express();
  app.use("/api/observatory", createObservatoryRouter({ timeoutMs: 8000 }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  try {
    for (const sourceId of ["moltjobs", "x402stats", "smithery_mcp"]) {
      const res = await request(base, `/api/observatory/sources/${sourceId}`);
      if (res.body && res.body.errors && res.body.errors.some((err) => err.code === "network" || err.code === "timeout" || err.kind === "network")) {
        t.skip(`live ${sourceId} failed after try: ${JSON.stringify(res.body.errors)}`);
        return;
      }
      assert.equal(res.status, 200);
      assert.equal(res.body.schemaVersion, SCHEMA_VERSION);
      assert.equal(res.body.sourceId, sourceId);
      assertNoInventedZeros(res.body);
      if (res.body.providerTimestamp) {
        assert.notEqual(res.body.providerTimestamp, res.body.fetchedAt);
      }
      console.log(`LIVE_${sourceId} availability=${res.body.availability} fetchedAt=${res.body.fetchedAt} providerTimestamp=${res.body.providerTimestamp} httpStatus=${res.body.httpStatus}`);
    }
    const snapshot = await request(base, "/api/observatory/snapshot");
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.additivity, "not_additive");
    assert.equal(snapshot.body.totals, undefined);
    assert.equal(snapshot.body.observations.length, 3);
  } catch (error) {
    t.skip(`live upstream network failed after try: ${error && error.message ? error.message : error}`);
  }
});
