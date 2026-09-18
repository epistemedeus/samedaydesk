/**
 * Published SDS clock-skew engines. This pack does not fork the windows.
 * Market-observation refine is loaded from source text so a cold clone
 * does not need the Express dependency graph.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FUTURE_SKEW_MS,
  STALE_PROVIDER_MS,
  classifyProviderTimestamp,
} from "../../../../server/lib/observatory/contract.js";
import { observe as observeMoltjobs } from "../../../../server/lib/observatory/adapters/moltjobs.js";
import { observe as observeX402stats } from "../../../../server/lib/observatory/adapters/x402stats.js";
import { REPO } from "./paths.mjs";

const MARKET_ROUTE = join(REPO, "server/routes/market-observations.js");
const MARKET_SRC = readFileSync(MARKET_ROUTE, "utf8");

function extractConst(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!match) throw new Error(`published ${name} missing from ${MARKET_ROUTE}`);
  return Function(`"use strict"; return (${match[1]});`)();
}

function extractFunction(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`published ${name} missing from ${MARKET_ROUTE}`);
  const header = source.slice(start);
  const brace = header.indexOf("{");
  let depth = 0;
  for (let i = brace; i < header.length; i++) {
    if (header[i] === "{") depth += 1;
    else if (header[i] === "}") {
      depth -= 1;
      if (depth === 0) return header.slice(0, i + 1).replace(/^export function /, "function ");
    }
  }
  throw new Error(`published ${name} is unclosed`);
}

export const SOURCE_TIME_STALE_MS = extractConst(MARKET_SRC, "SOURCE_TIME_STALE_MS");
export const refineSourceTimeState = Function(
  "SOURCE_TIME_STALE_MS",
  `"use strict"; ${extractFunction(MARKET_SRC, "refineSourceTimeState")}; return refineSourceTimeState;`,
)(SOURCE_TIME_STALE_MS);

export const PINNED_FETCHED_AT = "2026-09-17T12:00:00.000Z";
export const PINNED_NOW_MS = Date.parse(PINNED_FETCHED_AT);

export {
  FUTURE_SKEW_MS,
  STALE_PROVIDER_MS,
  classifyProviderTimestamp,
};

const MOLTJOBS_CORE = Object.freeze({
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
});

const X402_SNAPSHOT_CORE = Object.freeze({
  avgPaymentUsd: 0.12,
  facilitatorShare: [],
  medianSellerRevenueUsd: 0.01,
  organicSellers: 84,
  organicVolumeUsd: 840.5,
  sellers: 47303,
  top10VolumeShare: 0.73,
  volumeUsd: 1021.25,
  windowDays: 30,
});

export function moltjobsCapture(fetchedAt, providerTimestamp) {
  const body = {
    data: {
      ...MOLTJOBS_CORE,
    },
  };
  if (providerTimestamp !== undefined) body.data.updatedAt = providerTimestamp;
  return {
    fetchedAt,
    httpStatus: 200,
    sourceUrl: "https://api.moltjobs.io/v1/stats",
    body,
    cache: {
      hit: false,
      ageMs: 0,
      stale: false,
      fetchedAt,
      ttlMs: 30_000,
    },
  };
}

export function x402statsCapture(fetchedAt, providerTimestamp) {
  const body = {
    methodologyVersion: "2026-07-01.v1",
    series: [],
    history: [],
    snapshot: {
      ...X402_SNAPSHOT_CORE,
    },
  };
  if (providerTimestamp !== undefined) {
    body.updatedAt = providerTimestamp;
    body.snapshot.computedAt = providerTimestamp;
  }
  return {
    fetchedAt,
    httpStatus: 200,
    sourceUrl: "https://x402stats.io/api/stats",
    body,
    cache: {
      hit: false,
      ageMs: 0,
      stale: false,
      fetchedAt,
      ttlMs: 30_000,
    },
  };
}

export function metricValue(envelope, key) {
  const row = (envelope.metrics || []).find((entry) => entry && entry.key === key);
  return row ? row.value : undefined;
}

export function classifyPair(raw, fetchedAt, nowMs = PINNED_NOW_MS) {
  const observatory = classifyProviderTimestamp(raw, fetchedAt, nowMs);
  const currentState =
    raw == null || raw === ""
      ? "missing"
      : typeof raw !== "string"
        ? "schema_drift"
        : "ok";
  const marketObsState = refineSourceTimeState(typeof raw === "string" ? raw : null, fetchedAt, currentState);
  return {
    observatory,
    marketObsState,
    clocksDistinct:
      observatory.timestamp == null || observatory.timestamp !== fetchedAt,
  };
}

export function runAdapters(fetchedAt, providerTimestamp, nowMs = PINNED_NOW_MS) {
  const moltjobs = observeMoltjobs(moltjobsCapture(fetchedAt, providerTimestamp), { nowMs });
  const x402stats = observeX402stats(x402statsCapture(fetchedAt, providerTimestamp), { nowMs });
  return { moltjobs, x402stats };
}

export function naiveClassify(raw) {
  if (raw == null || raw === "") return { timestamp: null, state: "missing" };
  if (typeof raw !== "string") return { timestamp: null, state: "invalid" };
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { timestamp: null, state: "invalid" };
  return { timestamp: new Date(parsed).toISOString(), state: "ok" };
}

export function naiveStaleRewrite(envelope) {
  return {
    availability: "ok",
    providerTimestampState: "ok",
    providerTimestamp: envelope.fetchedAt,
    metrics: (envelope.metrics || []).map((row) => ({
      key: row.key,
      value: 0,
      state: "ok",
    })),
  };
}

export function naiveRefineSourceTimeInclusive(sourceTime, fetchedAt) {
  if (typeof sourceTime !== "string" || !sourceTime) return "missing";
  const sourceMs = Date.parse(sourceTime);
  if (!Number.isFinite(sourceMs)) return "schema_drift";
  const fetchedMs = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : Number.NaN;
  if (!Number.isFinite(fetchedMs)) return "ok";
  if (fetchedMs - sourceMs >= SOURCE_TIME_STALE_MS) return "stale";
  return "ok";
}
