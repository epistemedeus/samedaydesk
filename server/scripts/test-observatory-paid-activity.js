import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import express from "express";
import {
  DEFAULT_CORS_ORIGIN,
  createObservatoryRouter,
} from "../routes/observatory.js";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import { MOLTJOBS_STATS_SOURCE_URL } from "../lib/market-observations/moltjobs-stats-adapter.js";
import {
  descriptor as moltjobsDescriptor,
  observe as observeMoltjobsAdapter,
} from "../lib/observatory/adapters/moltjobs.js";
import { observe as observeX402 } from "../lib/observatory/adapters/x402stats.js";
import { observe as observeSmithery } from "../lib/observatory/adapters/smithery-mcp.js";

const Ajv = createRequire(new URL("../../client/package.json", import.meta.url))("ajv");
const validateEnvelope = new Ajv({ allErrors: true }).compile(
  JSON.parse(readFileSync(new URL("../lib/observatory/observation.schema.json", import.meta.url))),
);

const FETCHED_AT_MS = Date.parse("2026-09-10T08:00:00.000Z");
const FETCHED_AT = "2026-09-10T08:00:00.000Z";
const SOURCE_TIME_OK = "2026-09-10T07:54:19.962Z";
const SOURCE_TIME_STALE = "2020-01-01T00:00:00.000Z";
const SMITHERY_LAST_MODIFIED = "Thu, 10 Sep 2026 07:55:00 GMT";
const DEFINITIONS_URL = "https://moltjobs.io/docs/api#stats";

const URLS = Object.freeze({
  moltjobs: MOLTJOBS_STATS_SOURCE_URL,
  x402stats: "https://x402stats.io/api/stats",
  smithery: "https://api.smithery.ai/servers?pageSize=1",
});

const PAID_ACTIVITY_KEYS = Object.freeze([
  "marketplaceJobs",
  "marketplaceCompleted",
  "marketplaceSettledVolumeUsdc",
  "marketplaceEmployers",
  "marketplaceFundedEmployers",
  "marketplaceCompletionRatio",
  "marketplaceFundedEmployerRatio",
  "liquidityRegisteredAgents",
  "liquidityAgentsEverPaid",
  "liquidityAgentsBidding30d",
  "platformProgramJobs",
  "platformProgramBudgetUsdc",
]);

const CORE_KEYS = Object.freeze([
  "jobCount",
  "completedCount",
  "registeredAgents",
  "volumeUsdc",
  "escrowDeposits",
]);

const REFUSED_RATIO_KEYS = Object.freeze([
  "everPaid_over_registered",
  "bidding30d_over_registered",
  "everPaid_over_bidding30d",
  "marketplaceCompleted_over_totalCompleted",
  "marketplaceSettledVolume_over_totalVolume",
  "marketplaceJobs_over_totalJobs_as_conversion",
]);

const FORBIDDEN_OK_PAIRINGS = Object.freeze([
  "liquidityAgentsEverPaid/liquidityRegisteredAgents",
  "liquidityAgentsBidding30d/liquidityRegisteredAgents",
  "marketplaceCompleted/completedCount",
]);

const CROSS_SOURCE_FIELDS = Object.freeze([
  "total",
  "totals",
  "sum",
  "combined",
  "grandTotal",
  "combinedSellers",
]);

const LIVE_DATA = Object.freeze({
  asOf: SOURCE_TIME_OK,
  schemaVersion: 2,
  definitionsUrl: DEFINITIONS_URL,
  totalJobs: 110,
  totalCompleted: 48,
  totalAgents: 434,
  totalVolumeUsdc: 35,
  escrowedUsdc: 14,
  avgCompletionTimeMs: 161209083,
  medianCompletionTimeMs: 138650088,
  avgTimeToFillMs: 1867486522,
  medianTimeToFillMs: 242740501,
  completionSampleSize: 8,
  disputeRate: 0,
  platformPrograms: Object.freeze([
    Object.freeze({ purpose: "PLATFORM_REFERRAL", jobs: 11, budgetUsdc: 32 }),
    Object.freeze({ purpose: "PLATFORM_MARKETING", jobs: 51, budgetUsdc: 18 }),
  ]),
  marketplace: Object.freeze({
    jobs: 48,
    completed: 6,
    settledVolumeUsdc: 31,
    employers: 3,
    fundedEmployers: 1,
  }),
  liquidity: Object.freeze({
    agentsBidding30d: 181,
    agentsEverPaid: 3,
    registeredAgents: 434,
  }),
  notes: Object.freeze({
    totalsInclude: "all job purposes, including platform programs",
    marketplaceExcludes: "PLATFORM_MARKETING and PLATFORM_REFERRAL",
  }),
});

const LIVE_MOLTJOBS_FIXTURE = Object.freeze({ data: LIVE_DATA });

test("program sums preserve decimal precision and do not mark unsafe integer totals ok", () => {
  const fractional = observeMoltjobs(liveBody({ platformPrograms: [
    { purpose: "A", jobs: 1, budgetUsdc: "0.1" },
    { purpose: "B", jobs: 1, budgetUsdc: "0.2" },
  ] }));
  assert.equal(metric(fractional, "platformProgramBudgetUsdc").value, "0.3");
  assertValidSchema(fractional, "exact fractional program sum");
  const overflowing = observeMoltjobs(liveBody({ platformPrograms: [
    { purpose: "A", jobs: Number.MAX_SAFE_INTEGER, budgetUsdc: 1 },
    { purpose: "B", jobs: 1, budgetUsdc: 1 },
  ] }));
  assert.notEqual(metric(overflowing, "platformProgramJobs").state, "ok");
  assert.equal(metric(overflowing, "platformProgramJobs").value, null);
  assertValidSchema(overflowing, "overflowing program sum");
});

test("declared snapshot window survives paid metrics and population metadata while bidding stays 30d", () => {
  const envelope = observeMoltjobs(liveBody({ window: "provider_declared_snapshot" }));
  for (const key of ["jobCount", "marketplaceJobs", "marketplaceCompletionRatio", "platformProgramJobs"]) {
    assert.equal(metric(envelope, key).window, "provider_declared_snapshot", key);
  }
  assert.equal(metric(envelope, "liquidityAgentsBidding30d").window, "30d");
  assert.equal(envelope.paidActivity.populations.find(row => row.id === "moltjobs_marketplace_ordinary_third_party").window, "provider_declared_snapshot");
});

const OLD_MOLTJOBS_FIXTURE = Object.freeze({
  data: Object.freeze({
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
  }),
});

const X402STATS_FIXTURE = Object.freeze({
  updatedAt: SOURCE_TIME_OK,
  methodologyVersion: "2026-07-01.v1",
  series: [
    { date: "2026-09-10", buyers: 11, newSellers: 2, sellers: 5, transactions: 17, volumeUsd: 19.25 },
  ],
  history: [],
  snapshot: Object.freeze({
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
  }),
});

const SMITHERY_FIXTURE = Object.freeze({
  servers: [
    {
      qualifiedName: "fixture/example",
      useCount: 999,
      displayName: "Fixture",
    },
  ],
  pagination: Object.freeze({
    currentPage: 1,
    pageSize: 1,
    totalPages: 500,
    totalCount: 13594,
  }),
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
    if (u === URLS.moltjobs) return jsonResponse(LIVE_MOLTJOBS_FIXTURE);
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

function assertValidSchema(body, label) {
  assert.equal(validateEnvelope(body), true, `${label}: ${JSON.stringify(validateEnvelope.errors)}`);
}

function assertNoCrossSourceTotals(body) {
  for (const field of CROSS_SOURCE_FIELDS) {
    assert.equal(body[field], undefined, `must not emit cross-source field ${field}`);
  }
}

function observeMoltjobs(body, extra = {}) {
  return observeMoltjobsAdapter({
    body,
    httpStatus: 200,
    fetchedAt: FETCHED_AT,
    sourceUrl: MOLTJOBS_STATS_SOURCE_URL,
    cache: { hit: false, ageMs: 0, stale: false, ttlMs: 30_000, fetchedAt: FETCHED_AT },
    ...extra,
  }, { nowMs: FETCHED_AT_MS });
}

function liveBody(patch = {}) {
  const data = {
    ...LIVE_DATA,
    ...patch,
  };
  if (patch.marketplace === undefined) {
    data.marketplace = { ...LIVE_DATA.marketplace };
  }
  if (patch.liquidity === undefined) {
    data.liquidity = { ...LIVE_DATA.liquidity };
  }
  if (patch.platformPrograms === undefined) {
    data.platformPrograms = LIVE_DATA.platformPrograms.map((row) => ({ ...row }));
  }
  if (patch.notes === undefined) {
    data.notes = { ...LIVE_DATA.notes };
  }
  return { data };
}

function refusedByKey(envelope, key) {
  return (envelope.paidActivity && envelope.paidActivity.refusedRatios || [])
    .find((row) => row && row.key === key) || null;
}

function assertRefusedNotOkMetric(envelope, key) {
  const asMetric = metric(envelope, key);
  assert.equal(asMetric, null, `${key} must not be emitted as an ok (or any) metric`);
  assert.ok(refusedByKey(envelope, key), `${key} must appear in paidActivity.refusedRatios`);
}

test("happy live-shaped MoltJobs body maps marketplace/liquidity/programs without inventing demand", () => {
  const envelope = observeMoltjobs(LIVE_MOLTJOBS_FIXTURE);
  assertEnvelopeShape(envelope, "moltjobs");
  assertValidSchema(envelope, "happy moltjobs");
  assertNoInventedZeros(envelope);
  assertNoCrossSourceTotals(envelope);

  assert.equal(envelope.availability, "ok");
  assert.equal(envelope.providerTimestamp, SOURCE_TIME_OK);
  assert.equal(envelope.providerTimestampState, "ok");
  assert.equal(envelope.fetchedAt, FETCHED_AT);
  assert.notEqual(envelope.fetchedAt, envelope.providerTimestamp);

  assert.equal(metric(envelope, "jobCount").value, 110);
  assert.equal(metric(envelope, "jobCount").state, "ok");
  assert.equal(metric(envelope, "jobCount").population, "moltjobs_work_market");
  assert.equal(metric(envelope, "completedCount").value, 48);
  assert.equal(metric(envelope, "registeredAgents").value, 434);
  assert.equal(Number(metric(envelope, "volumeUsdc").value), 35);
  assert.equal(Number(metric(envelope, "escrowDeposits").value), 14);
  assert.equal(metric(envelope, "disputeRate").state, "ok");
  assert.equal(Number(metric(envelope, "disputeRate").value), 0);
  assert.notEqual(metric(envelope, "disputeRate").value, null);
  for (const key of CORE_KEYS) {
    assert.equal(metric(envelope, key).state, "ok", `${key} core total must stay ok`);
  }

  const marketplaceJobs = metric(envelope, "marketplaceJobs");
  assert.equal(marketplaceJobs.value, 48);
  assert.equal(marketplaceJobs.state, "ok");
  assert.equal(marketplaceJobs.population, "moltjobs_marketplace_ordinary_third_party");
  assert.equal(marketplaceJobs.window, "unspecified_provider_snapshot");
  assert.match(marketplaceJobs.definition, /data\.marketplace\.jobs/);
  assert.match(marketplaceJobs.definition, /PLATFORM_MARKETING/);
  assert.match(marketplaceJobs.definition, /PLATFORM_REFERRAL/);

  const marketplaceCompleted = metric(envelope, "marketplaceCompleted");
  assert.equal(marketplaceCompleted.value, 6);
  assert.equal(marketplaceCompleted.state, "ok");
  assert.equal(marketplaceCompleted.population, "moltjobs_marketplace_ordinary_third_party");
  assert.match(marketplaceCompleted.definition, /data\.marketplace\.completed/);

  const settled = metric(envelope, "marketplaceSettledVolumeUsdc");
  assert.equal(settled.value, 31);
  assert.equal(settled.state, "ok");
  assert.equal(settled.unit, "USDC");
  assert.equal(settled.population, "moltjobs_marketplace_ordinary_third_party");
  assert.match(settled.definition, /data\.marketplace\.settledVolumeUsdc/);

  const employers = metric(envelope, "marketplaceEmployers");
  assert.equal(employers.value, 3);
  assert.equal(employers.state, "ok");
  assert.equal(employers.population, "moltjobs_marketplace_employers");
  assert.match(employers.definition, /data\.marketplace\.employers/);
  assert.match(employers.definition, /Not unique humans/i);

  const funded = metric(envelope, "marketplaceFundedEmployers");
  assert.equal(funded.value, 1);
  assert.equal(funded.state, "ok");
  assert.equal(funded.population, "moltjobs_marketplace_employers");
  assert.match(funded.definition, /data\.marketplace\.fundedEmployers/);

  const completionRatio = metric(envelope, "marketplaceCompletionRatio");
  assert.equal(completionRatio.value, "6/48");
  assert.equal(completionRatio.state, "ok");
  assert.equal(completionRatio.unit, "ratio");
  assert.equal(completionRatio.population, "moltjobs_marketplace_ordinary_third_party");
  assert.equal(completionRatio.window, marketplaceJobs.window);
  assert.equal(completionRatio.ratioAlignment, "same_population_same_window");

  const fundedRatio = metric(envelope, "marketplaceFundedEmployerRatio");
  assert.equal(fundedRatio.value, "1/3");
  assert.equal(fundedRatio.state, "ok");
  assert.equal(fundedRatio.population, "moltjobs_marketplace_employers");
  assert.equal(fundedRatio.ratioAlignment, "same_population_same_window");

  const registered = metric(envelope, "liquidityRegisteredAgents");
  const everPaid = metric(envelope, "liquidityAgentsEverPaid");
  const bidding = metric(envelope, "liquidityAgentsBidding30d");
  assert.equal(registered.value, 434);
  assert.equal(registered.state, "ok");
  assert.equal(registered.population, "moltjobs_registered_agents");
  assert.equal(registered.window, "unspecified_provider_snapshot");
  assert.equal(everPaid.value, 3);
  assert.equal(everPaid.state, "ok");
  assert.equal(everPaid.population, "moltjobs_agents_ever_paid");
  assert.equal(everPaid.window, "unspecified_provider_snapshot");
  assert.equal(bidding.value, 181);
  assert.equal(bidding.state, "ok");
  assert.equal(bidding.population, "moltjobs_agents_bidding_30d");
  assert.equal(bidding.window, "30d");
  assert.notEqual(registered.population, everPaid.population);
  assert.notEqual(registered.population, bidding.population);
  assert.notEqual(everPaid.population, bidding.population);
  assert.notEqual(bidding.window, registered.window);
  assert.match(bidding.definition, /data\.liquidity\.agentsBidding30d/);
  assert.match(everPaid.definition, /Not unique humans/i);

  const programJobs = metric(envelope, "platformProgramJobs");
  const programBudget = metric(envelope, "platformProgramBudgetUsdc");
  assert.equal(programJobs.value, 62);
  assert.equal(programJobs.state, "ok");
  assert.equal(programJobs.population, "moltjobs_platform_programs");
  assert.equal(programBudget.value, 50);
  assert.equal(programBudget.state, "ok");
  assert.equal(programBudget.unit, "USDC");
  assert.equal(programJobs.value, LIVE_DATA.platformPrograms.reduce((sum, row) => sum + row.jobs, 0));
  assert.equal(programBudget.value, LIVE_DATA.platformPrograms.reduce((sum, row) => sum + row.budgetUsdc, 0));

  const paid = envelope.paidActivity;
  assert.ok(paid);
  assert.equal(paid.sourceId, "moltjobs");
  assert.equal(paid.available, true);
  assert.equal(paid.asOf, SOURCE_TIME_OK);
  assert.equal(paid.definitionsUrl, DEFINITIONS_URL);
  assert.equal(paid.sourceSchemaVersion, 2);
  assert.equal(paid.notes.totalsInclude, "all job purposes, including platform programs");
  assert.equal(paid.notes.marketplaceExcludes, "PLATFORM_MARKETING and PLATFORM_REFERRAL");
  assert.equal(paid.reconcile.state, "ok");
  assert.equal(paid.reconcile.formula, "data.totalJobs = data.marketplace.jobs + sum(data.platformPrograms[].jobs)");
  assert.equal(paid.reconcile.observedTotalJobs, 110);
  assert.equal(paid.reconcile.marketplaceJobs, 48);
  assert.equal(paid.reconcile.platformProgramJobs, 62);
  assert.equal(paid.reconcile.composed, 110);
  assert.equal(paid.reconcile.composed, paid.reconcile.marketplaceJobs + paid.reconcile.platformProgramJobs);

  const okRatio = paid.ratios.find((row) => row.key === "marketplaceCompletionRatio");
  assert.ok(okRatio);
  assert.equal(okRatio.state, "ok");
  assert.equal(okRatio.value, "6/48");
  const okFunded = paid.ratios.find((row) => row.key === "marketplaceFundedEmployerRatio");
  assert.ok(okFunded);
  assert.equal(okFunded.state, "ok");
  assert.equal(okFunded.value, "1/3");

  const withheld = envelope.withheldConclusions.join(" ");
  assert.match(withheld, /conversion_funnel/);
  assert.match(withheld, /repeat_demand/);
  assert.match(withheld, /paid_demand_population/);
  const doesNot = [
    ...(paid.doesNotEstablish || []),
    ...(moltjobsDescriptor.doesNotEstablish || []),
  ].join(" ");
  assert.match(doesNot, /funnel/i);
  assert.match(doesNot, /repeat demand/i);
  assert.match(doesNot, /cross-source totals|cross-market totals/i);

  assert.equal(metric(envelope, "jobCount").population, "moltjobs_work_market");
  assert.notEqual(metric(envelope, "jobCount").population, marketplaceJobs.population);
});

test("old totals-only fixture: new paid-activity keys are missing, not zero", () => {
  const envelope = observeMoltjobs(OLD_MOLTJOBS_FIXTURE);
  assertEnvelopeShape(envelope, "moltjobs");
  assertValidSchema(envelope, "old moltjobs fixture");
  assertNoInventedZeros(envelope);

  assert.equal(envelope.availability, "ok");
  assert.equal(metric(envelope, "jobCount").value, 12);
  assert.equal(metric(envelope, "jobCount").state, "ok");
  assert.equal(metric(envelope, "completedCount").value, 4);
  assert.equal(metric(envelope, "registeredAgents").value, 3);
  assert.equal(metric(envelope, "volumeUsdc").value, "10.50");
  assert.equal(metric(envelope, "escrowDeposits").value, "1.25");

  for (const key of PAID_ACTIVITY_KEYS) {
    const entry = metric(envelope, key);
    assert.ok(entry, `${key} must still be listed`);
    assert.equal(entry.state, "missing", `${key} must be missing on totals-only payload`);
    assert.equal(entry.value, null, `${key} must not invent zero when missing`);
    assert.notEqual(entry.value, 0);
  }

  assert.ok(envelope.paidActivity);
  assert.equal(envelope.paidActivity.available, false);
  assert.equal(envelope.paidActivity.reconcile.state, "missing");
  assert.equal(envelope.paidActivity.reconcile.composed, null);
});

test("marketplace completed=0 with jobs>0 stays numeric zero and ratio 0/jobs", () => {
  const envelope = observeMoltjobs(liveBody({
    marketplace: {
      jobs: 48,
      completed: 0,
      settledVolumeUsdc: 0,
      employers: 3,
      fundedEmployers: 0,
    },
    liquidity: {
      registeredAgents: 434,
      agentsEverPaid: 0,
      agentsBidding30d: 0,
    },
  }));
  assertValidSchema(envelope, "zero completed");
  assertNoInventedZeros(envelope);

  const completed = metric(envelope, "marketplaceCompleted");
  assert.equal(completed.state, "ok");
  assert.equal(completed.value, 0);
  assert.equal(typeof completed.value, "number");

  const ratio = metric(envelope, "marketplaceCompletionRatio");
  assert.equal(ratio.state, "ok");
  assert.equal(ratio.value, "0/48");

  const settled = metric(envelope, "marketplaceSettledVolumeUsdc");
  assert.equal(settled.state, "ok");
  assert.equal(settled.value, 0);

  const funded = metric(envelope, "marketplaceFundedEmployers");
  assert.equal(funded.state, "ok");
  assert.equal(funded.value, 0);

  const fundedRatio = metric(envelope, "marketplaceFundedEmployerRatio");
  assert.equal(fundedRatio.state, "ok");
  assert.equal(fundedRatio.value, "0/3");

  const everPaid = metric(envelope, "liquidityAgentsEverPaid");
  assert.equal(everPaid.state, "ok");
  assert.equal(everPaid.value, 0);

  assert.equal(envelope.availability, "ok");
  assert.equal(envelope.paidActivity.reconcile.state, "ok");
});

test("malformed marketplace does not invent zeros", () => {
  const cases = [
    { label: "string", marketplace: "nope" },
    { label: "array", marketplace: ["jobs"] },
    {
      label: "jobs negative",
      marketplace: { jobs: -1, completed: 1, settledVolumeUsdc: 1, employers: 1, fundedEmployers: 1 },
    },
    {
      label: "jobs string",
      marketplace: { jobs: "nope", completed: 1, settledVolumeUsdc: 1, employers: 1, fundedEmployers: 1 },
    },
  ];
  for (const row of cases) {
    const envelope = observeMoltjobs(liveBody({ marketplace: row.marketplace }));
    assertValidSchema(envelope, `malformed ${row.label}`);
    assertNoInventedZeros(envelope);
    const jobs = metric(envelope, "marketplaceJobs");
    assert.ok(jobs, `marketplaceJobs listed for ${row.label}`);
    assert.notEqual(jobs.state, "ok", `marketplaceJobs must not be ok for ${row.label}`);
    assert.equal(jobs.value, null, `marketplaceJobs must be null for ${row.label}`);
    const ratio = metric(envelope, "marketplaceCompletionRatio");
    assert.notEqual(ratio.state, "ok", `completion ratio must not be ok for ${row.label}`);
    assert.equal(ratio.value, null);
    assert.equal(metric(envelope, "jobCount").value, 110, "totals are not rewritten from malformed marketplace");
  }
});

test("stale asOf keeps marketplace values and marks availability stale", () => {
  const envelope = observeMoltjobs(liveBody({ asOf: SOURCE_TIME_STALE }));
  assertEnvelopeShape(envelope, "moltjobs");
  assertValidSchema(envelope, "stale asOf");
  assertNoInventedZeros(envelope);

  assert.equal(envelope.availability, "stale");
  assert.equal(envelope.providerTimestampState, "stale");
  assert.equal(envelope.providerTimestamp, SOURCE_TIME_STALE);
  assert.equal(envelope.fetchedAt, FETCHED_AT);
  assert.notEqual(envelope.fetchedAt, envelope.providerTimestamp);
  assert.ok(envelope.warnings.some((warning) => warning.code === "stale_provider_timestamp"));

  assert.equal(metric(envelope, "marketplaceJobs").value, 48);
  assert.equal(metric(envelope, "marketplaceJobs").state, "ok");
  assert.equal(metric(envelope, "marketplaceCompleted").value, 6);
  assert.equal(metric(envelope, "liquidityAgentsEverPaid").value, 3);
  assert.equal(metric(envelope, "jobCount").value, 110);
});

test("population-mismatch ratios are refused, never emitted as ok metrics", () => {
  const envelope = observeMoltjobs(LIVE_MOLTJOBS_FIXTURE);
  assertValidSchema(envelope, "refused ratios");

  for (const key of REFUSED_RATIO_KEYS) {
    assertRefusedNotOkMetric(envelope, key);
  }

  const everPaid = refusedByKey(envelope, "everPaid_over_registered");
  assert.equal(everPaid.numeratorKey, "liquidityAgentsEverPaid");
  assert.equal(everPaid.denominatorKey, "liquidityRegisteredAgents");
  const bidding = refusedByKey(envelope, "bidding30d_over_registered");
  assert.equal(bidding.numeratorKey, "liquidityAgentsBidding30d");
  assert.equal(bidding.denominatorKey, "liquidityRegisteredAgents");
  const completed = refusedByKey(envelope, "marketplaceCompleted_over_totalCompleted");
  assert.equal(completed.numeratorKey, "marketplaceCompleted");
  assert.equal(completed.denominatorKey, "completedCount");

  for (const entry of envelope.metrics) {
    if (entry.state !== "ok") continue;
    if (entry.numeratorKey && entry.denominatorKey) {
      const pairing = `${entry.numeratorKey}/${entry.denominatorKey}`;
      assert.equal(
        FORBIDDEN_OK_PAIRINGS.includes(pairing),
        false,
        `${pairing} must not be an ok ratio`,
      );
    }
    if (entry.unit === "ratio" && typeof entry.value === "string" && entry.key !== "marketplaceCompletionRatio") {
      assert.notEqual(entry.value, "3/434", "must not emit everPaid/registered as a conversion");
      assert.notEqual(entry.value, "181/434", "must not emit bidding30d/registered as a conversion");
    }
  }

  const allowed = metric(envelope, "marketplaceCompletionRatio");
  assert.equal(allowed.state, "ok");
  assert.equal(allowed.value, "6/48");
});

test("reconcile mismatch warns and does not rewrite totals", () => {
  const envelope = observeMoltjobs(liveBody({ totalJobs: 99 }));
  assertValidSchema(envelope, "reconcile mismatch");
  assertNoInventedZeros(envelope);

  assert.equal(metric(envelope, "jobCount").value, 99);
  assert.equal(metric(envelope, "jobCount").state, "ok");
  assert.equal(metric(envelope, "marketplaceJobs").value, 48);
  assert.equal(metric(envelope, "platformProgramJobs").value, 62);
  assert.equal(envelope.paidActivity.reconcile.state, "contradictory");
  assert.equal(envelope.paidActivity.reconcile.observedTotalJobs, 99);
  assert.equal(envelope.paidActivity.reconcile.marketplaceJobs, 48);
  assert.equal(envelope.paidActivity.reconcile.platformProgramJobs, 62);
  assert.equal(envelope.paidActivity.reconcile.composed, 110);
  assert.notEqual(envelope.paidActivity.reconcile.observedTotalJobs, envelope.paidActivity.reconcile.composed);
  assert.ok(envelope.warnings.some((warning) => warning.code === "totals_reconcile_mismatch"));
});

test("funded employers greater than employers makes funded ratio contradictory", () => {
  const envelope = observeMoltjobs(liveBody({
    marketplace: {
      jobs: 48,
      completed: 6,
      settledVolumeUsdc: 31,
      employers: 1,
      fundedEmployers: 5,
    },
  }));
  assertValidSchema(envelope, "funded subset break");
  assertNoInventedZeros(envelope);

  const ratio = metric(envelope, "marketplaceFundedEmployerRatio");
  assert.equal(ratio.state, "contradictory");
  assert.equal(ratio.value, null);
  assert.equal(metric(envelope, "marketplaceEmployers").value, 1);
  assert.equal(metric(envelope, "marketplaceFundedEmployers").value, 5);
  const paidRatio = envelope.paidActivity.ratios.find((row) => row.key === "marketplaceFundedEmployerRatio");
  assert.ok(paidRatio);
  assert.equal(paidRatio.state, "contradictory");
  assert.equal(paidRatio.value, null);
});

test("GET /sources/moltjobs and /snapshot fetch fixture, echo CORS, stay not_additive", async (t) => {
  const fetchImpl = createRoutedFetch();
  const { base } = await mountObservatory(t, { fetchImpl });

  const allowed = await request(base, "/api/observatory/sources/moltjobs", {
    headers: { Origin: DEFAULT_CORS_ORIGIN },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://neomorphic.io");
  assert.notEqual(allowed.headers.get("access-control-allow-origin"), "*");
  assertEnvelopeShape(allowed.body, "moltjobs");
  assertValidSchema(allowed.body, "http moltjobs");
  assertNoInventedZeros(allowed.body);
  assert.equal(allowed.body.availability, "ok");
  assert.equal(metric(allowed.body, "jobCount").value, 110);
  assert.equal(metric(allowed.body, "marketplaceJobs").value, 48);
  assert.equal(metric(allowed.body, "marketplaceCompleted").value, 6);
  assert.equal(metric(allowed.body, "liquidityAgentsEverPaid").value, 3);
  assert.equal(metric(allowed.body, "platformProgramJobs").value, 62);
  assert.equal(allowed.body.paidActivity.reconcile.state, "ok");
  assert.equal(allowed.body.fetchedAt, FETCHED_AT);
  assert.equal(allowed.body.providerTimestamp, SOURCE_TIME_OK);
  assert.ok(fetchImpl.calls.some((call) => call.url === URLS.moltjobs));

  const denied = await request(base, "/api/observatory/snapshot", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(denied.status, 200);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal(denied.body.additivity, "not_additive");
  assertNoCrossSourceTotals(denied.body);
  assertValidSchema(denied.body, "http snapshot");
  const ids = denied.body.observations.map((item) => item.sourceId).sort();
  assert.deepEqual(ids, ["moltjobs", "smithery_mcp", "x402stats"]);

  const moltjobs = denied.body.observations.find((item) => item.sourceId === "moltjobs");
  const x402 = denied.body.observations.find((item) => item.sourceId === "x402stats");
  const smithery = denied.body.observations.find((item) => item.sourceId === "smithery_mcp");
  assertValidSchema(moltjobs, "snapshot moltjobs");
  assertValidSchema(x402, "snapshot x402");
  assertValidSchema(smithery, "snapshot smithery");
  assert.equal(metric(moltjobs, "marketplaceJobs").value, 48);
  assert.equal(moltjobs.paidActivity.available, true);
  assert.equal(x402.paidActivity.available, false);
  assert.match(x402.paidActivity.reason, /heuristic|registered-vs-paid|marketplace-vs-program/i);
  assert.equal(metric(x402, "organic_sellers_30d").evidenceClass, "provider_heuristic");
  assert.ok((x402.paidActivity.refusedRatios || []).some((row) => /organic/i.test(row.key) || /organic/i.test(row.reason)));
  assert.equal(smithery.metrics.length, 1);
  assert.equal(metric(smithery, "registered_servers").value, 13594);
  assert.equal(smithery.paidActivity.available, false);
  assert.match(smithery.paidActivity.reason, /catalog/i);
  assert.equal(denied.body.documentedUnavailable[0].sourceId, "x402scan");
  assert.equal(denied.body.documentedUnavailable[0].called, false);
});

test("observation.schema.json still validates paid-activity envelopes including additionalProperties", () => {
  const happy = observeMoltjobs(LIVE_MOLTJOBS_FIXTURE);
  const old = observeMoltjobs(OLD_MOLTJOBS_FIXTURE);
  const x402 = observeX402({
    body: X402STATS_FIXTURE,
    httpStatus: 200,
    fetchedAt: FETCHED_AT,
    cache: { hit: false, ageMs: 0, stale: false, ttlMs: 30_000, fetchedAt: FETCHED_AT },
  }, { nowMs: FETCHED_AT_MS });
  const smithery = observeSmithery({
    body: SMITHERY_FIXTURE,
    httpStatus: 200,
    fetchedAt: FETCHED_AT,
    headers: { lastModified: SMITHERY_LAST_MODIFIED },
    cache: { hit: false, ageMs: 0, stale: false, ttlMs: 30_000, fetchedAt: FETCHED_AT },
  }, { nowMs: FETCHED_AT_MS });

  assertValidSchema(happy, "schema happy");
  assertValidSchema(old, "schema old");
  assertValidSchema(x402, "schema x402");
  assertValidSchema(smithery, "schema smithery");
  assert.equal(happy.schemaVersion, SCHEMA_VERSION);
  assert.ok("paidActivity" in happy);
  assert.equal(x402.paidActivity.available, false);
  assert.equal(smithery.metrics.length, 1);
  assert.equal(smithery.paidActivity.available, false);
  assert.equal(metric(x402, "organic_sellers_30d").state, "ok");
  assert.equal(metric(x402, "organic_sellers_30d").evidenceClass, "provider_heuristic");
});
