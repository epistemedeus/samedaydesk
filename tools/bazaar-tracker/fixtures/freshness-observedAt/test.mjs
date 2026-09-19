import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import {
  COMMITTED_AGE_MS,
  COMMITTED_OBSERVED_AT,
  COMMITTED_SDS_ROUTES,
  DEFAULT_CLOCK,
  DEFAULT_MAX_AGE_MS,
  TRACKER_CLI,
  QUALITY_SEARCH_FIXTURE,
  committedFreshnessReport,
  evaluateCase,
  freshnessFromObservation,
  isSeededCase,
  listCaseFiles,
  loadCommittedObservation,
  loadJson,
  proveLastCalledAtIsNotRemovalClock,
  resolveCasePath,
  runFreshnessPack,
  sdsRowCount,
  typedFreshnessView,
} from "./adapter.mjs";
import {
  DEFAULT_DATA_DIR,
  createFixtureFetch,
  editSnapshot,
  loadCohort,
  readChangelog,
  readSnapshot,
  runTracker,
} from "../../lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const runCli = join(here, "run.mjs");
const seededLastCalledAt = join(here, "cases/seeded-lastCalledAt-as-removal.json");
const seededInvented = join(here, "cases/seeded-invented-field.json");
const seededAbsence = join(here, "cases/seeded-treat-absence-as-demand.json");
const seededLastUpdated = join(here, "cases/seeded-lastUpdated-as-clock.json");
const seededWatermark = join(here, "cases/seeded-completeness-watermark.json");
const lastCalledAtNotClock = join(here, "cases/lastCalledAt-not-observedAt.json");

function spawnRun(args) {
  return spawnSync(process.execPath, [runCli, ...args], { encoding: "utf8" });
}

test("typedFreshnessView matches commerce-events fresh|stale|no_observations", () => {
  assert.deepEqual(
    typedFreshnessView({ latestTs: null, latestMs: null, generatedAtMs: Date.parse(DEFAULT_CLOCK), maxAgeMs: 10 }),
    { latestObservationAt: null, ageMs: 0, maxAgeMs: 10, status: "no_observations" },
  );
  const near = Date.parse("2026-09-03T10:00:00.000Z");
  const captured = Date.parse(COMMITTED_OBSERVED_AT);
  assert.equal(
    typedFreshnessView({
      latestTs: COMMITTED_OBSERVED_AT,
      latestMs: captured,
      generatedAtMs: near,
      maxAgeMs: 900_000,
    }).status,
    "fresh",
  );
  assert.equal(
    typedFreshnessView({
      latestTs: COMMITTED_OBSERVED_AT,
      latestMs: captured,
      generatedAtMs: Date.parse(DEFAULT_CLOCK),
      maxAgeMs: DEFAULT_MAX_AGE_MS,
    }).status,
    "stale",
  );
});

test("committed observation is stale at 2026-09-17 from observedAt only", () => {
  const observation = loadCommittedObservation();
  const view = freshnessFromObservation(observation, { clock: DEFAULT_CLOCK, maxAgeMs: DEFAULT_MAX_AGE_MS });
  assert.equal(observation.observedAt, COMMITTED_OBSERVED_AT);
  assert.equal(view.latestObservationAt, COMMITTED_OBSERVED_AT);
  assert.equal(view.ageMs, COMMITTED_AGE_MS);
  assert.equal(view.ageMs, 1216255202);
  assert.equal(view.status, "stale");
  assert.equal(sdsRowCount(observation), 8);
  assert.deepEqual(
    Object.keys(observation.sources["cdp-discovery"].sellers.samedaydesk.routes).sort(),
    [...COMMITTED_SDS_ROUTES],
  );
  const report = committedFreshnessReport(observation);
  assert.equal(report.ok, true, report.reasons.join(","));
  assert.equal(report.claims.lastCalledAtIsRemovalClock, false);
  assert.equal(report.freshnessClock, "observedAt");
});

test("seeded lastCalledAt-as-removal is rejected", () => {
  const doc = loadJson(seededLastCalledAt);
  assert.equal(isSeededCase(doc, seededLastCalledAt), true);
  const report = evaluateCase(doc, loadCommittedObservation());
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("lastCalledAt_is_not_a_removal_clock"));
  assert.ok(report.reasons.includes("freshness_clock_must_be_observedAt"));
  assert.equal(report.claims.lastCalledAtIsRemovalClock, false);
});

test("seeded invented loyaltyPoints / uniqueVisitors is rejected", () => {
  const report = evaluateCase(loadJson(seededInvented), loadCommittedObservation());
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => reason.startsWith("invented_receipt_field_without_live_schema:")));
  assert.ok(report.invented.includes("loyaltyPoints"));
  assert.ok(report.invented.includes("uniqueVisitors"));
});

test("seeded treat-absence-as-demand is rejected", () => {
  const report = evaluateCase(loadJson(seededAbsence), loadCommittedObservation());
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("catalog_absence_is_not_demand"));
  assert.equal(
    loadCommittedObservation().sources["cdp-discovery"].sellers.samedaydesk.routes["https://agents.samedaydesk.com/extract/batch"],
    undefined,
  );
});

test("CLI default cold run is stale and keeps lastCalledAt off the changelog", () => {
  const result = spawnRun(["--pretty"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.live, false);
  assert.equal(report.cron, false);
  assert.equal(report.daemon, false);
  assert.equal(report.freshnessClock, "observedAt");
  assert.equal(report.committed.freshness.status, "stale");
  assert.equal(report.committed.freshness.ageMs, 1216255202);
  assert.equal(report.committed.claims.lastCalledAtIsRemovalClock, false);
  assert.equal(report.readback.sdsRowCount, 8);
  assert.equal(report.readback.observedAt, COMMITTED_OBSERVED_AT);
  assert.equal(report.volatileProof.ok, true);
  assert.equal(report.volatileProof.changeCount, 0);
  assert.equal(report.volatileProof.lastCalledAtInChangelog, false);
  assert.equal(report.volatileProof.keptExtractBatch, true);
  assert.deepEqual(report.volatileProof.routesDropped, []);
  assert.equal(report.pack.seededRejected, true);
});

test("CLI --case seeded lastCalledAt exits 1", () => {
  const result = spawnRun(["--case", seededLastCalledAt, "--pretty"]);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("lastCalledAt_is_not_a_removal_clock"));
});

test("CLI --seeded lastCalledAt exits 0 with seededRejected true", () => {
  const result = spawnRun(["--seeded", seededLastCalledAt, "--pretty"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.seededRejected, true);
  assert.equal(report.live, false);
  assert.ok(report.reasons.includes("lastCalledAt_is_not_a_removal_clock"));
});

test("CLI refuses --live", () => {
  const result = spawnRun(["--live"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refused/);
  assert.match(result.stderr, /--live/);
});

test("tracker --from lastCalledAt-only edit does not drop extract/batch", () => {
  const proof = proveLastCalledAtIsNotRemovalClock();
  assert.equal(proof.ok, true, JSON.stringify(proof, null, 2));
  assert.equal(proof.changeCount, 0);
  assert.equal(proof.keptExtractBatch, true);
});

test("tracker --from description edit still changelogs content, not quality", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "bazaar-freshness-control-"));
  try {
    const cohort = loadCohort();
    const fetchImpl = createFixtureFetch(JSON.parse(readFileSync(QUALITY_SEARCH_FIXTURE, "utf8")));
    const first = await runTracker({
      cohort,
      dataDir,
      fetchImpl,
      observedAt: COMMITTED_OBSERVED_AT,
      source: "fixture",
    });
    assert.equal(first.ok, true);
    const written = readSnapshot(first.snapshotPath);
    const edited = editSnapshot(written, (copy) => {
      copy.rows[0].description = "content edit control";
      copy.rows[0].quality = { lastCalledAt: "1999-01-01T00:00:00.000Z", l30DaysTotalCalls: 0 };
    });
    const second = await runTracker({
      cohort,
      dataDir,
      incomingSnapshot: edited,
      observedAt: DEFAULT_CLOCK,
      source: "synthetic",
    });
    const fields = second.changes.map((row) => row.field);
    assert.ok(fields.includes("description"));
    assert.equal(fields.some((field) => field.includes("lastCalledAt") || field.startsWith("quality")), false);
    assert.equal(second.changes.some((row) => row.field === "resource" && row.after === null), false);
    const log = readChangelog(dataDir);
    assert.equal(log.some((row) => String(row.field).includes("lastCalledAt")), false);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("tracker CLI --readback still reports committed observedAt", () => {
  const result = spawnSync(
    process.execPath,
    [TRACKER_CLI, "--readback", "--pretty", "--data-dir", DEFAULT_DATA_DIR],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.observedAt, COMMITTED_OBSERVED_AT);
  assert.equal(report.cron, false);
  assert.equal(report.daemon, false);
});

test("runFreshnessPack does not greenwash a seeded lastCalledAt accept", () => {
  const pack = runFreshnessPack({ proveVolatile: false });
  assert.equal(pack.ok, true);
  assert.equal(pack.pack.seededRejected, true);
  const lastCalled = pack.pack.reports.find((row) => row.id === "seeded-lastCalledAt-as-removal");
  assert.equal(lastCalled.ok, false);
  assert.equal(lastCalled.seeded, true);
});

test("invalid clock keeps latestObservationAt and fails closed", () => {
  const view = freshnessFromObservation(
    { observedAt: COMMITTED_OBSERVED_AT },
    { clock: "not-a-date", maxAgeMs: DEFAULT_MAX_AGE_MS },
  );
  assert.equal(view.latestObservationAt, COMMITTED_OBSERVED_AT);
  assert.notEqual(view.status, "no_observations");
  const report = committedFreshnessReport(loadCommittedObservation(), { clock: "not-a-date" });
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("invalid_clock"));
  assert.equal(report.freshness.latestObservationAt, COMMITTED_OBSERVED_AT);
});

test("quality.lastCalledAt without observedAt is no_observations", () => {
  const doc = loadJson(lastCalledAtNotClock);
  const observation = doc.observation;
  const view = freshnessFromObservation(observation, { clock: DEFAULT_CLOCK, maxAgeMs: DEFAULT_MAX_AGE_MS });
  assert.equal(view.status, "no_observations");
  assert.equal(view.latestObservationAt, null);
  const report = evaluateCase(doc, observation);
  assert.equal(report.ok, true, report.reasons.join(","));
  assert.equal(report.claims.lastCalledAtIsRemovalClock, false);
});

test("seeded lastUpdated-as-clock is rejected", () => {
  const report = evaluateCase(loadJson(seededLastUpdated), loadCommittedObservation());
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("lastUpdated_is_not_a_removal_clock"));
});

test("seeded completeness watermark is rejected", () => {
  const report = evaluateCase(loadJson(seededWatermark), loadCommittedObservation());
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("completeness_watermark_invented"));
});

test("CLI --case relative cases/ path from repo root exits 1 with JSON", () => {
  const result = spawnSync(
    process.execPath,
    [runCli, "--case", "cases/seeded-lastCalledAt-as-removal.json", "--pretty"],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.stderr.includes("ENOENT"), false, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("lastCalledAt_is_not_a_removal_clock"));
});

test("CLI --seeded relative cases/ path from repo root exits 0", () => {
  const result = spawnSync(
    process.execPath,
    [runCli, "--seeded", "cases/seeded-lastCalledAt-as-removal.json", "--pretty"],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.seededRejected, true);
});

test("CLI --case lastUpdated exits 1", () => {
  const result = spawnRun(["--case", seededLastUpdated, "--pretty"]);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes("lastUpdated_is_not_a_removal_clock"));
});

test("CLI --case seeded file that would otherwise pass is not accepted", () => {
  const dir = mkdtempSync(join(tmpdir(), "bazaar-freshness-seeded-ok-"));
  try {
    const path = join(dir, "seeded-harmless.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        id: "seeded-harmless",
        seeded: true,
        note: "SEEDING FAILURE: empty claim must not be accepted",
        freshnessClock: "observedAt",
        clock: DEFAULT_CLOCK,
        maxAgeMs: DEFAULT_MAX_AGE_MS,
        expect: {
          status: "stale",
          latestObservationAt: COMMITTED_OBSERVED_AT,
          ageMs: COMMITTED_AGE_MS,
        },
      })}\n`,
    );
    const result = spawnRun(["--case", path, "--pretty"]);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.ok(report.reasons.includes("seeded_failure_was_accepted"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("default pack without seeded files is not ok", () => {
  const good = listCaseFiles().filter((path) => !isSeededCase(loadJson(path), path));
  assert.ok(good.length > 0);
  const pack = runFreshnessPack({ proveVolatile: false, caseFiles: good });
  assert.equal(pack.pack.seededRejected, null);
  assert.equal(pack.ok, false);
});

test("resolveCasePath finds fixture-relative cases/ from repo root", () => {
  assert.equal(resolveCasePath(seededLastCalledAt), seededLastCalledAt);
  const resolved = resolveCasePath("cases/seeded-lastCalledAt-as-removal.json");
  assert.equal(resolved, seededLastCalledAt);
});
