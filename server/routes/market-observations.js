/**
 * Public read-only MoltJobs stats observation bridge.
 * Fixed upstream only. Not an arbitrary URL proxy.
 */

import { Router } from "express";
import {
  MOLTJOBS_PROVIDER_ID,
  MOLTJOBS_STATS_SOURCE_URL,
  moltjobsCaptureToLabelledPayload,
} from "../lib/market-observations/moltjobs-stats-adapter.js";
import {
  SCHEMA_VERSION,
  WITHHELD_CONCLUSIONS,
  normalizeMarketStats,
} from "../lib/market-observations/normalize-market-stats.js";
import {
  CACHE_TTL_MS,
  FIXED_UPSTREAM_URL,
  createUpstreamFetcher,
} from "../lib/market-observations/upstream-fetch.js";

export const BRIDGE_TRANSPORT = "samedaydesk-bridge";
export const BRIDGE_ROUTE = "/api/market-observations/moltjobs-stats";
export const DEFAULT_CORS_ORIGIN = "https://neomorphic.io";
export const SOURCE_TIME_STALE_MS = 60 * 60 * 1000;

const productionFetcher = createUpstreamFetcher();

export function corsAllowlist(env = process.env) {
  const allowed = new Set([DEFAULT_CORS_ORIGIN]);
  const extra = env.MARKET_OBS_CORS_ORIGINS || "";
  for (const part of extra.split(",")) {
    const origin = part.trim();
    if (!origin || origin === "*") continue;
    allowed.add(origin);
  }
  return allowed;
}

export function createMarketObservationsRouter(options = {}) {
  const fetcher = options.fetcher || createUpstreamFetcher(options);
  const nowMs = typeof options.now === "function" ? options.now : () => Date.now();
  const router = Router();

  function applyBridgeHeaders(req, res) {
    res.set("X-Market-Obs-Bridge", "samedaydesk");
    res.set("X-Market-Obs-Upstream", FIXED_UPSTREAM_URL);
    res.set("Vary", "Origin");
    res.set("Cache-Control", "no-store");

    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowed = Boolean(origin) && corsAllowlist().has(origin);
    if (allowed) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Accept");
    }
    return { origin, allowed };
  }

  router.options("/moltjobs-stats", (req, res) => {
    const { allowed } = applyBridgeHeaders(req, res);
    if (!allowed) return res.status(403).json({ error: "origin_not_allowed" });
    return res.status(204).end();
  });

  router.get("/moltjobs-stats", async (req, res) => {
    applyBridgeHeaders(req, res);
    try {
      const capture = await fetcher.getCapture();
      const envelope = buildObservationEnvelope(capture, { nowMs: nowMs() });
      return res.status(200).json(envelope);
    } catch (error) {
      const failedAt = new Date(nowMs()).toISOString();
      return res.status(200).json({
        schemaVersion: SCHEMA_VERSION,
        transport: BRIDGE_TRANSPORT,
        bridgeRoute: BRIDGE_ROUTE,
        upstreamUrl: FIXED_UPSTREAM_URL,
        providerId: MOLTJOBS_PROVIDER_ID,
        fetchedAt: failedAt,
        sourceTime: null,
        sourceTimeState: "missing",
        httpStatus: null,
        availability: "unavailable",
        cache: {
          hit: false,
          ageMs: null,
          stale: false,
          fetchedAt: failedAt,
          ttlMs: CACHE_TTL_MS,
        },
        metrics: [],
        warnings: [
          {
            code: "bridge_error",
            message: error && error.message ? error.message : "observation bridge failed",
          },
        ],
        withheldConclusions: WITHHELD_CONCLUSIONS,
        error: {
          code: "bridge_error",
          kind: "unavailable",
          message: error && error.message ? error.message : "observation bridge failed",
        },
      });
    }
  });

  return router;
}

export function buildObservationEnvelope(capture, { nowMs } = {}) {
  const labelled = moltjobsCaptureToLabelledPayload({
    providerId: MOLTJOBS_PROVIDER_ID,
    fetchedAt: capture.fetchedAt ?? null,
    sourceUrl: capture.sourceUrl ?? MOLTJOBS_STATS_SOURCE_URL,
    httpStatus: capture.httpStatus ?? null,
    body: capture.body,
    error: capture.error ?? null,
  });
  const observation = normalizeMarketStats(labelled);
  const sourceTimeState = refineSourceTimeState(
    observation.sourceTime,
    observation.fetchedAt,
    observation.freshness ? observation.freshness.sourceTimeState : "missing",
  );

  const warnings = [];
  if (capture.error) {
    warnings.push({
      code: capture.error.code || capture.error.kind || "upstream_error",
      message: capture.error.message || "upstream error",
    });
  }
  if (sourceTimeState === "stale") {
    warnings.push({
      code: "stale_source_time",
      message: "provider sourceTime is older than the observation clock",
    });
  } else if (sourceTimeState === "missing") {
    warnings.push({
      code: "missing_source_time",
      message: "provider payload did not include a usable sourceTime",
    });
  } else if (sourceTimeState === "schema_drift") {
    warnings.push({
      code: "source_time_schema_drift",
      message: "provider sourceTime was present but not a usable timestamp",
    });
  }
  for (const metric of observation.metrics || []) {
    if (metric && metric.state && metric.state !== "ok") {
      warnings.push({
        code: metric.state,
        metric: metric.key,
        message: `${metric.key} is ${metric.state}`,
      });
    }
  }

  const availability = capture.error && capture.error.code === "oversized_body"
    ? "source_error"
    : observation.availability;

  const cache = capture.cache || {
    hit: false,
    ageMs: null,
    stale: false,
    fetchedAt: observation.fetchedAt,
    ttlMs: CACHE_TTL_MS,
  };

  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    transport: BRIDGE_TRANSPORT,
    bridgeRoute: BRIDGE_ROUTE,
    upstreamUrl: FIXED_UPSTREAM_URL,
    providerId: observation.providerId,
    fetchedAt: observation.fetchedAt,
    sourceTime: observation.sourceTime,
    sourceTimeState,
    httpStatus: observation.httpStatus,
    availability,
    evidencePlane: observation.evidencePlane,
    disposition: observation.disposition,
    cache,
    metrics: observation.metrics,
    warnings,
    withheldConclusions: observation.withheldConclusions,
    error: observation.error ?? capture.error ?? null,
  };

  if (capture.rawProviderBody !== undefined && capture.rawProviderBody !== null) {
    envelope.rawProviderBody = capture.rawProviderBody;
  }

  if (nowMs != null && cache.fetchedAt && cache.ageMs == null) {
    const fetchedMs = Date.parse(cache.fetchedAt);
    if (Number.isFinite(fetchedMs)) {
      envelope.cache = {
        ...cache,
        ageMs: Math.max(0, nowMs - fetchedMs),
        stale: nowMs - fetchedMs > cache.ttlMs,
      };
    }
  }

  return envelope;
}

export function refineSourceTimeState(sourceTime, fetchedAt, currentState) {
  if (currentState !== "ok" || typeof sourceTime !== "string" || !sourceTime) {
    return currentState || "missing";
  }
  const sourceMs = Date.parse(sourceTime);
  if (!Number.isFinite(sourceMs)) return "schema_drift";
  const fetchedMs = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : Number.NaN;
  if (!Number.isFinite(fetchedMs)) return currentState;
  if (fetchedMs - sourceMs > SOURCE_TIME_STALE_MS) return "stale";
  return "ok";
}

const router = createMarketObservationsRouter({ fetcher: productionFetcher });
export default router;
