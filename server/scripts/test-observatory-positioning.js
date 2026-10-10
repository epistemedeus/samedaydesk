import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import express from "express";
import { observe as observeOpenJobs } from "../lib/observatory/adapters/moltjobs-open-jobs.js";
import { projectPositioning } from "../lib/observatory/positioning.js";
import { createObservatoryRuntime } from "../lib/observatory/registry.js";
import { createObservatoryRouter } from "../routes/observatory.js";
import { runCli, writeCapture } from "./observatory-capture.mjs";

const execFileAsync = promisify(execFile);
const FETCHED_AT = "2026-10-10T03:00:00.000Z";
const CLI = fileURLToPath(new URL("./observatory-capture.mjs", import.meta.url));
const SECRET_TITLE = "secret-title-do-not-export";
const SECRET_POSTER = "poster-secret-9f3a";
const SECRET_CURSOR = "cursor-secret-9f3a";
const SECRET_BUDGET = "41899.50";
const SECRET_EMAIL = "person@example.com";

function capture(body, extra = {}) {
  return {
    fetchedAt: FETCHED_AT,
    httpStatus: extra.httpStatus ?? 200,
    body,
    cache: { hit: false, ageMs: 0, stale: false, ttlMs: 30000, fetchedAt: FETCHED_AT },
    headers: {},
    error: extra.error ?? null,
    ...extra,
  };
}

function page(rows, meta = { hasMore: false, limit: 20 }) {
  return { data: rows, meta };
}

function row(overrides = {}) {
  return {
    id: "job-id-secret",
    posterId: SECRET_POSTER,
    title: SECRET_TITLE,
    status: "OPEN",
    purpose: "PLATFORM_REFERRAL",
    participationMode: "AUTOMATIC_FORUM_REWARD",
    templateId: "custom-v1",
    funded: true,
    budgetUsdc: SECRET_BUDGET,
    requiredSkills: [],
    preferredSkills: [],
    inputData: { generalDescription: SECRET_EMAIL },
    tokenAddress: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
    ...overrides,
  };
}

function metric(key, value, extra = {}) {
  return {
    key,
    value,
    state: "ok",
    unit: "count",
    definition: key,
    population: extra.population || "population",
    window: extra.window || "window",
    ...extra,
  };
}

function stockObservation(overrides = {}) {
  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    availability: "ok",
    providerTimestampState: "ok",
    evidenceClass: "provider_reported_aggregate",
    metrics: [
      metric("jobCount", 110, { population: "moltjobs_work_market" }),
      metric("completedCount", 40, { population: "moltjobs_work_market" }),
      metric("marketplaceJobs", 48, { population: "moltjobs_marketplace_ordinary_third_party" }),
      metric("marketplaceCompleted", 6, { population: "moltjobs_marketplace_ordinary_third_party" }),
      metric("volumeUsdc", "90.00", { unit: "USDC", population: "moltjobs_work_market" }),
      metric("marketplaceSettledVolumeUsdc", "8.25", { unit: "USDC", population: "moltjobs_marketplace_ordinary_third_party" }),
      metric("escrowDeposits", "1.00", { unit: "USDC" }),
    ],
    ...overrides,
  };
}

function settlementObservation() {
  return {
    sourceId: "x402stats",
    availability: "ok",
    providerTimestampState: "ok",
    metrics: [
      metric("volume_usd_30d", 1021.25, { unit: "USD", population: "provider_indexed_volume", window: "30d" }),
      metric("organic_volume_usd_30d", 10, { unit: "USD", population: "provider_heuristic_organic_volume", window: "30d", evidenceClass: "provider_heuristic" }),
      metric("sellers_30d", 40, { population: "provider_indexed_sellers", window: "30d" }),
    ],
  };
}

function catalogObservation() {
  return {
    sourceId: "smithery_mcp",
    availability: "ok",
    providerTimestampState: "ok",
    metrics: [metric("registered_servers", 100, { population: "smithery_server_catalog", window: "catalog_snapshot" })],
  };
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  for (const secret of [SECRET_TITLE, SECRET_POSTER, SECRET_CURSOR, SECRET_BUDGET, SECRET_EMAIL, "0x8904"]) {
    assert.equal(text.includes(secret), false, secret);
  }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test("open page drops identifiers and ranks platform purpose on its own denominator", () => {
  const envelope = observeOpenJobs(capture(page([
    row(),
    row(),
    row({ purpose: "ORDINARY_WORK", funded: false, participationMode: "BID", requiredSkills: ["lockfile-pin-delta"] }),
  ], { hasMore: true, limit: 20, nextCursor: SECRET_CURSOR, publicDetailRoute: "/v1/jobs/:id/public" })));
  assert.equal(envelope.sourceId, "moltjobs_open_jobs");
  assert.equal(envelope.coverage.complete, false);
  assert.equal(envelope.rawExcerpt, undefined);
  assert.equal(envelope.paidActivity.available, false);
  assert.equal(envelope.metrics.find((item) => item.key === "returned_rows").value, 3);
  assert.equal(envelope.metrics.find((item) => item.key === "platform_program_rows").value, 2);
  assert.equal(envelope.metrics.find((item) => item.key === "ordinary_rows").value, 1);
  assert.equal(envelope.metrics.find((item) => item.key === "capability_skill_matches").value, 1);
  assert.equal(envelope.metrics.find((item) => item.key === "page_has_more").value, 1);
  assert.deepEqual(envelope.workload.matchedJobIds, ["lockfile-pin-delta"]);
  assert.equal(envelope.workload.queryExhausted, false);
  assertNoSecrets(envelope);

  const projected = projectPositioning({
    fetchedAt: FETCHED_AT,
    observations: [envelope, stockObservation(), settlementObservation(), catalogObservation()],
  });
  assert.equal(projected.additivity, "not_additive");
  assert.equal(projected.coverage.census, false);
  assert.equal(projected.activityRanking.state, "ok");
  assert.equal(projected.activityRanking.denominator.key, "returned_rows");
  assert.equal(projected.activityRanking.denominator.value, 3);
  assert.equal(projected.activityRanking.ordered[0].nodeId, "purpose:PLATFORM_REFERRAL");
  assert.equal(projected.activityRanking.ordered[0].mechanismBasis, "observed");
  assert.equal(projected.activityRanking.ordered[0].inference.basis, "inference");
  assert.equal(projected.activityRanking.ordered[1].nodeId, "purpose:ORDINARY_WORK");
  const listingIds = projected.planes.job_listings.nodes.map((node) => node.id);
  const completionIds = projected.planes.task_completion.nodes.map((node) => node.id);
  const totalIds = projected.planes.transaction_totals.nodes.map((node) => node.id);
  const catalogIds = projected.planes.catalog_presence.nodes.map((node) => node.id);
  assert.ok(listingIds.includes("open_nonexpired_page"));
  assert.equal(completionIds.includes("open_nonexpired_page"), false);
  assert.equal(totalIds.includes("open_nonexpired_page"), false);
  assert.equal(catalogIds.includes("open_nonexpired_page"), false);
  assert.equal(projected.planes.catalog_presence.nodes[0].value, 100);
  assert.equal(projected.planes.transaction_totals.nodes.some((node) => node.value === "8.25"), true);
  assert.equal(projected.decision.exactSkillOverlap, "present");
  assert.equal(projected.decision.meetsMaintainedExecution, "exact_skill_overlap");
  assert.equal(projected.decision.inboundUse, "unobserved");
  assert.deepEqual(projected.decision.nextAction.doesNotDo, ["listing", "broadcast", "customer_message", "bid", "spend"]);
  assertNoSecrets(projected);
  const combined = 8.25 + 1021.25;
  assert.equal(JSON.stringify(projected).includes(String(combined)), false);
});

test("exhausted platform-only page is no exact overlap and not a demand zero", () => {
  const envelope = observeOpenJobs(capture(page([row(), row()])));
  assert.equal(envelope.metrics.find((item) => item.key === "ordinary_rows").value, 0);
  assert.equal(envelope.metrics.find((item) => item.key === "ordinary_rows").state, "ok");
  assert.equal(envelope.workload.queryExhausted, true);
  const projected = projectPositioning({ fetchedAt: FETCHED_AT, observations: [envelope] });
  assert.equal(projected.decision.meetsMaintainedExecution, "no_exact_overlap");
  assert.equal(projected.decision.exactSkillOverlap, "none");
  assert.match(projected.decision.statements.map((item) => item.text).join(" "), /not proof the market has no ordinary work/);
  assert.match(projected.decision.nextAction.falsifier, /PLATFORM_REFERRAL/);
  assert.equal(projected.activityRanking.ordered.length, 1);
  assert.equal(projected.activityRanking.denominator.queryExhausted, true);
});

test("core-only projection stays useful with every provider absent", () => {
  const projected = projectPositioning({ fetchedAt: FETCHED_AT, observations: [] });
  assert.equal(projected.decision.state, "unobserved");
  assert.equal(projected.decision.capability.schema, "samedaydesk.for-agents.useful-jobs.v1");
  assert.equal(projected.decision.capability.version, "1.4.7");
  assert.equal(projected.decision.meetsMaintainedExecution, "unobserved");
  assert.equal(projected.activityRanking.state, "withheld");
  assert.equal(projected.activityRanking.ordered.length, 0);
  assert.ok(projected.planes.job_listings.nodes.every((node) => node.state === "unobserved" && node.value === null));
  assert.ok(projected.planes.transaction_totals.nodes.every((node) => node.value === null));
  assert.equal(projected.notAdopted[0].called, false);
  assert.equal(projected.documentedUnavailable[0].called, false);
  assert.equal(projected.decision.nextAction.id, "capture_fixed_open_jobs_query");
});

test("removing the open-jobs adapter does not borrow marketplace stock as the queue", () => {
  const projected = projectPositioning({
    fetchedAt: FETCHED_AT,
    observations: [stockObservation(), settlementObservation(), catalogObservation()],
  });
  const open = projected.planes.job_listings.nodes.find((node) => node.id === "open_nonexpired_page");
  const stock = projected.planes.job_listings.nodes.find((node) => node.id === "ordinary_created_stock");
  assert.equal(open.state, "unobserved");
  assert.equal(open.value, null);
  assert.equal(stock.value, 48);
  assert.equal(projected.activityRanking.reason, "open_page_unobserved");
  assert.equal(projected.decision.meetsMaintainedExecution, "unobserved");
  assert.notEqual(open.value, stock.value);
});

test("stale, unavailable, partial, and conflicting inputs withhold a current cut", () => {
  const stale = projectPositioning({
    fetchedAt: FETCHED_AT,
    observations: [stockObservation({ providerTimestampState: "stale" }), {
      sourceId: "moltjobs_open_jobs",
      availability: "ok",
      providerTimestampState: "stale",
      metrics: [
        metric("returned_rows", 2),
        metric("platform_program_rows", 2),
        metric("ordinary_rows", 0),
        metric("unclassified_rows", 0),
        metric("capability_skill_matches", 0),
      ],
      workload: {
        queryExhausted: true,
        purposes: [{ token: "PLATFORM_REFERRAL", class: "platform_program", count: 2 }],
        participationModes: [],
        matchedJobIds: [],
      },
    }],
  });
  const open = stale.planes.job_listings.nodes.find((node) => node.id === "open_nonexpired_page");
  assert.equal(open.usableForCurrentCut, false);
  assert.ok(open.uncertainty.includes("stale"));
  assert.equal(stale.decision.usableForCurrentCut, false);
  assert.equal(stale.activityRanking.state, "ok");
  assert.ok(stale.activityRanking.ordered[0].uncertainty.includes("stale"));

  const unavailable = observeOpenJobs(capture(null, {
    httpStatus: null,
    error: { code: "timeout", message: "timed out" },
  }));
  assert.equal(unavailable.availability, "unavailable");
  assert.ok(unavailable.metrics.every((item) => item.value === null));
  const unavailableCut = projectPositioning({ fetchedAt: FETCHED_AT, observations: [unavailable] });
  assert.equal(unavailableCut.activityRanking.state, "withheld");
  assert.equal(unavailableCut.decision.meetsMaintainedExecution, "unobserved");

  const partial = observeOpenJobs(capture({ data: [row()], meta: {} }));
  assert.equal(partial.availability, "partial");
  assert.equal(partial.metrics.find((item) => item.key === "page_has_more").state, "missing");
  assert.equal(partial.metrics.find((item) => item.key === "page_has_more").value, null);

  const conflict = projectPositioning({
    fetchedAt: FETCHED_AT,
    observations: [
      stockObservation(),
      stockObservation({ metrics: [metric("jobCount", 999)] }),
    ],
  });
  assert.equal(conflict.decision.state, "blocked");
  assert.equal(conflict.activityRanking.ordered.length, 0);
  assert.ok(conflict.planes.job_listings.nodes.every((node) => node.value === null));
  assert.equal(JSON.stringify(conflict.planes).includes("999"), false);

  const broken = {
    sourceId: "moltjobs_open_jobs",
    availability: "ok",
    providerTimestampState: "missing",
    metrics: [
      metric("returned_rows", 3),
      metric("platform_program_rows", 1),
      metric("ordinary_rows", 1),
      metric("unclassified_rows", 0),
    ],
    workload: null,
  };
  const internal = projectPositioning({ fetchedAt: FETCHED_AT, observations: [broken] });
  assert.equal(internal.conflicts[0].code, "open_page_count_conflict");
  assert.equal(internal.activityRanking.state, "withheld");
});

test("oversized page and non-token purpose do not export row text", () => {
  const huge = observeOpenJobs(capture({ data: Array.from({ length: 101 }, () => row()), meta: { hasMore: true, limit: 20 } }));
  assert.equal(huge.availability, "partial");
  assert.ok(huge.metrics.every((item) => item.state === "overflow" && item.value === null));
  assertNoSecrets(huge);

  const loose = observeOpenJobs(capture(page([row({ purpose: SECRET_TITLE, requiredSkills: [SECRET_EMAIL] })])));
  assert.equal(loose.metrics.find((item) => item.key === "unclassified_rows").value, 1);
  assert.equal(loose.metrics.find((item) => item.key === "capability_skill_matches").value, 0);
  assert.equal(loose.workload.purposes.length, 0);
  assertNoSecrets(loose);
});

test("machine route returns the positioning cut and not a human page", async (t) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/v1/jobs?")) {
      return new Response(JSON.stringify(page([row()])), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("api.moltjobs.io")) {
      return new Response(JSON.stringify({ data: { totalJobs: 4, totalCompleted: 1, totalVolumeUsdc: "2.00", escrowedUsdc: "0.50" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("x402stats.io")) {
      return new Response(JSON.stringify({ snapshot: { sellers: 3, volumeUsd: "5.00", windowDays: 30 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("smithery.ai")) {
      return new Response(JSON.stringify({ pagination: { totalCount: 9 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected ${url}`);
  };
  const app = express();
  app.use("/api/observatory", createObservatoryRouter({
    runtime: createObservatoryRuntime({ fetchImpl, now: () => Date.parse(FETCHED_AT) }),
  }));
  const { server, base } = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`${base}/api/observatory/positioning`, { headers: { Origin: "https://neomorphic.io" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://neomorphic.io");
  const body = await response.json();
  assert.equal(body.schemaVersion, "pilot.external-observatory.positioning.v1");
  assert.equal(body.decision.capability.package, "useful-jobs");
  assert.equal(body.activityRanking.denominator.value > 0, true);
  assertNoSecrets(body);
  assert.equal(calls.filter((url) => url.includes("/v1/activity")).length, 0);
  assert.equal(calls.filter((url) => url.includes("/v1/jobs?")).length, 1);
});

test("CLI position reads a capture and core-only stays empty of provider counts", async () => {
  const envelope = observeOpenJobs(capture(page([row()])));
  const dir = mkdtempSync(join(tmpdir(), "obs-position-"));
  const written = await writeCapture(dir, [envelope, stockObservation()], { now: FETCHED_AT, label: "fixture" });
  const positioned = await runCli(["position", "--capture", written.dir]);
  assert.equal(positioned.code, 0);
  const body = JSON.parse(positioned.stdout);
  assert.equal(body.activityRanking.ordered[0].nodeId, "purpose:PLATFORM_REFERRAL");
  assertNoSecrets(body);

  const core = await runCli(["position", "--core-only", "--now", FETCHED_AT]);
  assert.equal(core.code, 0);
  const empty = JSON.parse(core.stdout);
  assert.equal(empty.decision.state, "unobserved");
  assert.equal(empty.planes.catalog_presence.nodes[0].value, null);

  const missing = await runCli(["position"]);
  assert.equal(missing.code, 2);
  const both = await runCli(["position", "--core-only", "--capture", written.dir]);
  assert.equal(both.code, 2);
});

test("cold CLI outside the checkout projects a fixture capture", async () => {
  const envelope = observeOpenJobs(capture(page([
    row({ purpose: "PLATFORM_REFERRAL", requiredSkills: [] }),
  ])));
  const dir = mkdtempSync(join(tmpdir(), "obs-cold-"));
  const written = await writeCapture(dir, [envelope], { now: FETCHED_AT, label: "fixture" });
  const out = join(dir, "positioning.json");
  const cold = await execFileAsync(process.execPath, [CLI, "position", "--capture", written.dir, "--out", out], { cwd: dir });
  assert.equal(cold.stderr, "");
  const fromDisk = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(fromDisk.decision.meetsMaintainedExecution, "no_exact_overlap");
  assert.equal(fromDisk.decision.inboundUse, "unobserved");
  assertNoSecrets(fromDisk);
  writeFileSync(join(dir, "note.txt"), "cold cli ok\n");
});
