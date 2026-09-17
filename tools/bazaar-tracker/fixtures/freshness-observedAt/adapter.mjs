/**
 * Readback-only freshness adapter: age comes from bazaar-observation.observedAt.
 * quality.lastCalledAt / lastUpdated are not clocks and not a removal signal.
 * Never writes observations.json, never calls CDP, never runs tracker --live.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CDP_DISCOVERY_SOURCE,
  DEFAULT_DATA_DIR,
  OBSERVATION_SCHEMA,
  editSnapshot,
  readChangelog,
  readObservation,
  readSnapshot,
  readbackReport,
} from "../../lib.mjs";

export const SCHEMA = "samedaydesk.bazaar-freshness-observedAt.v1";
export const COMMITTED_OBSERVED_AT = "2026-09-03T09:54:04.798Z";
export const DEFAULT_CLOCK = "2026-09-17T11:45:00.000Z";
export const DEFAULT_MAX_AGE_MS = 86_400_000;
export const COMMITTED_AGE_MS =
  Date.parse(DEFAULT_CLOCK) - Date.parse(COMMITTED_OBSERVED_AT);

export const FORBIDDEN_INVENTED = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
]);

export const COMMITTED_SDS_ROUTES = Object.freeze([
  "https://agents.samedaydesk.com/deep-audit",
  "https://agents.samedaydesk.com/defi/morpho-position",
  "https://agents.samedaydesk.com/enrich",
  "https://agents.samedaydesk.com/extract",
  "https://agents.samedaydesk.com/read",
  "https://agents.samedaydesk.com/scan",
  "https://agents.samedaydesk.com/schemaforge",
  "https://agents.samedaydesk.com/wallet-enrich",
]);

export const REFUSED_FLAGS = Object.freeze(["--live", "--cdp", "--poll", "--refresh"]);

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = here;
export const CASES_DIR = join(here, "cases");
export const TRACKER_CLI = join(here, "../../cli.mjs");
export const QUALITY_SEARCH_FIXTURE = join(here, "cdp/search-quality-not-a-clock.json");

const LAST_CALLED_CLOCK_NAMES = new Set([
  "lastCalledAt",
  "quality.lastCalledAt",
  "quality",
  "lastUpdated",
  "l30DaysTotalCalls",
  "l30DaysUniquePayers",
]);

export function typedFreshnessView({ latestTs, latestMs, generatedAtMs, maxAgeMs }) {
  if (latestTs === null || latestMs === null || !Number.isFinite(latestMs) || !Number.isFinite(generatedAtMs)) {
    return {
      latestObservationAt: null,
      ageMs: 0,
      maxAgeMs,
      status: "no_observations",
    };
  }
  const ageMs = Math.max(0, generatedAtMs - latestMs);
  return {
    latestObservationAt: latestTs,
    ageMs,
    maxAgeMs,
    status: ageMs <= maxAgeMs ? "fresh" : "stale",
  };
}

export function parseIsoMs(value) {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function freshnessFromObservation(observation, { clock = DEFAULT_CLOCK, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const observedAt = observation?.observedAt ?? null;
  const latestMs = parseIsoMs(observedAt);
  const generatedAtMs = parseIsoMs(clock);
  const latestTs = latestMs === null ? null : new Date(latestMs).toISOString();
  return typedFreshnessView({
    latestTs,
    latestMs,
    generatedAtMs,
    maxAgeMs,
  });
}

export function sdsSeller(observation) {
  return observation?.sources?.[CDP_DISCOVERY_SOURCE]?.sellers?.samedaydesk ?? null;
}

export function sdsRoutes(observation) {
  return Object.keys(sdsSeller(observation)?.routes ?? {}).sort();
}

export function sdsRowCount(observation) {
  const seller = sdsSeller(observation);
  if (!seller) return 0;
  return seller.rowCount ?? Object.keys(seller.routes ?? {}).length;
}

export function claimsFromObservation() {
  return {
    lastCalledAtIsRemovalClock: false,
    catalogAbsenceIsDemand: false,
    completeCensus: false,
    qualityUsedAsClock: false,
    lastUpdatedUsedAsClock: false,
  };
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function inventedHits(doc) {
  const blob = JSON.stringify(doc);
  const named = asList(doc.receiptFields).map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
  const hits = new Set();
  for (const name of FORBIDDEN_INVENTED) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`);
    if (re.test(blob) || named.includes(name)) hits.add(name);
  }
  return [...hits];
}

export function isSeededCase(doc, path = "") {
  if (doc?.seeded === true) return true;
  if (/^seeded-/i.test(basename(path))) return true;
  if (/SEEDING FAILURE/i.test(String(doc?.note || ""))) return true;
  return false;
}

function freshnessClockOf(doc) {
  return doc?.freshnessClock ?? doc?.claim?.freshnessClock ?? "observedAt";
}

function usesLastCalledAtAsClock(doc) {
  const clock = freshnessClockOf(doc);
  if (LAST_CALLED_CLOCK_NAMES.has(clock)) return true;
  const claim = doc?.claim && typeof doc.claim === "object" ? doc.claim : {};
  if (claim.lastCalledAtIsRemovalClock === true) return true;
  if (claim.removeWhenLastCalledAtStale === true) return true;
  if (claim.useQualityAsRemovalClock === true) return true;
  if (claim.dropWhenLastCalledAtOlderThanMs != null) return true;
  if (asList(claim.dropRoutesBecauseLastCalledAt).length > 0) return true;
  if (asList(doc.dropRoutesBecauseLastCalledAt).length > 0) return true;
  if (doc.expect?.lastCalledAtIsRemovalClock === true) return true;
  if (doc.expect?.status === "removed") return true;
  return false;
}

function treatsAbsenceAsDemand(doc) {
  const claim = doc?.claim && typeof doc.claim === "object" ? doc.claim : {};
  return claim.treatAbsenceAsDemand === true || claim.absenceIsDemand === true;
}

function inventsCompletenessWatermark(doc) {
  const claim = doc?.claim && typeof doc.claim === "object" ? doc.claim : {};
  if (claim.completeCensus === true) return true;
  if (claim.throughBlockCompleteness === "complete") return true;
  if (doc.inventWatermark === true) return true;
  return false;
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listCaseFiles(dir = CASES_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

export function resolveCaseObservation(doc, committed, casePath) {
  if (doc?.observation === "empty" || doc?.observation === "none") {
    return {
      schemaVersion: 3,
      schema: OBSERVATION_SCHEMA,
      observedAt: null,
      captureSource: "fixture",
      sources: {
        [CDP_DISCOVERY_SOURCE]: { endpoint: null, sellerCount: 0, routeCount: 0, sellers: {} },
      },
    };
  }
  if (doc?.observationPath) {
    const base = casePath ? dirname(casePath) : here;
    return loadJson(resolve(base, doc.observationPath));
  }
  if (doc?.observation && typeof doc.observation === "object" && !Array.isArray(doc.observation) && doc.observation !== "committed") {
    return doc.observation;
  }
  return committed;
}

export function evaluateCase(doc, observation, { clock = DEFAULT_CLOCK, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const reasons = [];
  const caseClock = doc.clock || clock;
  const caseMaxAge = doc.maxAgeMs ?? maxAgeMs;
  const freshness = freshnessFromObservation(observation, { clock: caseClock, maxAgeMs: caseMaxAge });
  const claims = claimsFromObservation();
  const invented = inventedHits(doc);
  const clockName = freshnessClockOf(doc);

  if (clockName !== "observedAt") {
    reasons.push("freshness_clock_must_be_observedAt");
  }
  if (usesLastCalledAtAsClock(doc)) {
    reasons.push("lastCalledAt_is_not_a_removal_clock");
  }
  if (treatsAbsenceAsDemand(doc)) {
    reasons.push("catalog_absence_is_not_demand");
  }
  if (inventsCompletenessWatermark(doc)) {
    reasons.push("completeness_watermark_invented");
  }
  if (invented.length) {
    reasons.push(`invented_receipt_field_without_live_schema:${invented.join(",")}`);
  }

  const expect = doc.expect && typeof doc.expect === "object" ? doc.expect : null;
  if (expect && reasons.length === 0) {
    if (expect.status && expect.status !== freshness.status) {
      reasons.push(`status_mismatch:expected_${expect.status}_got_${freshness.status}`);
    }
    if (Number.isFinite(expect.ageMs) && expect.ageMs !== freshness.ageMs) {
      reasons.push(`ageMs_mismatch:expected_${expect.ageMs}_got_${freshness.ageMs}`);
    }
    if (expect.latestObservationAt !== undefined && expect.latestObservationAt !== freshness.latestObservationAt) {
      reasons.push("latestObservationAt_mismatch");
    }
    if (Number.isFinite(expect.sdsRowCount) && expect.sdsRowCount !== sdsRowCount(observation)) {
      reasons.push(`sdsRowCount_mismatch:expected_${expect.sdsRowCount}_got_${sdsRowCount(observation)}`);
    }
    if (expect.lastCalledAtIsRemovalClock === true) {
      reasons.push("lastCalledAt_is_not_a_removal_clock");
    }
  }

  return {
    id: doc.id || null,
    ok: reasons.length === 0,
    reasons,
    invented,
    freshnessClock: clockName,
    clock: caseClock,
    captureSource: observation?.captureSource ?? null,
    schema: observation?.schema ?? null,
    sdsRowCount: sdsRowCount(observation),
    sdsRoutes: sdsRoutes(observation),
    freshness,
    claims,
  };
}

export function evaluatePack({ observation, cases, clock = DEFAULT_CLOCK, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const reports = [];
  let failed = false;
  let seededRejected = null;

  for (const item of cases) {
    const path = item.path;
    const doc = item.doc;
    const resolved = resolveCaseObservation(doc, observation, path);
    const report = evaluateCase(doc, resolved, {
      clock: doc.clock || clock,
      maxAgeMs: doc.maxAgeMs ?? maxAgeMs,
    });
    report.path = relative(here, path) || path;
    const seeded = isSeededCase(doc, path);
    report.seeded = seeded;
    if (seeded) {
      if (report.ok) {
        report.reasons = [...report.reasons, "seeded_failure_was_accepted"];
        report.ok = false;
        seededRejected = false;
        failed = true;
      } else if (seededRejected !== false) {
        seededRejected = true;
      }
    } else if (!report.ok) {
      failed = true;
    }
    reports.push(report);
  }

  return {
    schemaVersion: SCHEMA,
    ok: !failed,
    seededRejected,
    clock,
    maxAgeMs,
    freshnessClock: "observedAt",
    reports,
  };
}

export function loadCommittedObservation(dataDir = DEFAULT_DATA_DIR) {
  return readObservation(dataDir);
}

export function spawnReadback(dataDir = DEFAULT_DATA_DIR, { cli = TRACKER_CLI } = {}) {
  const result = spawnSync(process.execPath, [cli, "--readback", "--pretty", "--data-dir", dataDir], {
    encoding: "utf8",
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout || "null");
  } catch {
    report = null;
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    report,
  };
}

function changelogTouchesQuality(changes) {
  return changes.some((row) => {
    const field = String(row.field || "");
    return (
      field === "lastCalledAt"
      || field.startsWith("quality")
      || field === "lastUpdated"
      || field.startsWith("lastUpdated")
    );
  });
}

export function proveLastCalledAtIsNotRemovalClock({
  cli = TRACKER_CLI,
  fixturePath = QUALITY_SEARCH_FIXTURE,
} = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "bazaar-freshness-observedAt-"));
  try {
    const first = spawnSync(
      process.execPath,
      [cli, "--fixture", fixturePath, "--data-dir", dataDir, "--observed-at", COMMITTED_OBSERVED_AT],
      { encoding: "utf8" },
    );
    if (first.status !== 0) {
      return {
        ok: false,
        error: first.stderr || first.stdout,
        status: first.status,
      };
    }
    const firstReport = JSON.parse(first.stdout);
    const snapshot = readSnapshot(firstReport.snapshotPath);
    const firstRoutes = snapshot.rows.map((row) => row.resource).sort();
    const edited = editSnapshot(snapshot, (copy) => {
      for (const row of copy.rows) {
        const quality = row.quality && typeof row.quality === "object" ? { ...row.quality } : {};
        quality.lastCalledAt = "2026-08-01T00:00:00.000Z";
        quality.l30DaysTotalCalls = 0;
        quality.l30DaysUniquePayers = 0;
        row.quality = quality;
        row.lastUpdated = "2026-08-01T00:00:00.000Z";
      }
    });
    const editedPath = join(dataDir, "lastCalledAt-only-edit.json");
    writeFileSync(editedPath, `${JSON.stringify(edited, null, 2)}\n`);

    const second = spawnSync(
      process.execPath,
      [cli, "--from", editedPath, "--data-dir", dataDir, "--observed-at", DEFAULT_CLOCK],
      { encoding: "utf8" },
    );
    if (second.status !== 0) {
      return {
        ok: false,
        error: second.stderr || second.stdout,
        status: second.status,
      };
    }
    const secondReport = JSON.parse(second.stdout);
    const log = readChangelog(dataDir);
    const resourceDrops = (secondReport.changes || []).filter((row) => row.field === "resource" && row.after === null);
    const qualityInLog = changelogTouchesQuality(log);
    const secondSnapshot = readSnapshot(secondReport.snapshotPath);
    const secondRoutes = secondSnapshot.rows.map((row) => row.resource).sort();
    const keptExtractBatch = secondRoutes.includes("https://agents.samedaydesk.com/extract/batch");
    const ok =
      secondReport.changeCount === 0
      && log.length === 0
      && !qualityInLog
      && resourceDrops.length === 0
      && firstRoutes.join("\n") === secondRoutes.join("\n")
      && keptExtractBatch;

    return {
      ok,
      live: false,
      changeCount: secondReport.changeCount,
      changelogLength: log.length,
      lastCalledAtInChangelog: qualityInLog,
      routesDropped: resourceDrops.map((row) => row.before),
      firstRowCount: firstReport.rowCount,
      secondRowCount: secondReport.rowCount,
      keptExtractBatch,
      firstRoutes,
      secondRoutes,
      observedAtFirst: COMMITTED_OBSERVED_AT,
      observedAtSecond: DEFAULT_CLOCK,
    };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

export function committedFreshnessReport(observation, { clock = DEFAULT_CLOCK, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const freshness = freshnessFromObservation(observation, { clock, maxAgeMs });
  const routes = sdsRoutes(observation);
  const reasons = [];
  if (observation?.schema !== OBSERVATION_SCHEMA) {
    reasons.push("unexpected_observation_schema");
  }
  if (observation?.observedAt !== COMMITTED_OBSERVED_AT) {
    reasons.push("committed_observedAt_mismatch");
  }
  if (freshness.status !== "stale") {
    reasons.push(`expected_stale_at_${clock}`);
  }
  if (freshness.ageMs !== COMMITTED_AGE_MS) {
    reasons.push("committed_ageMs_mismatch");
  }
  if (sdsRowCount(observation) !== 8) {
    reasons.push("sds_rowCount_must_be_8");
  }
  if (routes.join("\n") !== COMMITTED_SDS_ROUTES.join("\n")) {
    reasons.push("sds_routes_mismatch");
  }
  if (routes.includes("https://agents.samedaydesk.com/extract/batch")) {
    reasons.push("committed_observation_unexpectedly_has_extract_batch");
  }
  return {
    ok: reasons.length === 0,
    reasons,
    freshnessClock: "observedAt",
    clock,
    captureSource: observation?.captureSource ?? null,
    schema: observation?.schema ?? null,
    sdsRowCount: sdsRowCount(observation),
    sdsRoutes: routes,
    freshness,
    claims: claimsFromObservation(),
  };
}

export function runFreshnessPack({
  dataDir = DEFAULT_DATA_DIR,
  clock = DEFAULT_CLOCK,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  casePath = null,
  seededPath = null,
  proveVolatile = true,
} = {}) {
  const readback = spawnReadback(dataDir);
  const observation = loadCommittedObservation(dataDir);
  const committed = committedFreshnessReport(observation, { clock, maxAgeMs });

  let caseFiles = [];
  if (casePath) caseFiles = [resolve(casePath)];
  else if (seededPath) caseFiles = [resolve(seededPath)];
  else caseFiles = listCaseFiles();

  const cases = caseFiles.map((path) => ({ path, doc: loadJson(path) }));
  if (seededPath) {
    for (const item of cases) item.doc = { ...item.doc, seeded: true };
  }

  const pack = evaluatePack({ observation, cases, clock, maxAgeMs });
  const volatile = proveVolatile ? proveLastCalledAtIsNotRemovalClock() : null;

  let ok = readback.status === 0 && Boolean(readback.report?.ok) && committed.ok && pack.ok;
  if (volatile) ok = ok && volatile.ok;
  if (seededPath && pack.seededRejected !== true) ok = false;

  const sds = (readback.report?.sellers || []).find((seller) => seller.id === "samedaydesk") || null;

  return {
    schemaVersion: SCHEMA,
    ok,
    live: false,
    cron: false,
    daemon: false,
    freshnessClock: "observedAt",
    clock,
    maxAgeMs,
    committedObservedAt: COMMITTED_OBSERVED_AT,
    committedAgeMs: COMMITTED_AGE_MS,
    readback: {
      status: readback.status,
      ok: Boolean(readback.report?.ok),
      observedAt: readback.report?.observedAt ?? null,
      schema: readback.report?.schema ?? null,
      routeCount: readback.report?.routeCount ?? null,
      sellerCount: readback.report?.sellerCount ?? null,
      sdsRowCount: sds?.rowCount ?? null,
      cron: readback.report?.cron ?? null,
      daemon: readback.report?.daemon ?? null,
    },
    committed,
    pack,
    volatileProof: volatile,
    claims: claimsFromObservation(),
  };
}
