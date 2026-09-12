import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCTION_RAILWAY_OBSERVATION } from "./pins.mjs";
import { recommendLiveLockfileOffer } from "./lockfile-offer.mjs";
import { buildSourceExport } from "./source-export.mjs";

/**
 * Rebind an already-captured lockfile profile to the current offer/source
 * model. Does not remount the handler or repeat CPU/wall/RSS collection.
 */
export function rebindMeasuredReport(profile, { reboundAt } = {}) {
  if (!profile || !Array.isArray(profile.rows)) {
    throw new Error("rebindMeasuredReport requires a captured profile with rows");
  }
  const allocatedHour = profile.allocated?.hour;
  const allocatedMonth = profile.allocated?.monthApprox30d;
  const meanWall = profile.latencyMs?.successfulMeanWall ?? null;
  const recommendation = recommendLiveLockfileOffer({
    rows: profile.rows,
    allocatedHour,
    allocatedMonth,
    localSuccessfulMeanWallMs: meanWall,
  });
  const sourceExport = buildSourceExport({
    environment: profile.environment,
    merchantRoot: profile.environment?.merchantRoot,
    h04Root: profile.environment?.h04Root,
  });
  const latencyMs = {
    ...(profile.latencyMs || {}),
    notProductionLatency: true,
    note:
      "Measured on this VM against the mounted handler. Mean local wall is not production latency. 5000ms is the worker ceiling, not the average. Local timeout 503 settle 0 is not a CDP fee invoice.",
  };
  return {
    ...profile,
    reboundAt: reboundAt || new Date().toISOString(),
    reboundFromCapturedAt: profile.capturedAt,
    reboundReason:
      "bind Root Railway allowlist FACILITATOR=cdp (2026-09-12T02:00:00Z) without repeating the mounted profile",
    notProductionCapacity: true,
    productionRailwayObservation: PRODUCTION_RAILWAY_OBSERVATION,
    latencyMs,
    recommendation,
    sourceExport,
  };
}

export function writeReboundMeasured(profile, outDir, options = {}) {
  const rebound = rebindMeasuredReport(profile, options);
  writeFileSync(join(outDir, "profile.json"), `${JSON.stringify(rebound, null, 2)}\n`);
  writeFileSync(
    join(outDir, "recommendation.json"),
    `${JSON.stringify(rebound.recommendation, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "source-export.json"),
    `${JSON.stringify(rebound.sourceExport, null, 2)}\n`,
  );
  return rebound;
}

export function rebindMeasuredFiles({ inPath, outDir, reboundAt } = {}) {
  const profile = JSON.parse(readFileSync(inPath, "utf8"));
  return writeReboundMeasured(profile, outDir, { reboundAt });
}
