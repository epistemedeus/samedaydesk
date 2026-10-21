/**
 * Smithery date-only retirement, SDS collection policy, and historical capture.
 * Clocks are fixtures. This file does not call the live Smithery API.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import {
  collectionPolicyForDateOnly,
  declareDateOnly,
} from "../lib/observatory/contract.js";
import {
  SMITHERY_ANNOUNCEMENT,
  SMITHERY_COLLECTION_POLICY,
  evidenceClass,
  observe as observeSmithery,
  upstreamUrl as SMITHERY_URL,
} from "../lib/observatory/adapters/smithery-mcp.js";
import { upstreamUrl as MOLTJOBS_URL } from "../lib/observatory/adapters/moltjobs.js";
import { upstreamUrl as X402_URL } from "../lib/observatory/adapters/x402stats.js";
import { upstreamUrl as OPEN_JOBS_URL } from "../lib/observatory/adapters/moltjobs-open-jobs.js";
import { createBoundedFetcher } from "../lib/observatory/bounded-fetch.js";
import { createObservatoryRuntime, listSources } from "../lib/observatory/registry.js";
import { projectPositioning } from "../lib/observatory/positioning.js";
import { createObservatoryRouter } from "../routes/observatory.js";
import { loadCapture } from "./observatory-capture.mjs";

const Ajv = createRequire(new URL("../../client/package.json", import.meta.url))("ajv");
const validate = new Ajv({ allErrors: true }).compile(
  JSON.parse(readFileSync(new URL("../lib/observatory/observation.schema.json", import.meta.url), "utf8")),
);

const BEFORE = "2026-10-20T15:00:00.000Z";
const BEFORE_MS = Date.parse(BEFORE);
const POLICY_INSTANT = "2026-10-31T00:00:00.000Z";
const POLICY_MS = Date.parse(POLICY_INSTANT);
const AFTER = "2026-11-01T12:00:00.000Z";
const AFTER_MS = Date.parse(AFTER);
const HISTORICAL = "2026-09-09T23:00:00.000Z";
const HISTORICAL_DIR = fileURLToPath(new URL(
  "../../proofs/observatory-captures/fixtures/20260909T230000Z",
  import.meta.url,
));

function metric(envelope, key) {
  return (envelope.metrics || []).find((entry) => entry && entry.key === key) || null;
}

function capture(extra = {}) {
  const fetchedAt = Object.prototype.hasOwnProperty.call(extra, "fetchedAt") ? extra.fetchedAt : BEFORE;
  return {
    fetchedAt,
    httpStatus: extra.httpStatus ?? 200,
    body: Object.prototype.hasOwnProperty.call(extra, "body") ? extra.body : { pagination: { totalCount: 13594 } },
    cache: extra.cache ?? { hit: false, ageMs: 0, stale: false, ttlMs: 30000, fetchedAt },
    headers: extra.headers ?? {},
    error: extra.error ?? null,
  };
}

function assertNotZero(envelope) {
  const row = metric(envelope, "registered_servers");
  assert.ok(row);
  assert.equal(row.value, null);
  assert.notEqual(row.state, "ok");
  assert.equal(row.population, "smithery_server_catalog");
  assert.equal(row.window, "catalog_snapshot");
  assert.equal(row.evidenceClass, evidenceClass);
  assert.equal(envelope.evidenceClass, evidenceClass);
  assert.equal(envelope.coverage.population, "smithery_server_catalog");
  assert.equal(envelope.coverage.window, "catalog_snapshot");
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sourceBodies(at) {
  return {
    [MOLTJOBS_URL]: {
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
        updatedAt: at,
      },
    },
    [X402_URL]: {
      updatedAt: at,
      snapshot: {
        avgPaymentUsd: 0.12,
        computedAt: at,
        medianSellerRevenueUsd: 0.01,
        organicSellers: 84,
        organicVolumeUsd: 840.5,
        sellers: 47303,
        top10VolumeShare: 0.73,
        volumeUsd: 1021.25,
        windowDays: 30,
      },
    },
    [OPEN_JOBS_URL]: {
      data: [{
        status: "OPEN",
        purpose: "PLATFORM_REFERRAL",
        funded: true,
        requiredSkills: [],
        preferredSkills: [],
      }],
      meta: { hasMore: false, limit: 20 },
    },
    [SMITHERY_URL]: { pagination: { totalCount: 13594 }, servers: [{ qualifiedName: "fixture/example", useCount: 999 }] },
  };
}

test("the announcement is date-only and the cutoff is an SDS collection policy", () => {
  assert.equal(SMITHERY_ANNOUNCEMENT.precision, "date");
  assert.equal(SMITHERY_ANNOUNCEMENT.date, "2026-10-31");
  assert.equal(SMITHERY_ANNOUNCEMENT.time, null);
  assert.equal(SMITHERY_ANNOUNCEMENT.timeZone, null);
  assert.equal(SMITHERY_ANNOUNCEMENT.officialInstant, null);
  assert.equal(SMITHERY_ANNOUNCEMENT.sourceUrl, "https://smithery.ai/future");
  assert.equal(JSON.stringify(SMITHERY_ANNOUNCEMENT).includes("T"), false);
  assert.equal(SMITHERY_COLLECTION_POLICY.role, "sds_collection_policy");
  assert.equal(SMITHERY_COLLECTION_POLICY.timeBasis, "utc_start_of_announced_calendar_date");
  assert.equal(SMITHERY_COLLECTION_POLICY.admitBefore, POLICY_INSTANT);
  assert.equal(SMITHERY_COLLECTION_POLICY.officialShutdown, null);
  assert.equal(SMITHERY_COLLECTION_POLICY.measuredShutdown, null);
  assert.throws(() => declareDateOnly("2026-10-31T00:00:00.000Z"), /date_only_invalid/);
  assert.throws(() => declareDateOnly("2026-02-31"), /date_only_invalid/);
  assert.throws(() => collectionPolicyForDateOnly({
    precision: "date",
    date: "2026-10-31",
    time: "00:00:00",
    timeZone: "UTC",
    officialInstant: null,
  }), /collection_policy_requires_date_only/);

  const smithery = listSources().find((row) => row.sourceId === "smithery_mcp");
  const moltjobs = listSources().find((row) => row.sourceId === "moltjobs");
  assert.equal(smithery.sourceLifecycle.announcement.date, "2026-10-31");
  assert.equal(smithery.sourceLifecycle.capturePlacement, undefined);
  assert.equal(moltjobs.sourceLifecycle, undefined);
  assert.equal(listSources().map((row) => row.sourceId).join(","), "moltjobs,x402stats,smithery_mcp,moltjobs_open_jobs");
});

test("a date-only capture clock is not coerced to the policy instant", () => {
  const unplaced = observeSmithery(capture({
    fetchedAt: "2026-10-31",
    body: { pagination: { totalCount: 7 } },
  }), { nowMs: BEFORE_MS });
  assert.equal(unplaced.sourceLifecycle.capturePlacement, "unplaced");
  assert.equal(unplaced.sourceLifecycle.currentAdmission, "open");
  assert.equal(unplaced.sourceLifecycle.policyAdmitsCapture, true);
  assert.equal(metric(unplaced, "registered_servers").value, 7);
  assert.ok(unplaced.warnings.some((warning) => warning.code === "capture_time_unplaced"));
  assert.equal(validate(unplaced), true, JSON.stringify(validate.errors));

  const closed = observeSmithery(capture({
    fetchedAt: "2026-10-31",
    body: { pagination: { totalCount: 7 } },
  }), { nowMs: AFTER_MS });
  assert.equal(closed.sourceLifecycle.capturePlacement, "unplaced");
  assert.equal(closed.sourceLifecycle.currentAdmission, "closed");
  assert.equal(closed.sourceLifecycle.policyAdmitsCapture, false);
  assertNotZero(closed);

  const atPolicy = observeSmithery(capture({
    fetchedAt: POLICY_INSTANT,
    body: { pagination: { totalCount: 7 } },
  }), { nowMs: POLICY_MS });
  assert.equal(atPolicy.sourceLifecycle.capturePlacement, "at_or_after_collection_policy");
  assert.equal(atPolicy.sourceLifecycle.measuredShutdown, null);
  assert.equal(atPolicy.sourceLifecycle.announcementIsOutage, false);
  assert.equal(atPolicy.httpStatus, 200);
  assert.equal(atPolicy.availability, "unavailable");
  assert.equal(atPolicy.rawExcerpt, undefined);
  assert.equal(atPolicy.sourceLifecycle.observedFailure, null);
  assertNotZero(atPolicy);
  assert.ok(atPolicy.warnings.some((warning) => warning.code === "collection_policy"));
  assert.equal(atPolicy.errors.length, 0);

  const sameInstant = observeSmithery(capture({
    fetchedAt: "2026-10-30T20:00:00.000-04:00",
    body: { pagination: { totalCount: 7 } },
  }), { nowMs: POLICY_MS });
  assert.equal(sameInstant.sourceLifecycle.capturePlacement, "at_or_after_collection_policy");
  assertNotZero(sameInstant);

  const beforeByOffset = observeSmithery(capture({
    fetchedAt: "2026-10-30T19:59:59.000-04:00",
    body: { pagination: { totalCount: 7 } },
  }), { nowMs: POLICY_MS });
  assert.equal(beforeByOffset.sourceLifecycle.capturePlacement, "before_collection_policy");
  assert.equal(beforeByOffset.sourceLifecycle.currentAdmission, "closed");
  assert.equal(metric(beforeByOffset, "registered_servers").value, 7);
});

test("a current capture before the policy keeps the catalog count, including a real zero", () => {
  const current = observeSmithery(capture({ body: { pagination: { totalCount: 13594 } } }), { nowMs: BEFORE_MS });
  assert.equal(current.availability, "ok");
  assert.equal(metric(current, "registered_servers").value, 13594);
  assert.equal(metric(current, "registered_servers").state, "ok");
  assert.equal(current.sourceLifecycle.capturePlacement, "before_collection_policy");
  assert.equal(current.sourceLifecycle.currentAdmission, "open");
  assert.equal(current.sourceLifecycle.policyAdmitsCapture, true);
  assert.equal(current.sourceLifecycle.observedFailure, null);
  assert.equal(current.sourceLifecycle.announcement.date, "2026-10-31");
  assert.equal(current.warnings.some((warning) => warning.code === "collection_policy"), false);
  assert.equal(current.metrics.some((entry) => /useCount|use_count/i.test(entry.key)), false);
  assert.equal(validate(current), true, JSON.stringify(validate.errors));

  const measuredZero = observeSmithery(capture({ body: { pagination: { totalCount: 0 } } }), { nowMs: BEFORE_MS });
  assert.equal(metric(measuredZero, "registered_servers").state, "ok");
  assert.equal(metric(measuredZero, "registered_servers").value, 0);
});

test("a historical capture parsed after the policy keeps its historical count", () => {
  const stored = JSON.parse(readFileSync(new URL(
    "../../proofs/observatory-captures/fixtures/20260909T230000Z/smithery_mcp.json",
    import.meta.url,
  ), "utf8"));
  const loaded = loadCapture(HISTORICAL_DIR);
  const fromDisk = loaded.bySourceId.smithery_mcp;
  assert.equal(fromDisk.fetchedAt, HISTORICAL);
  assert.equal(fromDisk.availability, "ok");
  assert.equal(metric(fromDisk, "registered_servers").value, 9);
  assert.equal(metric(fromDisk, "registered_servers").value, stored.metrics[0].value);
  assert.equal(fromDisk.sourceLifecycle, undefined);
  assert.equal(loaded.bySourceId.moltjobs.sourceLifecycle, undefined);

  const parsedLater = observeSmithery(capture({
    fetchedAt: stored.fetchedAt,
    body: { pagination: { totalCount: stored.metrics[0].value } },
  }), { nowMs: AFTER_MS });
  assert.equal(parsedLater.fetchedAt, HISTORICAL);
  assert.equal(parsedLater.availability, "ok");
  assert.equal(metric(parsedLater, "registered_servers").value, 9);
  assert.equal(parsedLater.sourceLifecycle.capturePlacement, "before_collection_policy");
  assert.equal(parsedLater.sourceLifecycle.currentAdmission, "closed");
  assert.equal(parsedLater.sourceLifecycle.policyAdmitsCapture, true);
  assert.equal(parsedLater.sourceLifecycle.observedFailure, null);
  assert.equal(parsedLater.sourceLifecycle.measuredShutdown, null);
  assert.equal(metric(fromDisk, "registered_servers").value, 9);

  const projected = projectPositioning({ fetchedAt: AFTER, observations: [parsedLater] });
  const node = projected.planes.catalog_presence.nodes[0];
  assert.equal(node.value, 9);
  assert.equal(node.usableForCurrentCut, false);
  assert.ok(node.uncertainty.includes("historical_capture_not_current"));
  assert.equal(node.uncertainty.includes("collection_policy_closed"), false);
  assert.equal(node.sourceLifecycle.announcement.time, null);
  assert.equal(node.sourceLifecycle.measuredShutdown, null);
});

test("provider failure and a withheld post-policy count stay unavailable, not zero", () => {
  const outage = observeSmithery(capture({
    httpStatus: 500,
    body: { pagination: { totalCount: 0 } },
  }), { nowMs: BEFORE_MS });
  assert.equal(outage.availability, "unavailable");
  assert.equal(outage.sourceLifecycle.observedFailure.code, "http_500");
  assert.equal(outage.sourceLifecycle.observedFailure.availability, "unavailable");
  assert.equal(outage.sourceLifecycle.announcementIsOutage, false);
  assert.equal(outage.sourceLifecycle.capturePlacement, "before_collection_policy");
  assert.equal(outage.warnings.some((warning) => warning.code === "collection_policy"), false);
  assertNotZero(outage);
  assert.equal(validate(outage), true, JSON.stringify(validate.errors));

  const malformed = observeSmithery(capture({ body: "not-json" }), { nowMs: BEFORE_MS });
  assert.equal(malformed.availability, "error");
  assert.equal(malformed.errors[0].code, "schema_error");
  assert.deepEqual(malformed.sourceLifecycle.observedFailure, { code: "schema_error", availability: "error" });
  assertNotZero(malformed);

  const malformedTransport = observeSmithery(capture({
    body: null,
    error: { code: "malformed_json", kind: "error", message: "upstream body is not JSON" },
  }), { nowMs: BEFORE_MS });
  assert.equal(malformedTransport.availability, "error");
  assert.equal(malformedTransport.sourceLifecycle.observedFailure.code, "malformed_json");
  assertNotZero(malformedTransport);

  const withheldZero = observeSmithery(capture({
    fetchedAt: AFTER,
    body: { pagination: { totalCount: 0 } },
  }), { nowMs: AFTER_MS });
  assert.equal(withheldZero.availability, "unavailable");
  assert.equal(withheldZero.httpStatus, 200);
  assert.equal(withheldZero.sourceLifecycle.observedFailure, null);
  assert.equal(withheldZero.sourceLifecycle.capturePlacement, "at_or_after_collection_policy");
  assert.ok(withheldZero.sourceLifecycle.doesNotEstablish.includes("empty_catalog"));
  assert.ok(withheldZero.sourceLifecycle.doesNotEstablish.includes("zero_traffic"));
  assert.ok(withheldZero.sourceLifecycle.doesNotEstablish.includes("replacement_population"));
  assert.equal(withheldZero.rawExcerpt, undefined);
  assertNotZero(withheldZero);
  assert.equal(validate(withheldZero), true, JSON.stringify(validate.errors));

  const withheldCount = observeSmithery(capture({
    fetchedAt: "2026-10-31T18:00:00.000Z",
    body: { pagination: { totalCount: 13594 } },
  }), { nowMs: Date.parse("2026-10-31T18:00:00.000Z") });
  assert.equal(withheldCount.sourceLifecycle.observedFailure, null);
  assert.equal(withheldCount.sourceLifecycle.collectionPolicy.officialShutdown, null);
  assertNotZero(withheldCount);

  const failedAfter = observeSmithery(capture({
    fetchedAt: AFTER,
    httpStatus: 500,
    body: null,
  }), { nowMs: AFTER_MS });
  assert.equal(failedAfter.availability, "unavailable");
  assert.equal(failedAfter.sourceLifecycle.observedFailure.code, "http_500");
  assert.equal(failedAfter.sourceLifecycle.announcementIsOutage, false);
  assert.ok(failedAfter.warnings.some((warning) => warning.code === "collection_policy"));
  assertNotZero(failedAfter);

  const malformedAfter = observeSmithery(capture({
    fetchedAt: AFTER,
    body: [],
  }), { nowMs: AFTER_MS });
  assert.equal(malformedAfter.availability, "error");
  assert.equal(malformedAfter.errors[0].code, "schema_error");
  assert.deepEqual(malformedAfter.sourceLifecycle.observedFailure, { code: "schema_error", availability: "error" });
  assert.ok(malformedAfter.warnings.some((warning) => warning.code === "collection_policy"));
  assertNotZero(malformedAfter);
});

test("cache keeps a pre-policy capture, and a later failure does not retry or replace it", async () => {
  let now = Date.parse("2026-10-30T23:59:50.000Z");
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.equal(String(url), SMITHERY_URL);
    if (calls === 1) return jsonResponse({ pagination: { totalCount: 42 } });
    return jsonResponse({ pagination: { totalCount: 0 } }, 500);
  };
  const fetcher = createBoundedFetcher({ fetchImpl, now: () => now, cacheTtlMs: 30000 });
  const runtime = createObservatoryRuntime({ fetcher, now: () => now });
  const first = await runtime.observe("smithery_mcp");
  assert.equal(calls, 1);
  assert.equal(metric(first, "registered_servers").value, 42);
  assert.equal(first.sourceLifecycle.currentAdmission, "open");

  now += 15000;
  const cached = await runtime.observe("smithery_mcp");
  assert.equal(calls, 1);
  assert.equal(cached.cache.hit, true);
  assert.equal(metric(cached, "registered_servers").value, 42);
  assert.equal(cached.fetchedAt, first.fetchedAt);
  assert.equal(cached.sourceLifecycle.capturePlacement, "before_collection_policy");
  assert.equal(cached.sourceLifecycle.currentAdmission, "closed");
  assert.equal(metric(first, "registered_servers").value, 42);

  const projected = projectPositioning({ fetchedAt: new Date(now).toISOString(), observations: [cached] });
  const node = projected.planes.catalog_presence.nodes[0];
  assert.equal(node.value, 42);
  assert.equal(node.usableForCurrentCut, false);
  assert.ok(node.uncertainty.includes("historical_capture_not_current"));

  now = AFTER_MS;
  const failed = await runtime.observe("smithery_mcp");
  assert.equal(calls, 2);
  assert.equal(failed.availability, "unavailable");
  assert.equal(failed.sourceLifecycle.observedFailure.code, "http_500");
  assertNotZero(failed);
  assert.equal(metric(first, "registered_servers").value, 42);
  assert.equal(metric(cached, "registered_servers").value, 42);
});

test("a Smithery failure does not fall back to another source or invent a current count", async () => {
  const calls = [];
  const bodies = sourceBodies(AFTER);
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target === SMITHERY_URL) return jsonResponse({ pagination: { totalCount: 1 } }, 503);
    const body = bodies[target];
    if (!body) throw new Error(`unexpected upstream ${target}`);
    return jsonResponse(body);
  };
  const runtime = createObservatoryRuntime({
    fetchImpl,
    now: () => AFTER_MS,
    cacheTtlMs: 0,
  });
  const snapshot = await runtime.observeAll();
  const smithery = snapshot.observations.find((row) => row.sourceId === "smithery_mcp");
  const moltjobs = snapshot.observations.find((row) => row.sourceId === "moltjobs");
  const x402 = snapshot.observations.find((row) => row.sourceId === "x402stats");
  const openJobs = snapshot.observations.find((row) => row.sourceId === "moltjobs_open_jobs");
  assert.equal(calls.filter((url) => url === SMITHERY_URL).length, 1);
  assert.deepEqual(calls.slice().sort(), [MOLTJOBS_URL, OPEN_JOBS_URL, SMITHERY_URL, X402_URL].sort());
  assert.equal(smithery.availability, "unavailable");
  assertNotZero(smithery);
  assert.equal(smithery.sourceLifecycle.observedFailure.availability, "unavailable");
  assert.equal(moltjobs.sourceLifecycle, undefined);
  assert.equal(x402.sourceLifecycle, undefined);
  assert.equal(openJobs.sourceLifecycle, undefined);
  assert.equal(metric(moltjobs, "jobCount").value, 12);
  assert.equal(metric(x402, "sellers_30d").value, 47303);
  assert.notEqual(metric(smithery, "registered_servers").value, metric(moltjobs, "jobCount").value);

  const projected = projectPositioning({ fetchedAt: snapshot.fetchedAt, observations: snapshot.observations });
  const catalog = projected.planes.catalog_presence.nodes[0];
  assert.equal(catalog.value, null);
  assert.equal(catalog.usableForCurrentCut, false);
  assert.ok(catalog.uncertainty.includes("unavailable"));
  assert.ok(catalog.uncertainty.includes("collection_policy_closed"));
  assert.ok(catalog.uncertainty.includes("observed_provider_failure"));
  assert.equal(catalog.sourceLifecycle.announcementIsOutage, false);
  const jobs = projected.planes.task_completion.nodes.find((node) => node.sourceId === "moltjobs");
  assert.equal(jobs.sourceLifecycle, undefined);
  assert.equal(jobs.value, 4);

  const timeout = observeSmithery(capture({
    httpStatus: null,
    body: null,
    error: { code: "timeout", kind: "unavailable", message: "timed out" },
  }), { nowMs: BEFORE_MS });
  assert.equal(timeout.availability, "unavailable");
  assert.equal(timeout.sourceLifecycle.observedFailure.code, "timeout");
  assert.equal(timeout.warnings.some((warning) => warning.code === "collection_policy"), false);
  assertNotZero(timeout);
});

test("the bridge error path keeps Smithery lifecycle off unrelated sources", async () => {
  const runtime = createObservatoryRuntime({
    now: () => BEFORE_MS,
    fetcher: { async getCapture() { throw new Error("boom"); } },
  });
  const smithery = await runtime.observe("smithery_mcp");
  const moltjobs = await runtime.observe("moltjobs");
  assert.equal(smithery.availability, "error");
  assert.equal(smithery.errors[0].code, "bridge_error");
  assert.equal(smithery.sourceLifecycle.observedFailure.code, "bridge_error");
  assert.equal(smithery.sourceLifecycle.announcementIsOutage, false);
  assertNotZero(smithery);
  assert.equal(moltjobs.sourceLifecycle, undefined);
  assert.equal(metric(moltjobs, "jobCount").value, null);
  assert.equal(validate(smithery), true, JSON.stringify(validate.errors));
});

test("mounted routes keep a pre-policy count and withhold a post-policy count", async (t) => {
  const calls = [];
  let now = BEFORE_MS;
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target !== SMITHERY_URL && target !== MOLTJOBS_URL && target !== X402_URL && target !== OPEN_JOBS_URL) {
      throw new Error(`unexpected upstream ${target}`);
    }
    if (target === SMITHERY_URL) return jsonResponse({ pagination: { totalCount: 13594 } });
    return jsonResponse(sourceBodies(new Date(now).toISOString())[target]);
  };
  const app = express();
  app.use("/api/observatory", createObservatoryRouter({
    fetchImpl,
    now: () => now,
    cacheTtlMs: 0,
    originalCapturePath: "",
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;

  const current = await fetch(`${base}/api/observatory/sources/smithery_mcp`);
  const currentBody = await current.json();
  assert.equal(current.status, 200);
  assert.equal(metric(currentBody, "registered_servers").value, 13594);
  assert.equal(currentBody.sourceLifecycle.currentAdmission, "open");
  assert.deepEqual(calls, [SMITHERY_URL]);

  now = AFTER_MS;
  const later = await fetch(`${base}/api/observatory/convergence`);
  const laterBody = await later.json();
  assert.equal(later.status, 200);
  const smithery = laterBody.bridge.observations.find((row) => row.sourceId === "smithery_mcp");
  const moltjobs = laterBody.bridge.observations.find((row) => row.sourceId === "moltjobs");
  assert.equal(smithery.measuredZero, false);
  assert.equal(metric(smithery, "registered_servers").value, null);
  assert.equal(smithery.sourceLifecycle.capturePlacement, "at_or_after_collection_policy");
  assert.equal(smithery.sourceLifecycle.observedFailure, null);
  assert.equal(smithery.sourceLifecycle.announcement.officialInstant, null);
  assert.equal(moltjobs.measuredZero, false);
  assert.equal(metric(moltjobs, "jobCount").value, 12);
  assert.equal(moltjobs.sourceLifecycle, undefined);
  assert.equal(calls.filter((url) => url === SMITHERY_URL).length, 2);
});

// ROOT2036 regressions, separate from the original ROOT1174 receiving above.
test("ROOT2036: schema failures survive policy, historical replay, and recovery", () => {
  const cases = [
    [null, "schema_error"], [[], "schema_error"], ["bad", "schema_error"],
    [{}, "missing_pagination"], [{ pagination: [] }, "missing_pagination"],
    [{ pagination: {} }, "missing_total_count"],
    [{ pagination: { totalCount: null } }, "missing_total_count"],
    ...["bad", -1, 1.5, {}, true, Number.MAX_SAFE_INTEGER + 1].map(totalCount => [
      { pagination: { totalCount } }, "invalid_total_count",
    ]),
  ];
  for (const fetchedAt of [BEFORE, POLICY_INSTANT, AFTER]) {
    for (const [body, code] of cases) {
      const result = observeSmithery(capture({ fetchedAt, body }), { nowMs: AFTER_MS });
      assert.deepEqual(result.sourceLifecycle.observedFailure, { code, availability: "error" });
      assert.equal(result.sourceLifecycle.measuredShutdown, null);
      assert.equal(result.sourceLifecycle.announcementIsOutage, false);
      assertNotZero(result);
      assert.equal(validate(result), true, JSON.stringify(validate.errors));
      assert.equal(result.sourceLifecycle.policyAdmitsCapture, fetchedAt === BEFORE);
      if (fetchedAt !== BEFORE) {
        assert.equal(result.availability, "error");
        assert.ok(result.warnings.some(row => row.code === "collection_policy"));
        assert.equal(result.rawExcerpt, undefined);
      }
    }
    for (const totalCount of [0, 7, "7"]) {
      const recovered = observeSmithery(capture({ fetchedAt, body: { pagination: { totalCount } } }), { nowMs: AFTER_MS });
      assert.equal(recovered.sourceLifecycle.observedFailure, null);
      assert.equal(recovered.availability, fetchedAt === BEFORE ? "ok" : "unavailable");
      if (fetchedAt === BEFORE) assert.equal(metric(recovered, "registered_servers").value, Number(totalCount));
      else assertNotZero(recovered);
      assert.equal(validate(recovered), true, JSON.stringify(validate.errors));
    }
  }
});

test("ROOT2036: transport failures retain precedence over absent response schema", () => {
  for (const fetchedAt of [BEFORE, AFTER]) {
    for (const [httpStatus, error, code, availability] of [
      [503, null, "http_503", "unavailable"],
      [null, { code: "timeout", message: "fixture timeout" }, "timeout", "unavailable"],
      [200, { code: "malformed_json", message: "fixture invalid JSON" }, "malformed_json", "error"],
    ]) {
      const result = observeSmithery({ ...capture({ fetchedAt, body: null, error }), httpStatus }, { nowMs: AFTER_MS });
      assert.deepEqual(result.sourceLifecycle.observedFailure, { code, availability });
      assert.equal(result.availability, availability);
      assertNotZero(result);
      assert.equal(validate(result), true, JSON.stringify(validate.errors));
    }
  }
});

test("ROOT2036: shared positioning distinguishes schema failure from policy-only withholding", () => {
  for (const [body, hasFailure] of [[{}, true], [{ pagination: { totalCount: -1 } }, true], [{ pagination: { totalCount: 7 } }, false]]) {
    const observation = observeSmithery(capture({ fetchedAt: AFTER, body }), { nowMs: AFTER_MS });
    const projection = projectPositioning({ fetchedAt: AFTER, observations: [observation] });
    const node = projection.planes.catalog_presence.nodes[0];
    assert.equal(node.value, null);
    assert.equal(node.usableForCurrentCut, false);
    assert.ok(node.uncertainty.includes("collection_policy_closed"));
    assert.equal(node.uncertainty.includes("observed_provider_failure"), hasFailure);
    assert.equal(node.sourceLifecycle.observedFailure?.availability ?? null, hasFailure ? "error" : null);
  }
});
