import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  BRIDGE_ROUTE,
  BRIDGE_TRANSPORT,
  DEFAULT_CORS_ORIGIN,
  createMarketObservationsRouter,
} from "../routes/market-observations.js";
import { FIXED_UPSTREAM_URL, MAX_RESPONSE_BYTES } from "../lib/market-observations/upstream-fetch.js";

const FETCHED_AT_MS = Date.parse("2026-09-09T23:00:00.000Z");
const FETCHED_AT = "2026-09-09T23:00:00.000Z";
const SOURCE_TIME_OK = "2026-09-09T22:55:00.000Z";
const SOURCE_TIME_STALE = "2020-01-01T00:00:00.000Z";

const HAPPY_BODY = Object.freeze({
  totalJobs: 12,
  totalCompleted: 4,
  totalAgents: 3,
  totalVolumeUsdc: "10.50",
  escrowedUsdc: "1.25",
  avgCompletionTimeMs: 1500,
  medianCompletionTimeMs: 900,
  completionSampleSize: 4,
  disputeRate: "0.01",
  updatedAt: SOURCE_TIME_OK,
});

function metric(envelope, key) {
  return (envelope.metrics || []).find((entry) => entry && entry.key === key) || null;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createMockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(url, init, calls);
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

async function mountBridge(t, options = {}) {
  const fetchImpl = options.fetchImpl || createMockFetch(() => jsonResponse(HAPPY_BODY));
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/market-observations",
    createMarketObservationsRouter({
      fetchImpl,
      now: options.now || (() => FETCHED_AT_MS),
      timeoutMs: options.timeoutMs ?? 8000,
      cacheTtlMs: options.cacheTtlMs ?? 30_000,
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

function assertBridgeHeaders(headers) {
  assert.equal(headers.get("x-market-obs-bridge"), "samedaydesk");
  assert.equal(headers.get("x-market-obs-upstream"), FIXED_UPSTREAM_URL);
  assert.match(headers.get("vary") || "", /Origin/i);
}

function assertNoInventedZeros(envelope) {
  for (const entry of envelope.metrics || []) {
    if (entry.state !== "ok") {
      assert.equal(entry.value, null, `${entry.key} must not invent a value when ${entry.state}`);
    }
  }
}

test("happy fixture maps metrics and keeps fetchedAt distinct from sourceTime", async (t) => {
  const fetchImpl = createMockFetch((url, init) => {
    assert.equal(String(url), FIXED_UPSTREAM_URL);
    assert.equal(init.redirect, "manual");
    assert.equal(init.method, "GET");
    const accept = init.headers.Accept || init.headers.accept;
    assert.equal(accept, "application/json");
    return jsonResponse(HAPPY_BODY);
  });
  const { base } = await mountBridge(t, { fetchImpl });
  const unknown = await request(base, "/api/does-not-exist");
  assert.equal(unknown.status, 404);

  const res = await request(base, BRIDGE_ROUTE);
  assert.equal(res.status, 200);
  assertBridgeHeaders(res.headers);
  const body = res.body;
  assert.equal(body.schemaVersion, "pilot.market-observation.v1");
  assert.equal(body.transport, BRIDGE_TRANSPORT);
  assert.equal(body.bridgeRoute, BRIDGE_ROUTE);
  assert.equal(body.upstreamUrl, FIXED_UPSTREAM_URL);
  assert.equal(body.fetchedAt, FETCHED_AT);
  assert.equal(body.sourceTime, SOURCE_TIME_OK);
  assert.notEqual(body.fetchedAt, body.sourceTime);
  assert.equal(body.sourceTimeState, "ok");
  assert.equal(body.httpStatus, 200);
  assert.equal(body.availability, "ok");
  assert.equal(metric(body, "jobCount").value, 12);
  assert.equal(metric(body, "jobCount").state, "ok");
  assert.equal(metric(body, "completedCount").value, 4);
  assert.equal(metric(body, "registeredAgents").value, 3);
  assert.equal(metric(body, "volumeUsdc").value, "10.50");
  assert.equal(metric(body, "escrowDeposits").value, "1.25");
  assert.equal(metric(body, "posts").state, "missing");
  assert.equal(metric(body, "posts").value, null);
  assert.equal(metric(body, "completionRatio").value, "4/12");
  assert.ok(body.withheldConclusions.includes("agent_traffic"));
  assert.ok(body.withheldConclusions.includes("customers"));
  assert.ok(body.withheldConclusions.includes("revenue"));
  assert.equal(body.rawProviderBody.totalJobs, 12);
  assert.equal(body.cache.hit, false);
  assert.equal(body.cache.stale, false);
  assert.equal(body.cache.ttlMs, 30_000);
  assert.equal(body.cache.fetchedAt, FETCHED_AT);
});

test("timeout is an explicit unavailable error, not a zero total", async (t) => {
  const fetchImpl = createMockFetch((_url, init) => new Promise((_, reject) => {
    const abort = () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    };
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener("abort", abort, { once: true });
  }));
  const { base } = await mountBridge(t, { fetchImpl, timeoutMs: 40 });
  const res = await request(base, BRIDGE_ROUTE);
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "unavailable");
  assert.equal(res.body.error.code, "timeout");
  assert.equal(res.body.httpStatus, null);
  assert.equal(metric(res.body, "jobCount").state, "unavailable");
  assert.equal(metric(res.body, "jobCount").value, null);
  assertNoInventedZeros(res.body);
});

test("oversized body is an explicit error and is not parsed as metrics", async (t) => {
  const fetchImpl = createMockFetch(() => new Response("n".repeat(MAX_RESPONSE_BYTES + 1), {
    status: 200,
    headers: { "content-type": "application/json", "content-length": String(MAX_RESPONSE_BYTES + 1) },
  }));
  const { base } = await mountBridge(t, { fetchImpl });
  const res = await request(base, BRIDGE_ROUTE);
  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "oversized_body");
  assert.equal(res.body.availability, "source_error");
  assert.equal(metric(res.body, "jobCount").value, null);
  assert.equal(res.body.rawProviderBody, undefined);
  assertNoInventedZeros(res.body);
});

test("malformed and partial JSON are source_error, not zeros", async (t) => {
  const fetchImpl = createMockFetch(() => new Response('{"totalJobs":12,', {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  const { base } = await mountBridge(t, { fetchImpl });
  const res = await request(base, BRIDGE_ROUTE);
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "source_error");
  assert.equal(res.body.error.code, "malformed_json");
  assert.equal(metric(res.body, "jobCount").state, "source_error");
  assert.equal(metric(res.body, "jobCount").value, null);
  assertNoInventedZeros(res.body);
});

test("stale provider clock is an explicit sourceTimeState", async (t) => {
  const fetchImpl = createMockFetch(() => jsonResponse({
    ...HAPPY_BODY,
    updatedAt: SOURCE_TIME_STALE,
  }));
  const { base } = await mountBridge(t, { fetchImpl });
  const res = await request(base, BRIDGE_ROUTE);
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "ok");
  assert.equal(res.body.sourceTime, SOURCE_TIME_STALE);
  assert.equal(res.body.fetchedAt, FETCHED_AT);
  assert.notEqual(res.body.fetchedAt, res.body.sourceTime);
  assert.equal(res.body.sourceTimeState, "stale");
  assert.ok(res.body.warnings.some((warning) => warning.code === "stale_source_time"));
  assert.equal(metric(res.body, "jobCount").value, 12);
});

test("two concurrent requests share a single upstream GET", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const enteredGate = new Promise((resolve) => {
    entered = resolve;
  });
  const fetchImpl = createMockFetch(async () => {
    entered();
    await gate;
    return jsonResponse(HAPPY_BODY);
  });
  const { base } = await mountBridge(t, { fetchImpl });
  const first = request(base, BRIDGE_ROUTE);
  await enteredGate;
  const second = request(base, BRIDGE_ROUTE);
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
  const fetchImpl = createMockFetch(() => jsonResponse(HAPPY_BODY));
  const { base } = await mountBridge(t, { fetchImpl });
  const first = await request(base, BRIDGE_ROUTE);
  const second = await request(base, BRIDGE_ROUTE);
  assert.equal(first.body.cache.hit, false);
  assert.equal(second.body.cache.hit, true);
  assert.equal(second.body.cache.stale, false);
  assert.equal(second.body.cache.ttlMs, 30_000);
  assert.ok(second.body.cache.ageMs === 0 || second.body.cache.ageMs > 0);
  assert.equal(second.body.fetchedAt, first.body.fetchedAt);
  assert.equal(metric(second.body, "jobCount").value, 12);
  assert.equal(fetchImpl.calls.length, 1);
});

test("CORS allowlist echoes https://neomorphic.io exactly", async (t) => {
  const { base } = await mountBridge(t);
  const res = await request(base, BRIDGE_ROUTE, { headers: { Origin: DEFAULT_CORS_ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), DEFAULT_CORS_ORIGIN);
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-methods") || "", /GET/);
  assert.match(res.headers.get("access-control-allow-headers") || "", /Accept/i);
  assert.match(res.headers.get("vary") || "", /Origin/i);
});

test("CORS deny omits ACAO for https://evil.example", async (t) => {
  const { base } = await mountBridge(t);
  const res = await request(base, BRIDGE_ROUTE, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.body.availability, "ok");
});

test("OPTIONS allowlisted origin is 204; denied origin is 403 without ACAO", async (t) => {
  const { base } = await mountBridge(t);
  const allowed = await request(base, BRIDGE_ROUTE, {
    method: "OPTIONS",
    headers: {
      Origin: DEFAULT_CORS_ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Accept",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), DEFAULT_CORS_ORIGIN);
  assert.match(allowed.headers.get("access-control-allow-methods") || "", /GET/);
  assert.match(allowed.headers.get("access-control-allow-headers") || "", /Accept/i);

  const denied = await request(base, BRIDGE_ROUTE, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("url= query override is ignored; upstream stays the fixed stats URL", async (t) => {
  const fetchImpl = createMockFetch((url) => {
    assert.equal(String(url), FIXED_UPSTREAM_URL);
    assert.equal(String(url).includes("evil"), false);
    return jsonResponse(HAPPY_BODY);
  });
  const { base } = await mountBridge(t, { fetchImpl });
  const res = await request(base, `${BRIDGE_ROUTE}?url=https://evil.example/steal`);
  assert.equal(res.status, 200);
  assert.equal(res.body.upstreamUrl, FIXED_UPSTREAM_URL);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, FIXED_UPSTREAM_URL);
});

test("caller Authorization and Cookie are not forwarded upstream", async (t) => {
  const fetchImpl = createMockFetch((_url, init) => {
    const headers = new Headers(init.headers || {});
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("x-api-key"), null);
    assert.equal(headers.get("accept"), "application/json");
    const keys = [...headers.keys()].map((key) => key.toLowerCase());
    assert.equal(keys.includes("authorization"), false);
    assert.equal(keys.includes("cookie"), false);
    return jsonResponse(HAPPY_BODY);
  });
  const { base } = await mountBridge(t, { fetchImpl });
  const res = await request(base, BRIDGE_ROUTE, {
    headers: {
      Authorization: "Bearer should-not-leak",
      Cookie: "session=should-not-leak",
      "X-Api-Key": "should-not-leak",
      Origin: DEFAULT_CORS_ORIGIN,
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, "ok");
  assert.equal(fetchImpl.calls.length, 1);
});

test("optional live MARKET_OBS_LIVE real GET", async (t) => {
  if (process.env.MARKET_OBS_LIVE !== "1") {
    t.skip("MARKET_OBS_LIVE is not 1");
    return;
  }
  const app = express();
  app.use("/api/market-observations", createMarketObservationsRouter({ timeoutMs: 8000 }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  try {
    const res = await request(base, BRIDGE_ROUTE);
    if (res.body && res.body.error && (res.body.error.kind === "network" || res.body.error.code === "network" || res.body.error.code === "timeout")) {
      t.skip(`live upstream failed after try: ${res.body.error.message || res.body.error.code}`);
      return;
    }
    assert.equal(res.status, 200);
    assert.equal(res.body.upstreamUrl, FIXED_UPSTREAM_URL);
    assert.equal(res.headers.get("x-market-obs-upstream"), FIXED_UPSTREAM_URL);
    if (res.body.availability === "ok") {
      assert.ok(res.body.fetchedAt);
      console.log(`LIVE_UPSTREAM fetchedAt=${res.body.fetchedAt} sourceTime=${res.body.sourceTime} sourceTimeState=${res.body.sourceTimeState} httpStatus=${res.body.httpStatus}`);
    } else {
      console.log(`LIVE_UPSTREAM availability=${res.body.availability} error=${JSON.stringify(res.body.error)} fetchedAt=${res.body.fetchedAt}`);
    }
  } catch (error) {
    t.skip(`live upstream network failed after try: ${error && error.message ? error.message : error}`);
  }
});
