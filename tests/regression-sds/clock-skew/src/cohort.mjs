import { join } from "node:path";
import {
  ENGINE_CLASSIFY,
  ENGINE_MARKET,
  ENGINE_MOLTJOBS,
  ENGINE_X402STATS,
  FIXTURES,
  fixture,
  readJson,
} from "./paths.mjs";
import {
  PINNED_NOW_MS,
  classifyPair,
  metricValue,
  runAdapters,
} from "./engine.mjs";

export const SCHEMA = "sds.regression.clock-skew.v1";

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
    if (expect.staleNotZeroed !== false) {
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

export function runColdCohort() {
  const manifest = loadManifest();
  const cases = manifest.cases.map((entry) => runCase(entry));
  const failed = cases.filter((item) => !item.ok);
  return {
    schema: SCHEMA,
    ok: failed.length === 0,
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
    invariants: {
      futureSkewNotOk: cases
        .filter((item) => item.id === "future-skew" || item.id === "future-skew-day" || item.id === "adapter-future-skew")
        .every((item) => item.ok && item.observatoryState === "invalid"),
      withinSkewOk: cases
        .filter((item) => item.id === "within-skew" || item.id === "future-skew-boundary" || item.id === "adapter-within-skew")
        .every((item) => item.ok && item.observatoryState === "ok"),
      staleNotZeroed: cases
        .filter((item) => item.kind === "adapter" && item.observatoryState === "stale")
        .every((item) => item.moltjobs?.jobCount === 12 && item.x402stats?.sellers_30d === 47303),
      clocksDistinct: cases.every((item) => item.clocksDistinct === true),
      payment: false,
      checkout: false,
      publish: false,
      neomorphicIo: false,
    },
  };
}
