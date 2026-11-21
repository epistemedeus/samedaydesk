import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createMonitor, frozenClock, openFileStore } from "../src/index.mjs";
import { readMaintainedProjection, seedMeaningfulMutation } from "../src/consumers/source-projection.mjs";
import { applySourceUpdate, emptyProjection, seededFailureRequest } from "../vendor/s12-observatory/projection.js";
import { packageRoot, releaseSubscription, startLocalReceiver, tempDir } from "./support.mjs";

const NOW = "2026-10-01T12:00:00.000Z";
const LATER = "2026-10-01T12:05:00.000Z";

function metric(key, value, population) {
  return {
    key,
    value,
    state: "ok",
    unit: "count",
    population,
    window: "point",
  };
}

function coveredReading({ marketplaceCompleted = 15, fetchedAt = NOW, availability = "ok" } = {}) {
  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    availability,
    fetchedAt,
    providerTimestamp: fetchedAt,
    providerTimestampState: "ok",
    metrics: [
      metric("jobCount", 122, "moltjobs_work_market"),
      metric("marketplaceCompleted", marketplaceCompleted, "moltjobs_marketplace_ordinary_third_party"),
      metric("marketplaceEmployers", 4, "moltjobs_marketplace_employers"),
      metric("liquidityRegisteredAgents", 434, "moltjobs_registered_agents"),
      metric("liquidityAgentsEverPaid", 3, "moltjobs_agents_ever_paid"),
      metric("liquidityAgentsBidding30d", 2, "moltjobs_agents_bidding_30d"),
      metric("platformProgramJobs", 1, "moltjobs_platform_programs"),
    ],
  };
}

function projectReading(reading, observedAt = LATER, prior = null) {
  const base = prior || emptyProjection({ observedAt });
  return applySourceUpdate(base, reading, { observedAt }).projection;
}

function asDocument(projection, capture) {
  return { capture, integration: "maintained", projection, publicSourceChanged: false };
}

async function subscribedMonitor(file) {
  const monitor = createMonitor({
    store: await openFileStore(file),
    clock: frozenClock(LATER),
    receivers: { "local-vm": { kind: "local-http", baseUrl: "http://127.0.0.1:9" } },
  });
  await monitor.subscribe({
    ...releaseSubscription("moltjobs-maintained"),
    source: { kind: "source-projection", scope: "source-projection:moltjobs" },
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  return monitor;
}

test("projection failures, population gaps, and sums do not become numeric traffic", async () => {
  const dir = await tempDir("change-monitor-projection-");
  try {
    const monitor = await subscribedMonitor(dir.file);
    const baselineProjection = projectReading(coveredReading());
    const baseline = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: asDocument(baselineProjection, "injected"),
    });
    assert.equal(baseline.outcome, "baseline_established");
    assert.equal((await monitor.read()).evidence[baseline.evidenceId].nonSemantic.capture, "injected");

    const unavailable = projectReading(coveredReading({ availability: "unavailable", marketplaceCompleted: 0 }), LATER);
    const failed = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: asDocument(unavailable, "injected"),
    });
    assert.equal(failed.evidenceClass, "missing");
    assert.equal((await monitor.read()).evidence[failed.evidenceId].material, null);
    assert.equal(JSON.stringify((await monitor.read()).evidence[failed.evidenceId]).includes('"value":0'), false);

    const staleProjection = projectReading(coveredReading({ fetchedAt: "2026-09-01T00:00:00.000Z" }), "2026-09-04T00:00:00.000Z");
    const stale = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: asDocument(staleProjection, "injected"),
    });
    assert.equal(stale.evidenceClass, "stale");
    assert.equal((await monitor.read()).evidence[stale.evidenceId].material, null);

    const partial = projectReading({
      ...coveredReading(),
      metrics: coveredReading().metrics.filter((entry) => entry.key !== "platformProgramJobs"),
    });
    const population = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: asDocument(partial, "injected"),
    });
    assert.equal(population.evidenceClass, "incomparable");
    assert.equal(population.outcome, "evidence_unavailable");
    assert.equal((await monitor.read()).evidence[population.evidenceId].material, null);

    const sum = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: seededFailureRequest(),
    });
    assert.equal(sum.evidenceClass, "incomparable");
    const sumEvidence = (await monitor.read()).evidence[sum.evidenceId];
    assert.equal(sumEvidence.material, null);
    assert.equal(sumEvidence.failureCode, "mixed_population_sum");
    assert.equal(sumEvidence.nonSemantic.total, null);
    assert.equal(sumEvidence.nonSemantic.summedWithPrior, false);
    assert.equal(sumEvidence.nonSemantic.marketWideTraffic, null);
    const state = await monitor.read();
    assert.equal(Object.values(state.events).some((event) => event.transition === "content_changed"), false);
  } finally {
    await dir.cleanup();
  }
});

test("a seeded mutation is one durable change and stays distinct from the captured baseline", async () => {
  const dir = await tempDir("change-monitor-seed-");
  const receiver = await startLocalReceiver();
  try {
    const open = async () => createMonitor({
      store: await openFileStore(dir.file),
      clock: frozenClock(LATER),
      receivers: { "local-vm": { kind: "local-http", baseUrl: receiver.baseUrl } },
    });
    const monitor = await open();
    await monitor.subscribe({
      ...releaseSubscription("moltjobs-maintained"),
      source: { kind: "source-projection", scope: "source-projection:moltjobs" },
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const live = asDocument(projectReading(coveredReading({ marketplaceCompleted: 15 })), "injected");
    const baseline = await monitor.observe({ subscriptionId: "moltjobs-maintained", document: live });
    assert.equal(baseline.outcome, "baseline_established");
    const again = await monitor.observe({ subscriptionId: "moltjobs-maintained", document: live });
    assert.equal(again.outcome, "unchanged");
    const seeded = seedMeaningfulMutation(live, { sourceId: "moltjobs", key: "marketplaceCompleted", now: LATER });
    assert.equal(seeded.publicSourceChanged, false);
    assert.equal(seeded.capture, "seeded");
    const changed = await monitor.observe({ subscriptionId: "moltjobs-maintained", document: seeded });
    assert.equal(changed.outcome, "content_changed");
    const duplicate = await monitor.observe({ subscriptionId: "moltjobs-maintained", document: seeded });
    assert.equal(duplicate.outcome, "unchanged");
    const delivered = await monitor.deliver();
    assert.equal(delivered[0].state, "accepted");
    const restarted = await open();
    const stored = await restarted.read();
    assert.equal(stored.events[changed.eventId].capture, "seeded");
    assert.equal(stored.events[changed.eventId].material.metrics.find((entry) => entry.key === "marketplaceCompleted").value, 16);
    assert.equal(stored.events[changed.eventId].material.marketWideTraffic, undefined);
    const corrected = await restarted.correct({
      subscriptionId: "moltjobs-maintained",
      correctsEvidenceId: changed.evidenceId,
      document: live,
    });
    assert.equal(corrected.outcome, "content_changed");
    const after = await restarted.read();
    assert.equal(after.events[corrected.eventId].correctsEvidenceId, changed.evidenceId);
    assert.equal(after.events[corrected.eventId].capture, "injected");
    assert.equal(after.events[changed.eventId].material.metrics.find((entry) => entry.key === "marketplaceCompleted").value, 16);
    await restarted.cancel("moltjobs-maintained");
    const refused = await (await open()).observe({ subscriptionId: "moltjobs-maintained", document: seeded });
    assert.equal(refused.outcome, "cancelled");
    const finalState = await (await open()).read();
    assert.equal(Object.keys(finalState.events).length, 2);
  } finally {
    await receiver.close();
    await dir.cleanup();
  }
});

test("a failed public read is source failure and not a zero row", async () => {
  const reading = await readMaintainedProjection({
    capture: "injected",
    now: () => NOW,
    fetchImpl: async () => ({
      status: 503,
      headers: { get() { return null; } },
      async text() { return "unavailable"; },
    }),
  });
  assert.equal(reading.capture, "injected");
  assert.equal(reading.document, null);
  assert.equal(reading.publicSourceChanged, false);
  assert.equal(reading.marketWideTraffic, null);
  assert.equal(reading.crossSourceSum.total, null);
  const dir = await tempDir("change-monitor-fetch-fail-");
  try {
    const monitor = await subscribedMonitor(dir.file);
    const observed = await monitor.observe({
      subscriptionId: "moltjobs-maintained",
      document: {
        capture: reading.capture,
        integration: "maintained",
        status: "source_failure",
        failureCode: reading.failureCode,
        reason: reading.reason,
        fetch: reading.fetch,
        projection: null,
      },
    });
    assert.equal(observed.evidenceClass, "source_failure");
    const evidence = (await monitor.read()).evidence[observed.evidenceId];
    assert.equal(evidence.material, null);
    assert.equal(JSON.stringify(evidence).includes("jobCount"), false);
  } finally {
    await dir.cleanup();
  }
});

test("fixture capture stays distinct and the vendored tree has no observatory page", async () => {
  const fixture = JSON.parse(await readFile(path.join(packageRoot, "examples/unavailable-not-zero.json"), "utf8"));
  assert.equal(fixture.capture, "fixture");
  await assert.rejects(readFile(path.join(packageRoot, "vendor/s12-observatory/page.js"), "utf8"));
});

test("cold install fetches the public snapshot, seeds one change, restarts, corrects, and cancels", { timeout: 180000 }, async () => {
  const dir = await tempDir("change-monitor-cold-install-");
  try {
    const { spawn } = await import("node:child_process");
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        path.join(packageRoot, "examples/cold-install.mjs"),
        "--dest",
        dir.dir,
      ], { cwd: packageRoot });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.publicSourceChanged, false);
    assert.equal(report.captures.includes("seeded"), true);
    assert.equal(report.captures.includes("live"), true);
    assert.equal(report.usefulEvents >= 2, true);
    const journey = JSON.parse(await readFile(path.join(dir.dir, "JOURNEY.json"), "utf8"));
    assert.equal(journey.seededEventId, report.seededEventId);
  } finally {
    await dir.cleanup();
  }
});
