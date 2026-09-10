import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { createObservatoryRouter } from "../routes/observatory.js";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import {
  getSource,
  listSourceIds,
  listSources,
} from "../lib/observatory/registry.js";
import * as registry from "../lib/observatory/registry.js";
import { MOLTJOBS_STATS_SOURCE_URL } from "../lib/market-observations/moltjobs-stats-adapter.js";
import { metricSpecs as x402MetricSpecs } from "../lib/observatory/adapters/x402stats.js";
import { metricSpecs as smitheryMetricSpecs } from "../lib/observatory/adapters/smithery-mcp.js";

const FETCHED_AT_MS = Date.parse("2026-09-09T23:00:00.000Z");
const FETCHED_AT = "2026-09-09T23:00:00.000Z";
const SOURCE_TIME_OK = "2026-09-09T22:55:00.000Z";
const SMITHERY_LAST_MODIFIED = "Wed, 09 Sep 2026 22:55:00 GMT";

const URLS = Object.freeze({
  moltjobs: MOLTJOBS_STATS_SOURCE_URL,
  x402stats: "https://x402stats.io/api/stats",
  smithery: "https://api.smithery.ai/servers?pageSize=1",
});

const LOCKED_X402_METRIC_KEYS = Object.freeze([
  "sellers_30d",
  "volume_usd_30d",
  "organic_sellers_30d",
  "organic_volume_usd_30d",
  "avg_payment_usd_30d",
  "median_seller_revenue_usd_30d",
  "top10_volume_share_30d",
  "window_days",
]);

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
    asOf: SOURCE_TIME_OK,
    marketplace: {
      jobs: 10,
      completed: 3,
      settledVolumeUsdc: "8.25",
      employers: 5,
      fundedEmployers: 2,
    },
    platformPrograms: [
      { purpose: "PLATFORM_MARKETING", jobs: 2, budgetUsdc: "2.25" },
    ],
  },
});

const X402STATS_FIXTURE = Object.freeze({
  updatedAt: "2026-09-09T22:54:59.000Z",
  methodologyVersion: "2026-07-01.v1",
  series: [
    { date: "2026-09-08", buyers: 1000, newSellers: 9, sellers: 100, transactions: 50, volumeUsd: 500 },
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
      paidCustomers: 40,
    },
  ],
  pagination: {
    currentPage: 1,
    pageSize: 1,
    totalPages: 500,
    totalCount: 13594,
  },
  paidCustomers: 40,
  useCount: 999,
});

function metric(envelope, key) {
  return (envelope.metrics || []).find((entry) => entry && entry.key === key) || null;
}

function metricKeys(envelope) {
  return (envelope.metrics || []).map((entry) => entry.key);
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

function blob(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function paid(envelope) {
  assert.ok(envelope && envelope.paidActivity, "paidActivity must be present so absence of paid demand is explicit");
  return envelope.paidActivity;
}

function refusedBlob(envelope) {
  return (paid(envelope).refusedRatios || []).map((row) => {
    return [row.key, row.numeratorKey, row.denominatorKey, row.reason].map(blob).join(" ");
  }).join("\n");
}

function establishBlob(value) {
  if (Array.isArray(value)) return value.join(" ");
  return blob(value);
}

function looksLikePaidCustomerMetric(entry) {
  const text = [entry.key, entry.definition, entry.population, entry.evidenceClass].map(blob).join(" ");
  return /paid[_ -]?customer|unique[_ -]?human|registered[_ -]?vs[_ -]?paid|conversion_funnel|useCount|use_count|series_buyers/i.test(text)
    && !/not (a |independently verified )?(unique customers|paid-customer|paid customers|organic demand)/i.test(text)
    && !/not unique customers or organic demand proof/i.test(text)
    && !/not unique customers or paid-demand proof/i.test(text)
    && !/not a paid-customer count/i.test(text)
    && !/not paid customers/i.test(text);
}

function assertNoPaidCustomerMetric(envelope, extraForbidden = []) {
  const forbidden = [
    /useCount|use_count/i,
    /paid[_-]?customers?/i,
    /unique[_-]?humans?/i,
    /registered[_-]?vs[_-]?paid/i,
    /fundedEmployers/i,
    /series_buyers|^buyers$/i,
    /conversion/i,
    ...extraForbidden,
  ];
  for (const entry of envelope.metrics || []) {
    for (const pattern of forbidden) {
      assert.equal(pattern.test(entry.key), false, `metric ${entry.key} must not be a paid-demand invention`);
    }
    assert.equal(looksLikePaidCustomerMetric(entry), false, `metric ${entry.key} treats a non-paid field as paid customers`);
  }
}

function wouldAlignForSum(left, right) {
  return Boolean(
    left
    && right
    && left.state === "ok"
    && right.state === "ok"
    && left.population
    && left.population === right.population
    && left.window
    && left.window === right.window
    && left.unit
    && left.unit === right.unit,
  );
}

test("x402stats happy fixture: snapshot sellers/organic still map; organic is heuristic; paidActivity unavailable", async (t) => {
  const { base, fetchImpl } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);
  assertEnvelopeShape(res.body, "x402stats");
  assert.equal(res.body.availability, "ok");
  assert.equal(metric(res.body, "sellers_30d").value, 47303);
  assert.equal(metric(res.body, "sellers_30d").state, "ok");
  assert.equal(metric(res.body, "sellers_30d").population, "provider_indexed_sellers");
  assert.equal(metric(res.body, "sellers_30d").window, "30d");
  assert.equal(metric(res.body, "organic_sellers_30d").value, 84);
  assert.equal(metric(res.body, "organic_sellers_30d").state, "ok");
  assert.equal(metric(res.body, "organic_sellers_30d").evidenceClass, "provider_heuristic");
  assert.equal(metric(res.body, "organic_sellers_30d").population, "provider_heuristic_organic_sellers");
  assert.match(metric(res.body, "organic_sellers_30d").definition, /heuristic/i);
  assert.match(metric(res.body, "organic_sellers_30d").definition, /not unique customers/i);
  assert.equal(metric(res.body, "organic_volume_usd_30d").evidenceClass, "provider_heuristic");
  assert.equal(metric(res.body, "organic_volume_usd_30d").value, 840.5);
  assert.equal(metric(res.body, "volume_usd_30d").value, 1021.25);
  assert.equal(metric(res.body, "window_days").value, 30);

  const keys = metricKeys(res.body).slice().sort();
  assert.deepEqual(keys, LOCKED_X402_METRIC_KEYS.slice().sort());
  assert.deepEqual(x402MetricSpecs.map((spec) => spec.key).sort(), LOCKED_X402_METRIC_KEYS.slice().sort());
  assertNoPaidCustomerMetric(res.body);

  const activity = paid(res.body);
  assert.equal(activity.available, false);
  assert.equal(activity.sourceId, "x402stats");
  assert.match(activity.reason, /registered-vs-paid|marketplace-vs-program/i);
  assert.match(activity.reason, /heuristic/i);
  assert.match(activity.reason, /organic/i);
  assert.ok(Array.isArray(activity.ratios));
  assert.equal(activity.ratios.length, 0);
  assert.equal(activity.ratios.some((row) => row && row.state === "ok"), false);

  const refused = refusedBlob(res.body);
  assert.match(refused, /organic/i);
  assert.match(refused, /conversion/i);
  assert.ok(
    (activity.refusedRatios || []).some((row) => {
      return row.numeratorKey === "organic_sellers_30d" && row.denominatorKey === "sellers_30d";
    }),
    "refusedRatios must name organic_sellers_30d / sellers_30d as unpaid conversion",
  );
  assert.equal(
    res.body.metrics.some((entry) => entry.numeratorKey === "organic_sellers_30d" && entry.denominatorKey === "sellers_30d" && entry.state === "ok"),
    false,
    "must not emit organic/sellers as an ok conversion metric",
  );

  const populationIds = (activity.populations || []).map((row) => row.id);
  assert.ok(populationIds.includes("provider_indexed_sellers"));
  assert.ok(populationIds.includes("provider_heuristic_organic_sellers"));
  assert.equal(populationIds.some((id) => /paid[_ -]?customer|registered[_ -]?vs[_ -]?paid|funded|marketplace/i.test(id)), false);
  assert.match(establishBlob(activity.doesNotEstablish), /paid-customer|unique humans/i);
  assert.ok(res.body.withheldConclusions.includes("paid_demand_population"));
  assert.ok(res.body.withheldConclusions.includes("conversion_funnel"));
  assert.ok(res.body.withheldConclusions.includes("unique_customers"));
  assert.ok(res.body.warnings.some((warning) => warning.code === "provider_heuristic"));
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, URLS.x402stats);
});

test("x402stats series is not summed into snapshot metrics; buyers are not unique humans", async (t) => {
  const seriesSumSellers = 100 + 5;
  const seriesSumVolume = 500 + 19.25;
  const seriesSumBuyers = 1000 + 11;
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });
  const res = await request(base, "/api/observatory/sources/x402stats");
  assert.equal(res.status, 200);

  assert.equal(metric(res.body, "sellers_30d").value, 47303);
  assert.notEqual(metric(res.body, "sellers_30d").value, seriesSumSellers);
  assert.notEqual(metric(res.body, "sellers_30d").value, 47303 + seriesSumSellers);
  assert.notEqual(metric(res.body, "sellers_30d").value, 5);
  assert.equal(metric(res.body, "volume_usd_30d").value, 1021.25);
  assert.notEqual(metric(res.body, "volume_usd_30d").value, seriesSumVolume);
  assert.notEqual(metric(res.body, "volume_usd_30d").value, 1021.25 + seriesSumVolume);
  assert.equal(metric(res.body, "organic_sellers_30d").value, 84);
  assert.notEqual(metric(res.body, "organic_sellers_30d").value, seriesSumBuyers);

  assert.equal(metric(res.body, "buyers"), null);
  assert.equal(metric(res.body, "series_buyers"), null);
  assert.equal(metric(res.body, "unique_humans"), null);
  assert.equal(metric(res.body, "uniqueHumans"), null);
  assert.equal(res.body.metrics.some((entry) => /buyer/i.test(entry.key)), false);
  assert.equal(res.body.metrics.some((entry) => /unique[_-]?human/i.test(entry.key)), false);
  assert.equal(
    res.body.metrics.some((entry) => entry.value === seriesSumBuyers || entry.value === 1000 || entry.value === 11),
    false,
    "series buyers must not appear as a metric value",
  );

  const refused = refusedBlob(res.body);
  assert.match(refused, /buyers/i);
  assert.match(refused, /unique humans/i);
  assert.ok(
    (paid(res.body).refusedRatios || []).some((row) => /series_buyers|unique humans/i.test(`${row.key} ${row.reason}`)),
    "refusedRatios must say series buyers are not unique humans",
  );
  assert.ok(res.body.withheldConclusions.includes("unique_customers"));
  assert.match(establishBlob(paid(res.body).doesNotEstablish), /unique humans/i);
  assert.match(res.body.coverage.notes || "", /series|heuristic|not additive/i);
});

test("x402stats does not grow a registered-vs-paid population; missing stays missing", async (t) => {
  const extraRegisteredVsPaid = {
    ...X402STATS_FIXTURE,
    snapshot: {
      ...X402STATS_FIXTURE.snapshot,
      registeredSellers: 900,
      paidSellers: 40,
      paidCustomers: 40,
      fundedEmployers: 7,
      marketplace: { jobs: 1, settledVolumeUsdc: 9 },
    },
    registeredSellers: 900,
    paidCustomers: 40,
  };
  const missingOrganic = {
    updatedAt: SOURCE_TIME_OK,
    series: X402STATS_FIXTURE.series,
    snapshot: {
      computedAt: SOURCE_TIME_OK,
      sellers: 10,
      volumeUsd: 3.5,
      avgPaymentUsd: 0.2,
      medianSellerRevenueUsd: 0.01,
      top10VolumeShare: 0.5,
      windowDays: 30,
    },
  };
  const organicZero = {
    updatedAt: SOURCE_TIME_OK,
    snapshot: {
      ...missingOrganic.snapshot,
      organicSellers: 0,
      organicVolumeUsd: 0,
    },
  };

  const grownMount = await mountObservatory(t, {
    fetchImpl: createRoutedFetch({
      [URLS.x402stats]: () => jsonResponse(extraRegisteredVsPaid),
    }),
  });
  const grown = await request(grownMount.base, "/api/observatory/sources/x402stats");
  assert.equal(grown.status, 200);
  assert.equal(paid(grown.body).available, false);
  assert.deepEqual(metricKeys(grown.body).sort(), LOCKED_X402_METRIC_KEYS.slice().sort());
  assert.equal(metric(grown.body, "registeredSellers"), null);
  assert.equal(metric(grown.body, "paidSellers"), null);
  assert.equal(metric(grown.body, "paidCustomers"), null);
  assert.equal(metric(grown.body, "fundedEmployers"), null);
  assert.equal(metric(grown.body, "marketplaceJobs"), null);
  assert.equal(grown.body.metrics.some((entry) => entry.value === 900 || entry.value === 40 || entry.value === 7), false);
  assert.equal((paid(grown.body).populations || []).some((row) => /paid[_ -]?customer|registered[_ -]?vs[_ -]?paid|funded/i.test(row.id)), false);
  assert.equal((paid(grown.body).ratios || []).length, 0);
  assertNoPaidCustomerMetric(grown.body);
  assert.equal(metric(grown.body, "sellers_30d").value, 47303);

  const missingMount = await mountObservatory(t, {
    fetchImpl: createRoutedFetch({
      [URLS.x402stats]: () => jsonResponse(missingOrganic),
    }),
  });
  const missing = await request(missingMount.base, "/api/observatory/sources/x402stats");
  assert.equal(missing.status, 200);
  assert.equal(paid(missing.body).available, false);
  assert.equal(metric(missing.body, "sellers_30d").value, 10);
  assert.equal(metric(missing.body, "sellers_30d").state, "ok");
  assert.equal(metric(missing.body, "organic_sellers_30d").value, null);
  assert.equal(metric(missing.body, "organic_sellers_30d").state, "missing");
  assert.equal(metric(missing.body, "organic_volume_usd_30d").value, null);
  assert.equal(metric(missing.body, "organic_volume_usd_30d").state, "missing");
  assert.notEqual(metric(missing.body, "organic_sellers_30d").state, "ok");
  assertNoInventedZeros(missing.body);
  assert.match(refusedBlob(missing.body), /organic/i);
  assert.equal((paid(missing.body).populations || []).some((row) => /paid[_ -]?customer|registered[_ -]?vs[_ -]?paid/i.test(row.id)), false);

  const zeroMount = await mountObservatory(t, {
    fetchImpl: createRoutedFetch({
      [URLS.x402stats]: () => jsonResponse(organicZero),
    }),
  });
  const zero = await request(zeroMount.base, "/api/observatory/sources/x402stats");
  assert.equal(zero.status, 200);
  assert.equal(metric(zero.body, "organic_sellers_30d").state, "ok");
  assert.equal(metric(zero.body, "organic_sellers_30d").value, 0);
  assert.equal(metric(zero.body, "organic_volume_usd_30d").state, "ok");
  assert.equal(metric(zero.body, "organic_volume_usd_30d").value, 0);
  assert.equal(paid(zero.body).available, false);
  assert.equal(metric(zero.body, "organic_sellers_30d").evidenceClass, "provider_heuristic");
});

test("smithery_mcp still has exactly one catalog metric and no paid activity", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/smithery_mcp");
  assert.equal(res.status, 200);
  assertEnvelopeShape(res.body, "smithery_mcp");
  assert.equal(res.body.availability, "ok");
  assert.equal(res.body.metrics.length, 1);
  assert.equal(smitheryMetricSpecs.length, 1);
  assert.deepEqual(metricKeys(res.body), ["registered_servers"]);
  assert.equal(metric(res.body, "registered_servers").value, 13594);
  assert.equal(metric(res.body, "registered_servers").state, "ok");
  assert.equal(metric(res.body, "registered_servers").population, "smithery_server_catalog");
  assert.equal(metric(res.body, "registered_servers").window, "catalog_snapshot");
  assert.equal(metric(res.body, "registered_servers").evidenceClass, "catalog_registration_count");
  assert.match(metric(res.body, "registered_servers").definition, /catalog/i);
  assert.match(metric(res.body, "registered_servers").definition, /not runtime heartbeats or active traffic/i);

  assert.equal(res.body.metrics.some((entry) => /useCount|use_count/i.test(entry.key)), false);
  assert.equal(metric(res.body, "useCount"), null);
  assert.equal(metric(res.body, "paidCustomers"), null);
  assert.equal(metric(res.body, "paid_customers"), null);
  assert.equal(res.body.metrics.some((entry) => entry.value === 999 || entry.value === 40), false);
  assertNoPaidCustomerMetric(res.body);

  const activity = paid(res.body);
  assert.equal(activity.available, false);
  assert.equal(activity.sourceId, "smithery_mcp");
  assert.match(activity.reason, /catalog/i);
  assert.match(activity.reason, /not (traffic, )?paid|not paid/i);
  assert.ok(Array.isArray(activity.ratios));
  assert.equal(activity.ratios.length, 0);
  assert.deepEqual((activity.populations || []).map((row) => row.id), ["smithery_server_catalog"]);
  assert.match((activity.populations || [])[0].notes, /catalog/i);
  assert.ok(res.body.warnings.some((warning) => warning.code === "catalog_only"));
  assert.ok(res.body.withheldConclusions.includes("paid_demand_population"));
  assert.ok(res.body.withheldConclusions.includes("active_traffic"));
  assert.ok(res.body.withheldConclusions.includes("runtime_heartbeats"));
});

test("adversarial consumer must not treat smithery registered_servers as paid demand", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/sources/smithery_mcp");
  const catalog = await request(base, "/api/observatory/sources");
  assert.equal(res.status, 200);
  assert.equal(catalog.status, 200);

  const descriptor = (catalog.body.sources || []).find((source) => source.sourceId === "smithery_mcp");
  assert.ok(descriptor);
  const activity = paid(res.body);
  const registered = metric(res.body, "registered_servers");
  assert.equal(res.body.metrics.length, 1);
  assert.equal(registered.value, 13594);

  const withheld = res.body.withheldConclusions || [];
  assert.ok(withheld.includes("paid_demand_population"));
  assert.ok(withheld.includes("customers") || withheld.includes("unique_customers"));
  assert.ok(withheld.includes("demand") || withheld.includes("paid_demand_population"));
  assert.ok(withheld.includes("active_traffic"));

  const doesNot = `${establishBlob(descriptor.doesNotEstablish)} ${establishBlob(activity.doesNotEstablish)}`;
  assert.match(doesNot, /paid customers|demand/i);
  assert.match(establishBlob(activity.doesNotEstablish), /paid customers/i);
  assert.match(establishBlob(descriptor.doesNotEstablish), /demand|heartbeat|traffic/i);

  const refused = activity.refusedRatios || [];
  assert.ok(refused.length > 0);
  assert.ok(
    refused.some((row) => {
      const text = `${row.key} ${row.numeratorKey} ${row.reason}`;
      return /registered_servers/i.test(text) && /paid|traffic|customer/i.test(text);
    }),
    "paidActivity.refusedRatios must cover registered_servers as paid demand",
  );
  assert.match(refusedBlob(res.body), /catalog registration count is not paid demand/i);
  assert.equal(activity.available, false);
  assert.match(activity.reason, /catalog/i);
  assert.match(activity.reason, /paid/i);

  assert.equal(
    activity.available === true || registered.population === "paid_customers",
    false,
    "consumer must not classify catalog registrations as a paid population",
  );
  assert.notEqual(registered.population, "paid_customers");
  assert.notEqual(registered.evidenceClass, "paid_demand");
  assert.equal(/paid[_ -]?demand|paid[_ -]?customer/i.test(registered.population || ""), false);
  assert.match(registered.definition, /catalog/);
  assert.doesNotMatch(registered.definition, /paid customer/i);
  assert.match(res.body.coverage.notes || "", /catalog/i);
});

test("snapshot additivity forbids summing moltjobs marketplaceSettledVolumeUsdc with x402 volume_usd_30d", async (t) => {
  const { base } = await mountObservatory(t);
  const res = await request(base, "/api/observatory/snapshot");
  const catalog = await request(base, "/api/observatory/sources");
  assert.equal(res.status, 200);
  assert.equal(res.body.schemaVersion, SCHEMA_VERSION);
  assert.equal(res.body.additivity, "not_additive");
  assert.equal(res.body.total, undefined);
  assert.equal(res.body.totals, undefined);
  assert.equal(res.body.sum, undefined);
  assert.equal(res.body.combined, undefined);
  assert.equal(res.body.grandTotal, undefined);
  assert.equal(res.body.combinedVolume, undefined);
  assert.equal(res.body.combinedSellers, undefined);
  assert.equal(catalog.body.additivity, "not_additive");

  const moltjobs = res.body.observations.find((item) => item.sourceId === "moltjobs");
  const x402 = res.body.observations.find((item) => item.sourceId === "x402stats");
  const smithery = res.body.observations.find((item) => item.sourceId === "smithery_mcp");
  assert.ok(moltjobs && x402 && smithery);
  assert.equal(moltjobs.coverage.additivity, "not_additive");
  assert.equal(x402.coverage.additivity, "not_additive");
  assert.equal(smithery.coverage.additivity, "not_additive");
  assert.equal(smithery.metrics.length, 1);
  assert.equal(paid(x402).available, false);
  assert.equal(paid(smithery).available, false);

  const marketplaceVolume = metric(moltjobs, "marketplaceSettledVolumeUsdc");
  const x402Volume = metric(x402, "volume_usd_30d");
  assert.ok(marketplaceVolume);
  assert.ok(x402Volume);
  assert.equal(marketplaceVolume.state, "ok");
  assert.equal(x402Volume.state, "ok");
  assert.equal(marketplaceVolume.value, "8.25");
  assert.equal(x402Volume.value, 1021.25);
  assert.equal(marketplaceVolume.unit, "USDC");
  assert.equal(x402Volume.unit, "USD");
  assert.notEqual(marketplaceVolume.unit, x402Volume.unit);
  assert.equal(marketplaceVolume.population, "moltjobs_marketplace_ordinary_third_party");
  assert.equal(x402Volume.population, "provider_indexed_volume");
  assert.notEqual(marketplaceVolume.population, x402Volume.population);
  assert.equal(marketplaceVolume.window, "unspecified_provider_snapshot");
  assert.equal(x402Volume.window, "30d");
  assert.notEqual(marketplaceVolume.window, x402Volume.window);
  assert.equal(wouldAlignForSum(marketplaceVolume, x402Volume), false);

  const numericMarket = Number(marketplaceVolume.value);
  const numericX402 = Number(x402Volume.value);
  const forbiddenSum = numericMarket + numericX402;
  assert.equal(
    res.body.observations.some((item) => (item.metrics || []).some((entry) => Number(entry.value) === forbiddenSum)),
    false,
    "snapshot must not emit a cross-source volume sum",
  );
  assert.equal(JSON.stringify(res.body).includes(String(forbiddenSum)), false);

  assert.ok((moltjobs.withheldConclusions || []).includes("cross_source_total"));
  assert.ok((x402.withheldConclusions || []).includes("cross_source_total"));
  assert.match(establishBlob(paid(moltjobs).doesNotEstablish), /cross-source/i);
  const x402Descriptor = (catalog.body.sources || []).find((source) => source.sourceId === "x402stats");
  assert.match(establishBlob(x402Descriptor.doesNotEstablish), /cross-source/i);

  assert.equal(typeof registry.sumMetrics, "undefined");
  assert.equal(typeof registry.sumObservations, "undefined");
  assert.equal(typeof registry.combineTotals, "undefined");
  assert.equal(typeof registry.addMetrics, "undefined");
  assert.deepEqual(listSourceIds(), ["moltjobs", "x402stats", "smithery_mcp"]);
  assert.equal(getSource("moltjobs").upstreamUrl, URLS.moltjobs);
  assert.equal(listSources().length, 3);

  const dir = fileURLToPath(new URL("../lib/observatory/", import.meta.url));
  for (const file of walkJs(dir)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /export function (sum|add|combine).*Metric/);
    assert.doesNotMatch(text, /sumAcrossSources|combineTotals|grandTotal|crossSourceSum/);
  }
});
