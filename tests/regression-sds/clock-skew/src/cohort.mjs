import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_CLASSIFY,
  ENGINE_MARKET,
  ENGINE_MOLTJOBS,
  ENGINE_X402STATS,
  FIXTURES,
  SEEDED_FAILURE_IDS,
  fixture,
  readJson,
  seededFixtureNames,
} from "./paths.mjs";
import {
  FUTURE_SKEW_MS,
  PINNED_FETCHED_AT,
  PINNED_NOW_MS,
  SOURCE_TIME_STALE_MS,
  STALE_PROVIDER_MS,
  classifyPair,
  metricValue,
  runAdapters,
} from "./engine.mjs";

export const SCHEMA = "sds.regression.clock-skew.v1";

export const REQUIRED_CASE_IDS = Object.freeze([
  "fresh-ok",
  "within-skew",
  "future-skew-boundary",
  "future-skew",
  "future-skew-day",
  "stale-boundary-ok",
  "stale-observatory",
  "stale-market-obs-only",
  "stale-market-obs-boundary",
  "stale-market-obs-just-stale",
  "missing-timestamp",
  "invalid-timestamp",
  "adapter-future-skew",
  "adapter-stale-keeps-metrics",
  "adapter-within-skew",
]);

const FUTURE_SKEW_IDS = Object.freeze([
  "future-skew",
  "future-skew-day",
  "adapter-future-skew",
]);
const WITHIN_SKEW_IDS = Object.freeze([
  "within-skew",
  "future-skew-boundary",
  "adapter-within-skew",
]);
const STALE_ADAPTER_IDS = Object.freeze(["adapter-stale-keeps-metrics"]);

export function loadManifest() {
  return readJson(join(FIXTURES, "manifest.json"));
}

function clocksDistinct(fetchedAt, providerTimestamp, observatoryTimestamp) {
  if (observatoryTimestamp == null) return true;
  if (providerTimestamp != null && providerTimestamp === fetchedAt) return false;
  return observatoryTimestamp !== fetchedAt;
}

function checkExpect(actual, expected, errors, prefix) {
  if (expected === undefined) return;
  if (actual !== expected) {
    errors.push(`${prefix}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function runCase(entry) {
  const loaded = entry.file ? fixture(entry.file) : {};
  if (loaded.id && entry.id && loaded.id !== entry.id) {
    return {
      id: entry.id,
      ok: false,
      kind: entry.kind || loaded.kind || null,
      file: entry.file || null,
      fetchedAt: loaded.fetchedAt ?? null,
      providerTimestamp: loaded.providerTimestamp ?? null,
      observatoryState: null,
      observatoryTimestamp: null,
      marketObsState: null,
      clocksDistinct: true,
      moltjobs: null,
      x402stats: null,
      errors: [`id mismatch: fixture ${JSON.stringify(loaded.id)} vs manifest ${JSON.stringify(entry.id)}`],
    };
  }
  entry = { ...loaded, ...entry };
  const fetchedAt = entry.fetchedAt;
  const raw = Object.prototype.hasOwnProperty.call(entry, "providerTimestamp")
    ? entry.providerTimestamp
    : null;
  const nowMs = entry.nowMs ?? PINNED_NOW_MS;
  const pair = classifyPair(raw, fetchedAt, nowMs);
  const errors = [];
  const expect = entry.expect || {};

  checkExpect(pair.observatory.state, expect.observatoryState, errors, "observatoryState");
  checkExpect(pair.marketObsState, expect.marketObsState, errors, "marketObsState");

  if (expect.clocksDistinct === true && !clocksDistinct(fetchedAt, raw, pair.observatory.timestamp)) {
    errors.push("clocksDistinct: observer fetchedAt was copied onto the provider clock");
  }
  if (expect.observatoryState === "invalid" && pair.observatory.state === "ok") {
    errors.push("future skew must not classify as ok");
  }
  if (expect.observatoryState === "stale" && pair.observatory.state === "ok") {
    errors.push("stale provider clock must not classify as ok");
  }

  let adapters = null;
  if (entry.kind === "adapter") {
    adapters = runAdapters(fetchedAt, raw, nowMs);
    const molt = expect.moltjobs || {};
    const x402 = expect.x402stats || {};
    checkExpect(
      adapters.moltjobs.providerTimestampState,
      molt.providerTimestampState ?? expect.observatoryState,
      errors,
      "moltjobs.providerTimestampState",
    );
    checkExpect(
      adapters.x402stats.providerTimestampState,
      x402.providerTimestampState ?? expect.observatoryState,
      errors,
      "x402stats.providerTimestampState",
    );
    if (x402.availability) {
      checkExpect(adapters.x402stats.availability, x402.availability, errors, "x402stats.availability");
    }
    if (molt.availability) {
      checkExpect(adapters.moltjobs.availability, molt.availability, errors, "moltjobs.availability");
    }
    const jobCount = metricValue(adapters.moltjobs, "jobCount");
    const sellers = metricValue(adapters.x402stats, "sellers_30d");
    checkExpect(jobCount, molt.jobCount ?? 12, errors, "moltjobs.jobCount");
    checkExpect(sellers, x402.sellers_30d ?? 47303, errors, "x402stats.sellers_30d");
    const clockIsSkewed = pair.observatory.state === "stale" || pair.observatory.state === "invalid";
    if (expect.staleNotZeroed === true || (expect.staleNotZeroed !== false && clockIsSkewed)) {
      if (jobCount === 0 || sellers === 0) {
        errors.push("stale/invalid clock must not rewrite metrics to zero");
      }
    }
    if (adapters.moltjobs.fetchedAt === adapters.moltjobs.providerTimestamp && adapters.moltjobs.providerTimestamp) {
      errors.push("moltjobs copied fetchedAt onto providerTimestamp");
    }
    if (adapters.x402stats.fetchedAt === adapters.x402stats.providerTimestamp && adapters.x402stats.providerTimestamp) {
      errors.push("x402stats copied fetchedAt onto providerTimestamp");
    }
  }

  return {
    id: entry.id,
    ok: errors.length === 0,
    kind: entry.kind,
    file: entry.file,
    fetchedAt,
    providerTimestamp: raw ?? null,
    observatoryState: pair.observatory.state,
    observatoryTimestamp: pair.observatory.timestamp,
    marketObsState: pair.marketObsState,
    clocksDistinct: clocksDistinct(fetchedAt, raw, pair.observatory.timestamp),
    moltjobs: adapters
      ? {
          providerTimestampState: adapters.moltjobs.providerTimestampState,
          availability: adapters.moltjobs.availability,
          jobCount: metricValue(adapters.moltjobs, "jobCount"),
          fetchedAt: adapters.moltjobs.fetchedAt,
          providerTimestamp: adapters.moltjobs.providerTimestamp,
        }
      : null,
    x402stats: adapters
      ? {
          providerTimestampState: adapters.x402stats.providerTimestampState,
          availability: adapters.x402stats.availability,
          sellers_30d: metricValue(adapters.x402stats, "sellers_30d"),
          fetchedAt: adapters.x402stats.fetchedAt,
          providerTimestamp: adapters.x402stats.providerTimestamp,
        }
      : null,
    errors,
  };
}

export function orphanFixtureFiles(manifest) {
  const listed = new Set((manifest.cases || []).map((entry) => entry.file));
  return readdirSync(FIXTURES).filter(
    (name) => name.endsWith(".json") && name !== "manifest.json" && !listed.has(name),
  );
}

function ageMs(item) {
  const fetched = Date.parse(item?.fetchedAt);
  const provider = Date.parse(item?.providerTimestamp);
  if (!Number.isFinite(fetched) || !Number.isFinite(provider)) return Number.NaN;
  return fetched - provider;
}

function leadMs(item) {
  const fetched = Date.parse(item?.fetchedAt);
  const provider = Date.parse(item?.providerTimestamp);
  if (!Number.isFinite(fetched) || !Number.isFinite(provider)) return Number.NaN;
  return provider - fetched;
}

export function evaluateInvariants(cases, manifest) {
  const list = cases || [];
  const ids = list.map((item) => item.id);
  const byId = Object.fromEntries(list.map((item) => [item.id, item]));
  const requiredCasesPresent = REQUIRED_CASE_IDS.every((id) => Boolean(byId[id]));
  const requiredCasesOk = REQUIRED_CASE_IDS.every((id) => byId[id]?.ok === true);
  const noDuplicateCaseIds = ids.length === new Set(ids).size;
  const windows = manifest && manifest.windows ? manifest.windows : {};
  const windowsMatchPublished =
    windows.observatoryFutureSkewMs === FUTURE_SKEW_MS
    && windows.observatoryStaleMs === STALE_PROVIDER_MS
    && windows.marketObsStaleMs === SOURCE_TIME_STALE_MS;
  const noOrphanFixtures = orphanFixtureFiles(manifest).length === 0;
  const seededNames = seededFixtureNames();
  const seededInventoryMatch =
    seededNames.length === SEEDED_FAILURE_IDS.length
    && SEEDED_FAILURE_IDS.every((id) => seededNames.includes(`${id}.json`));
  const pinnedFetchedAtMatch =
    manifest?.pinnedFetchedAt === PINNED_FETCHED_AT
    && list.length > 0
    && list.every((item) => item.fetchedAt === PINNED_FETCHED_AT);
  const futureSkewNotOk = FUTURE_SKEW_IDS.every(
    (id) => byId[id]?.ok === true && byId[id]?.observatoryState === "invalid",
  );
  const withinSkewOk = WITHIN_SKEW_IDS.every(
    (id) => byId[id]?.ok === true && byId[id]?.observatoryState === "ok",
  );
  const staleNotZeroed = STALE_ADAPTER_IDS.every(
    (id) =>
      byId[id]?.ok === true
      && byId[id]?.observatoryState === "stale"
      && byId[id]?.moltjobs?.jobCount === 12
      && byId[id]?.x402stats?.sellers_30d === 47303,
  );
  const clocksDistinct = list.length > 0 && list.every((item) => item.clocksDistinct === true);
  const marketObsBoundaryOk =
    byId["stale-market-obs-boundary"]?.ok === true
    && byId["stale-market-obs-boundary"]?.observatoryState === "ok"
    && byId["stale-market-obs-boundary"]?.marketObsState === "ok"
    && byId["stale-market-obs-just-stale"]?.ok === true
    && byId["stale-market-obs-just-stale"]?.observatoryState === "ok"
    && byId["stale-market-obs-just-stale"]?.marketObsState === "stale";
  const windowDeltasMatchPublished =
    leadMs(byId["future-skew-boundary"]) === FUTURE_SKEW_MS
    && leadMs(byId["future-skew"]) === FUTURE_SKEW_MS + 1000
    && ageMs(byId["stale-boundary-ok"]) === STALE_PROVIDER_MS
    && ageMs(byId["stale-observatory"]) === STALE_PROVIDER_MS + 1000
    && ageMs(byId["stale-market-obs-boundary"]) === SOURCE_TIME_STALE_MS
    && ageMs(byId["stale-market-obs-just-stale"]) === SOURCE_TIME_STALE_MS + 1000;
  const payment = false;
  const checkout = false;
  const publish = false;
  const neomorphicIo = false;
  const ok =
    requiredCasesPresent
    && requiredCasesOk
    && noDuplicateCaseIds
    && windowsMatchPublished
    && noOrphanFixtures
    && seededInventoryMatch
    && pinnedFetchedAtMatch
    && futureSkewNotOk
    && withinSkewOk
    && staleNotZeroed
    && clocksDistinct
    && marketObsBoundaryOk
    && windowDeltasMatchPublished
    && payment === false
    && checkout === false
    && publish === false
    && neomorphicIo === false;
  return {
    ok,
    requiredCasesPresent,
    requiredCasesOk,
    noDuplicateCaseIds,
    windowsMatchPublished,
    noOrphanFixtures,
    seededInventoryMatch,
    pinnedFetchedAtMatch,
    futureSkewNotOk,
    withinSkewOk,
    staleNotZeroed,
    clocksDistinct,
    marketObsBoundaryOk,
    windowDeltasMatchPublished,
    payment,
    checkout,
    publish,
    neomorphicIo,
  };
}

export function runColdCohort() {
  const manifest = loadManifest();
  const cases = manifest.cases.map((entry) => runCase(entry));
  const failed = cases.filter((item) => !item.ok);
  const invariants = evaluateInvariants(cases, manifest);
  return {
    schema: SCHEMA,
    ok: failed.length === 0 && invariants.ok === true,
    mode: "cold",
    engine: {
      classify: ENGINE_CLASSIFY,
      marketObs: ENGINE_MARKET,
      moltjobs: ENGINE_MOLTJOBS,
      x402stats: ENGINE_X402STATS,
    },
    caseCount: cases.length,
    failedCount: failed.length,
    cases,
    invariants,
  };
}
