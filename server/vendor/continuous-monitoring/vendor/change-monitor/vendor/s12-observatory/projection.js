/**
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 SameDayDesk / Neomorphic LLC
 *
 * One maintained projection of the named observatory sources.
 * Freshness, coverage, and dedup are per source. Activity labels stay independent.
 * Mixed-population and cross-source sums are refused. No market-wide traffic figure.
 * This is not a second observatory.
 */
import { SOURCE_IDS } from "./contract.js";

export const PROJECTION_SCHEMA = "pilot.external-observatory.source-projection.v1";
export const PROJECTION_ID = "agent-economy-observatory.source-projection";
export const FRESH_WITHIN_MS = 48 * 60 * 60 * 1000;

export const ACTIVITY_LABEL = Object.freeze({
  moltjobs: "work_market_activity",
  x402stats: "settlement_activity",
  smithery_mcp: "catalog_activity",
});

export const EXPECTED_POPULATIONS = Object.freeze({
  moltjobs: Object.freeze([
    "moltjobs_work_market",
    "moltjobs_marketplace_ordinary_third_party",
    "moltjobs_marketplace_employers",
    "moltjobs_registered_agents",
    "moltjobs_agents_ever_paid",
    "moltjobs_agents_bidding_30d",
    "moltjobs_platform_programs",
  ]),
  x402stats: Object.freeze([
    "provider_indexed_sellers",
    "provider_indexed_volume",
    "provider_heuristic_organic_sellers",
  ]),
  smithery_mcp: Object.freeze([
    "smithery_server_catalog",
  ]),
});

const KEY_POPULATION = Object.freeze({
  jobCount: "moltjobs_work_market",
  completedCount: "moltjobs_work_market",
  registeredAgents: "moltjobs_work_market",
  volumeUsdc: "moltjobs_work_market",
  escrowDeposits: "moltjobs_work_market",
  completionRatio: "moltjobs_work_market",
  escrowToVolumeRatio: "moltjobs_work_market",
  completionSampleSize: "moltjobs_work_market",
  avgCompletionTimeMs: "moltjobs_work_market",
  medianCompletionTimeMs: "moltjobs_work_market",
  avgTimeToFillMs: "moltjobs_work_market",
  medianTimeToFillMs: "moltjobs_work_market",
  disputeRate: "moltjobs_work_market",
  marketplaceJobs: "moltjobs_marketplace_ordinary_third_party",
  marketplaceCompleted: "moltjobs_marketplace_ordinary_third_party",
  marketplaceSettledVolumeUsdc: "moltjobs_marketplace_ordinary_third_party",
  marketplaceCompletionRatio: "moltjobs_marketplace_ordinary_third_party",
  marketplaceEmployers: "moltjobs_marketplace_employers",
  marketplaceFundedEmployers: "moltjobs_marketplace_employers",
  marketplaceFundedEmployerRatio: "moltjobs_marketplace_employers",
  liquidityRegisteredAgents: "moltjobs_registered_agents",
  liquidityAgentsEverPaid: "moltjobs_agents_ever_paid",
  liquidityAgentsBidding30d: "moltjobs_agents_bidding_30d",
  platformProgramJobs: "moltjobs_platform_programs",
  platformProgramBudgetUsdc: "moltjobs_platform_programs",
  sellers_30d: "provider_indexed_sellers",
  volume_usd_30d: "provider_indexed_volume",
  organic_sellers_30d: "provider_heuristic_organic_sellers",
  organic_volume_usd_30d: "provider_heuristic_organic_volume",
  median_seller_revenue_usd_30d: "provider_indexed_sellers",
  avg_payment_usd_30d: "provider_indexed_protocol_activity",
  top10_volume_share_30d: "provider_indexed_protocol_activity",
  window_days: "provider_indexed_protocol_activity",
  registered_servers: "smithery_server_catalog",
});

const REFUSED_METRIC_KEYS = new Set([
  "marketWideTraffic",
  "globalAgentTraffic",
  "totalAgentEconomy",
  "crossSourceSum",
  "mixedPopulationSum",
  "agentTraffic",
]);

const FAILURE_AVAILABILITY = new Set([
  "unavailable",
  "error",
  "missing_from_snapshot",
  "source_error",
]);

const SUM_REASON = "Named sources are not additive. This projection does not emit a cross-source or mixed-population sum, and it does not claim market-wide traffic.";

export function emptyProjection({ observedAt = null } = {}) {
  return {
    schemaVersion: PROJECTION_SCHEMA,
    projectionId: PROJECTION_ID,
    maintained: true,
    observedAt,
    marketWideTraffic: null,
    combinedActivity: null,
    activityLabels: "independent",
    crossSourceSum: { refused: true, total: null, reason: SUM_REASON },
    sources: SOURCE_IDS.map((sourceId) => emptySlot(sourceId)),
    log: [],
    lastApplications: [],
  };
}

export function applySourceUpdate(projection, observation, { observedAt = null } = {}) {
  const base = projection && projection.projectionId === PROJECTION_ID ? projection : emptyProjection({ observedAt });
  const refusal = refusalOf(observation);
  if (refusal) {
    return refuseUpdate(base, refusal, sourceIdOf(observation), observedAt);
  }
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    return refuseUpdate(base, "PARSE", null, observedAt);
  }
  const sourceId = sourceIdOf(observation);
  if (!SOURCE_IDS.includes(sourceId)) {
    return refuseUpdate(base, "UNKNOWN_SOURCE", sourceId, observedAt);
  }
  const read = readMetrics(observation);
  if (read.refusedKey) {
    return refuseUpdate(base, "MARKET_WIDE_TRAFFIC", sourceId, observedAt);
  }
  const current = slotById(base, sourceId);
  const availability = read.availability;
  if (FAILURE_AVAILABILITY.has(availability)) {
    if (current.dedup.acceptedCount > 0) {
      const kept = cloneSlot(current);
      kept.freshness = touchFreshness(kept.freshness, observedAt);
      kept.lastAttempt = { availability, observedAt, keptPrior: true };
      const next = replaceSlot(base, sourceId, kept, {
        at: observedAt,
        sourceId,
        kind: "kept_prior",
        code: "SOURCE_UNAVAILABLE",
      }, observedAt);
      return done(next, { applied: false, deduped: false, code: "KEPT_PRIOR", valueChanged: false });
    }
    const failed = emptySlot(sourceId);
    failed.availability = availability;
    failed.freshness = freshnessFor(observation, observedAt);
    failed.coverage = coverageFor(sourceId, [], observation);
    failed.lastAttempt = { availability, observedAt, keptPrior: false };
    const next = replaceSlot(base, sourceId, failed, {
      at: observedAt,
      sourceId,
      kind: "unavailable",
      code: "SOURCE_UNAVAILABLE",
    }, observedAt);
    return done(next, { applied: true, deduped: false, code: "SOURCE_UNAVAILABLE", valueChanged: false });
  }

  const metrics = read.metrics;
  const providerTimestamp = clockText(observation.providerTimestamp);
  const identity = readingIdentity(sourceId, providerTimestamp, metrics);
  if (current.dedup.identity && current.dedup.identity === identity) {
    const dup = cloneSlot(current);
    dup.freshness = touchFreshness(dup.freshness, observedAt);
    dup.dedup = {
      ...dup.dedup,
      duplicateCount: dup.dedup.duplicateCount + 1,
      consecutiveDuplicateCount: dup.dedup.consecutiveDuplicateCount + 1,
      lastDuplicateAt: observedAt,
    };
    dup.lastAttempt = null;
    const next = replaceSlot(base, sourceId, dup, {
      at: observedAt,
      sourceId,
      kind: "dedup",
      code: "DEDUPED",
    }, observedAt);
    return done(next, { applied: false, deduped: true, code: "DEDUPED", valueChanged: false });
  }

  const valueChanged = current.dedup.acceptedCount > 0 && metricFingerprint(current.metrics) !== metricFingerprint(metrics);
  const slot = emptySlot(sourceId);
  slot.maintained = true;
  slot.availability = availability;
  slot.freshness = freshnessFor(observation, observedAt);
  slot.coverage = coverageFor(sourceId, metrics, observation);
  slot.metrics = metrics;
  slot.previous = current.dedup.identity
    ? {
      identity: current.dedup.identity,
      shortIdentity: current.dedup.shortIdentity,
      fetchedAt: current.freshness.fetchedAt,
      providerTimestamp: current.freshness.providerTimestamp,
      acceptedCount: current.dedup.acceptedCount,
    }
    : null;
  slot.dedup = {
    identity,
    shortIdentity: shortIdentity(identity),
    duplicateCount: current.dedup.duplicateCount,
    consecutiveDuplicateCount: 0,
    lastDuplicateAt: null,
    acceptedCount: current.dedup.acceptedCount + 1,
  };
  slot.lastAttempt = null;
  const next = replaceSlot(base, sourceId, slot, {
    at: observedAt,
    sourceId,
    kind: valueChanged ? "value_update" : current.dedup.acceptedCount > 0 ? "clock_update" : "accept",
    code: "ACCEPTED",
  }, observedAt);
  return done(next, { applied: true, deduped: false, code: "ACCEPTED", valueChanged });
}

export function projectSnapshot(snapshot, { observedAt = null, prior = null } = {}) {
  const clock = observedAt || (snapshot && typeof snapshot.fetchedAt === "string" ? snapshot.fetchedAt : null);
  let current = prior && prior.projectionId === PROJECTION_ID ? prior : emptyProjection({ observedAt: clock });
  const observations = snapshot && Array.isArray(snapshot.observations) ? snapshot.observations : [];
  const applications = [];
  for (const sourceId of SOURCE_IDS) {
    const found = observations.find((entry) => entry && entry.sourceId === sourceId);
    if (!found) {
      applications.push({ sourceId, applied: false, deduped: false, refused: false, code: "ABSENT", valueChanged: false });
      continue;
    }
    const result = applySourceUpdate(current, found, { observedAt: clock });
    current = result.projection;
    applications.push({
      sourceId,
      applied: result.applied,
      deduped: result.deduped,
      refused: result.refused,
      code: result.code,
      valueChanged: result.valueChanged === true,
    });
  }
  const projection = cloneProjection(current);
  projection.observedAt = clock;
  projection.lastApplications = applications;
  projection.marketWideTraffic = null;
  projection.combinedActivity = null;
  return projection;
}

export function refuseMixedPopulationSum(operands) {
  const rows = Array.isArray(operands) ? operands.filter((row) => row && typeof row === "object") : [];
  return {
    refused: true,
    total: null,
    figure: null,
    marketWideTraffic: null,
    combinedActivity: null,
    activityLabels: "independent",
    sourceIds: unique(rows.map((row) => row.sourceId).filter(Boolean)),
    populations: unique(rows.map((row) => row.population).filter(Boolean)),
    units: unique(rows.map((row) => row.unit).filter(Boolean)),
    windows: unique(rows.map((row) => row.window).filter(Boolean)),
    reason: "Refused a mixed-population cross-source sum. Each source keeps its own activity label. No market-wide traffic figure is emitted.",
  };
}

export function combinedActivity() {
  return {
    refused: true,
    value: null,
    total: null,
    marketWideTraffic: null,
    reason: "Activity labels are independent. This projection does not sum activity across sources or populations.",
  };
}

export function seededFailureRequest() {
  return {
    seeded: true,
    sourceId: "cross_source",
    claim: "market-wide traffic",
    marketWideTraffic: "claimed",
    mixedPopulationSum: true,
    operands: [
      {
        sourceId: "moltjobs",
        key: "marketplaceSettledVolumeUsdc",
        population: "moltjobs_marketplace_ordinary_third_party",
        unit: "USDC",
        window: "unspecified_provider_snapshot",
      },
      {
        sourceId: "x402stats",
        key: "volume_usd_30d",
        population: "provider_indexed_volume",
        unit: "USD",
        window: "30d",
      },
    ],
  };
}

export function rejectSeededFailure(request = seededFailureRequest()) {
  const prior = applySourceUpdate(
    emptyProjection({ observedAt: "2026-09-10T08:00:00.000Z" }),
    moltjobsReading({
      fetchedAt: "2026-09-10T08:00:00.000Z",
      providerTimestamp: "2026-09-10T07:54:19.962Z",
      marketplaceCompleted: 6,
    }),
    { observedAt: "2026-09-10T08:00:00.000Z" },
  );
  const attempt = applySourceUpdate(prior.projection, request, { observedAt: "2026-09-10T12:30:00.000Z" });
  const completed = metricValue(slotById(attempt.projection, "moltjobs"), "marketplaceCompleted");
  const sum = refuseMixedPopulationSum(request.operands);
  return {
    ok: false,
    refused: attempt.refused === true,
    proof: "seeded_failure",
    code: attempt.refused ? "SEED_REJECT" : "SEED_NOT_REJECTED",
    exitCode: 1,
    total: null,
    marketWideTraffic: null,
    combinedActivity: null,
    activityLabels: "independent",
    reason: sum.reason,
    updateAccepted: attempt.applied === true,
    maintainedMarketplaceCompleted: completed,
    summedWithPrior: false,
    operands: (request.operands || []).map((row) => ({
      sourceId: row.sourceId,
      key: row.key,
      population: row.population,
      unit: row.unit,
      window: row.window,
    })),
  };
}

export function proveSourceUpdate() {
  const firstReading = moltjobsReading({
    fetchedAt: "2026-09-10T08:00:00.000Z",
    providerTimestamp: "2026-09-10T07:54:19.962Z",
    marketplaceCompleted: 6,
  });
  const secondReading = moltjobsReading({
    fetchedAt: "2026-09-10T12:00:00.000Z",
    providerTimestamp: "2026-09-10T11:50:00.000Z",
    marketplaceCompleted: 7,
  });
  const first = applySourceUpdate(emptyProjection({ observedAt: firstReading.fetchedAt }), firstReading, {
    observedAt: firstReading.fetchedAt,
  });
  const second = applySourceUpdate(first.projection, secondReading, { observedAt: secondReading.fetchedAt });
  const duplicate = applySourceUpdate(second.projection, secondReading, { observedAt: "2026-09-10T12:10:00.000Z" });
  const before = slotById(first.projection, "moltjobs");
  const after = slotById(second.projection, "moltjobs");
  const deduped = slotById(duplicate.projection, "moltjobs");
  return {
    ok: first.ok === true && second.applied === true && duplicate.deduped === true,
    proof: "source_update",
    sourceId: "moltjobs",
    activityLabel: ACTIVITY_LABEL.moltjobs,
    before: slotProof(before),
    after: {
      ...slotProof(after),
      previousIdentity: after.previous && after.previous.identity,
      valueAddedToPrior: false,
    },
    dedup: {
      duplicateCount: deduped.dedup.duplicateCount,
      consecutiveDuplicateCount: deduped.dedup.consecutiveDuplicateCount,
      value: metricValue(deduped, "marketplaceCompleted"),
      summedWithPrior: false,
      freshness: deduped.freshness.state,
    },
    activityLabels: SOURCE_IDS.map((sourceId) => ({ sourceId, activityLabel: ACTIVITY_LABEL[sourceId] })),
    combinedActivity: null,
    crossSourceSum: { refused: true, total: null },
    marketWideTraffic: null,
    projection: duplicate.projection,
  };
}

function moltjobsReading({ fetchedAt, providerTimestamp, marketplaceCompleted }) {
  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    availability: "ok",
    fetchedAt,
    providerTimestamp,
    providerTimestampState: "ok",
    metrics: [
      { key: "jobCount", value: 110, state: "ok", unit: "count", population: "moltjobs_work_market", window: "unspecified_provider_snapshot" },
      { key: "marketplaceCompleted", value: marketplaceCompleted, state: "ok", unit: "count", population: "moltjobs_marketplace_ordinary_third_party", window: "unspecified_provider_snapshot" },
      { key: "liquidityRegisteredAgents", value: 434, state: "ok", unit: "count", population: "moltjobs_registered_agents", window: "unspecified_provider_snapshot" },
      { key: "liquidityAgentsEverPaid", value: 3, state: "ok", unit: "count", population: "moltjobs_agents_ever_paid", window: "unspecified_provider_snapshot" },
    ],
  };
}

function slotProof(slot) {
  return {
    fetchedAt: slot.freshness.fetchedAt,
    providerTimestamp: slot.freshness.providerTimestamp,
    marketplaceCompleted: metricValue(slot, "marketplaceCompleted"),
    identity: slot.dedup.identity,
    freshness: slot.freshness.state,
    coverage: slot.coverage.state,
    missingPopulations: slot.coverage.missingPopulations.slice(),
    activityLabel: slot.activityLabel,
    activityFigure: null,
  };
}

function emptySlot(sourceId) {
  return {
    sourceId,
    activityLabel: ACTIVITY_LABEL[sourceId] || sourceId,
    activityFigure: null,
    maintained: false,
    availability: "unprojected",
    freshness: {
      state: "clock_missing",
      fetchedAt: null,
      providerTimestamp: null,
      providerTimestampState: "missing",
      ageMs: null,
      lastSeenAt: null,
      freshWithinMs: FRESH_WITHIN_MS,
    },
    coverage: {
      state: "uncovered",
      presentPopulations: [],
      missingPopulations: (EXPECTED_POPULATIONS[sourceId] || []).slice(),
      extraPopulations: [],
      unlabelledOkCount: 0,
      okMetricCount: 0,
      missingMetricCount: 0,
      envelopeCoverage: null,
    },
    dedup: {
      identity: null,
      shortIdentity: null,
      duplicateCount: 0,
      consecutiveDuplicateCount: 0,
      lastDuplicateAt: null,
      acceptedCount: 0,
    },
    metrics: [],
    previous: null,
    lastAttempt: null,
  };
}

function done(projection, fields) {
  return {
    ok: true,
    applied: fields.applied,
    deduped: fields.deduped,
    refused: false,
    code: fields.code,
    reason: null,
    valueChanged: fields.valueChanged,
    projection,
  };
}

function refuseUpdate(projection, code, sourceId, observedAt) {
  const next = cloneProjection(projection);
  next.observedAt = observedAt || projection.observedAt;
  next.marketWideTraffic = null;
  next.combinedActivity = null;
  next.log = appendLog(next.log, { at: observedAt, sourceId: sourceId || null, kind: "refuse", code });
  return {
    ok: false,
    applied: false,
    deduped: false,
    refused: true,
    code,
    reason: reasonFor(code),
    valueChanged: false,
    projection: next,
  };
}

function refusalOf(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.mixedPopulationSum != null) return "MIXED_POPULATION_SUM";
  if (Array.isArray(body.operands) && body.operands.length >= 2) {
    const sourceIds = new Set(body.operands.map((row) => row && row.sourceId).filter(Boolean));
    const populations = new Set(body.operands.map((row) => row && row.population).filter(Boolean));
    const units = new Set(body.operands.map((row) => row && row.unit).filter(Boolean));
    if (sourceIds.size > 1 || populations.size > 1 || units.size > 1) return "MIXED_POPULATION_SUM";
  }
  if (body.marketWideTraffic != null || body.globalAgentTraffic != null || body.totalAgentEconomy != null) {
    return "MARKET_WIDE_TRAFFIC";
  }
  if (typeof body.claim === "string" && /market-wide traffic|global agent traffic|total of the agent economy|total agent economy/i.test(body.claim)) {
    return "MARKET_WIDE_TRAFFIC";
  }
  if (body.crossSourceSum != null && body.crossSourceSum !== "refused") return "CROSS_SOURCE_SUM";
  return null;
}

function reasonFor(code) {
  if (code === "MIXED_POPULATION_SUM" || code === "CROSS_SOURCE_SUM") {
    return "Refused a mixed-population cross-source sum. Activity labels stay independent.";
  }
  if (code === "MARKET_WIDE_TRAFFIC") {
    return "Refused a market-wide traffic claim. This projection does not emit that figure.";
  }
  if (code === "UNKNOWN_SOURCE") {
    return "This projection keeps only moltjobs, x402stats, and smithery_mcp.";
  }
  return "Refused an unreadable source update.";
}

function readMetrics(observation) {
  const availability = availabilityOf(observation);
  if (FAILURE_AVAILABILITY.has(availability)) {
    return { availability, metrics: [], refusedKey: null };
  }
  const byKey = new Map();
  const list = Array.isArray(observation.metrics) ? observation.metrics : [];
  for (const raw of list) {
    if (!raw || typeof raw.key !== "string" || !raw.key) continue;
    if (REFUSED_METRIC_KEYS.has(raw.key)) return { availability, metrics: [], refusedKey: raw.key };
    const state = typeof raw.state === "string" && raw.state ? raw.state : raw.value == null ? "missing" : "ok";
    const population = typeof raw.population === "string" && raw.population.trim()
      ? raw.population.trim()
      : KEY_POPULATION[raw.key] || null;
    byKey.set(raw.key, {
      key: raw.key,
      state,
      value: state === "ok" && raw.value != null ? raw.value : null,
      unit: raw.unit == null ? null : raw.unit,
      population,
      window: raw.window == null ? null : raw.window,
      populationLabelSource: typeof raw.population === "string" && raw.population.trim()
        ? "metric"
        : KEY_POPULATION[raw.key]
          ? "key_map"
          : "unlabelled",
    });
  }
  const metrics = [...byKey.values()].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return { availability, metrics, refusedKey: null };
}

function coverageFor(sourceId, metrics, observation) {
  const expected = EXPECTED_POPULATIONS[sourceId] || [];
  const present = expected.filter((population) => metrics.some((metric) => (
    metric.population === population && metric.state === "ok" && metric.value != null
  )));
  const presentSet = new Set(present);
  const extra = [];
  for (const metric of metrics) {
    if (metric.state !== "ok" || metric.value == null || !metric.population) continue;
    if (!presentSet.has(metric.population) && !expected.includes(metric.population) && !extra.includes(metric.population)) {
      extra.push(metric.population);
    }
  }
  let state = "uncovered";
  if (present.length === expected.length && expected.length > 0) state = "covered";
  else if (present.length > 0) state = "partial";
  const availability = availabilityOf(observation);
  if (FAILURE_AVAILABILITY.has(availability)) state = "unavailable";
  return {
    state,
    presentPopulations: present,
    missingPopulations: expected.filter((population) => !presentSet.has(population)),
    extraPopulations: extra,
    unlabelledOkCount: metrics.filter((metric) => metric.state === "ok" && metric.value != null && !metric.population).length,
    okMetricCount: metrics.filter((metric) => metric.state === "ok" && metric.value != null).length,
    missingMetricCount: metrics.filter((metric) => metric.state !== "ok" || metric.value == null).length,
    envelopeCoverage: envelopeCoverage(observation && observation.coverage),
  };
}

function envelopeCoverage(coverage) {
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) return null;
  return {
    kind: typeof coverage.kind === "string" ? coverage.kind : null,
    complete: coverage.complete === true ? true : coverage.complete === false ? false : null,
    population: typeof coverage.population === "string" ? coverage.population : null,
    window: typeof coverage.window === "string" ? coverage.window : null,
    additivity: typeof coverage.additivity === "string" ? coverage.additivity : null,
    notes: typeof coverage.notes === "string" ? coverage.notes.slice(0, 280) : null,
  };
}

function freshnessFor(observation, observedAt) {
  const fetchedAt = clockText(observation && observation.fetchedAt);
  const providerTimestamp = clockText(observation && observation.providerTimestamp);
  const providerTimestampState = observation && typeof observation.providerTimestampState === "string" && observation.providerTimestampState
    ? observation.providerTimestampState
    : providerTimestamp ? "ok" : "missing";
  const base = {
    fetchedAt,
    providerTimestamp,
    providerTimestampState,
    lastSeenAt: observedAt || fetchedAt,
    freshWithinMs: FRESH_WITHIN_MS,
    ageMs: null,
    state: "clock_missing",
  };
  return classifyAge(base, fetchedAt || providerTimestamp, observedAt);
}

function touchFreshness(freshness, observedAt) {
  const clock = freshness.fetchedAt || freshness.providerTimestamp;
  return classifyAge({ ...freshness, lastSeenAt: observedAt || freshness.lastSeenAt }, clock, observedAt);
}

function classifyAge(base, clock, observedAt) {
  if (!clock) return { ...base, state: "clock_missing", ageMs: null };
  if (!observedAt) return { ...base, state: "clock_unparsed", ageMs: null };
  const clockMs = Date.parse(clock);
  const nowMs = Date.parse(observedAt);
  if (!Number.isFinite(clockMs) || !Number.isFinite(nowMs)) return { ...base, state: "clock_unparsed", ageMs: null };
  const ageMs = nowMs - clockMs;
  if (ageMs < 0) return { ...base, ageMs, state: "clock_ahead" };
  return { ...base, ageMs, state: ageMs <= FRESH_WITHIN_MS ? "fresh" : "stale" };
}

function availabilityOf(observation) {
  if (observation && typeof observation.availability === "string" && observation.availability) return observation.availability;
  const metrics = observation && Array.isArray(observation.metrics) ? observation.metrics : [];
  if (metrics.some((metric) => metric && metric.state === "ok" && metric.value != null)) return "ok";
  return "unavailable";
}

function readingIdentity(sourceId, providerTimestamp, metrics) {
  return [sourceId, providerTimestamp || "", metricFingerprint(metrics)].join("|");
}

function metricFingerprint(metrics) {
  return (metrics || []).map((metric) => [
    metric.key,
    metric.state,
    metric.value == null ? "" : String(metric.value),
    metric.unit || "",
    metric.population || "",
    metric.window || "",
  ].join("~")).sort().join("|");
}

function shortIdentity(identity) {
  let hash = 5381;
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash * 33) ^ identity.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function sourceIdOf(body) {
  if (!body || typeof body !== "object") return null;
  return typeof body.sourceId === "string" && body.sourceId.trim() ? body.sourceId.trim() : null;
}

function clockText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metricValue(slot, key) {
  const metric = slot && slot.metrics.find((entry) => entry.key === key);
  return metric ? metric.value : null;
}

function slotById(projection, sourceId) {
  return projection.sources.find((entry) => entry.sourceId === sourceId);
}

function replaceSlot(projection, sourceId, slot, logEntry, observedAt) {
  const next = cloneProjection(projection);
  next.observedAt = observedAt || projection.observedAt;
  next.sources = next.sources.map((entry) => entry.sourceId === sourceId ? slot : entry);
  next.log = appendLog(next.log, logEntry);
  next.marketWideTraffic = null;
  next.combinedActivity = null;
  return next;
}

function cloneProjection(projection) {
  return {
    schemaVersion: projection.schemaVersion,
    projectionId: projection.projectionId,
    maintained: true,
    observedAt: projection.observedAt,
    marketWideTraffic: null,
    combinedActivity: null,
    activityLabels: "independent",
    crossSourceSum: { refused: true, total: null, reason: SUM_REASON },
    sources: projection.sources.map((slot) => cloneSlot(slot)),
    log: projection.log.map((entry) => ({ ...entry })),
    lastApplications: Array.isArray(projection.lastApplications)
      ? projection.lastApplications.map((entry) => ({ ...entry }))
      : [],
  };
}

function cloneSlot(slot) {
  return {
    ...slot,
    freshness: { ...slot.freshness },
    coverage: {
      ...slot.coverage,
      presentPopulations: slot.coverage.presentPopulations.slice(),
      missingPopulations: slot.coverage.missingPopulations.slice(),
      extraPopulations: slot.coverage.extraPopulations.slice(),
      envelopeCoverage: slot.coverage.envelopeCoverage ? { ...slot.coverage.envelopeCoverage } : null,
    },
    dedup: { ...slot.dedup },
    metrics: slot.metrics.map((metric) => ({ ...metric })),
    previous: slot.previous ? { ...slot.previous } : null,
    lastAttempt: slot.lastAttempt ? { ...slot.lastAttempt } : null,
  };
}

function appendLog(log, entry) {
  const next = log.slice();
  next.push(entry);
  if (next.length > 24) next.splice(0, next.length - 24);
  return next;
}

function unique(values) {
  const out = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function invokedAsCli() {
  if (typeof process === "undefined" || !process.argv || !process.argv[1]) return false;
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
  const arg = process.argv[1];
  const abs = arg.startsWith("/") ? arg : `${process.cwd()}/${arg}`;
  return pathname === abs;
}

async function runCli(argv) {
  if (argv.includes("--seeded-failure") || argv.includes("--seeded-fail")) {
    const result = rejectSeededFailure();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.refused ? 1 : 2;
  }
  if (argv.includes("--live-update")) return liveUpdate();
  const proof = proveSourceUpdate();
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  return proof.ok ? 0 : 1;
}

async function liveUpdate() {
  const { fetchObservatoryBoard } = await import("./fetch-observatory.js");
  const { parseSnapshot } = await import("./envelope.js");
  const first = await fetchObservatoryBoard({ timeoutMs: 20000 });
  if (!first.snapshotResult.ok) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      proof: "live_source_update",
      code: "SOURCE_FETCH_FAILED",
      marketWideTraffic: null,
      combinedActivity: null,
      total: null,
      error: first.snapshotResult.error,
    }, null, 2)}\n`);
    return 2;
  }
  const firstSnap = parseSnapshot(first.snapshotResult.body, {
    fetchedAt: first.snapshotResult.receipt.fetchedAt,
    bridgeUrl: first.urls.snapshot,
  });
  const maintainedPrior = applySourceUpdate(
    emptyProjection({ observedAt: "2026-09-10T08:00:00.000Z" }),
    moltjobsReading({
      fetchedAt: "2026-09-10T08:00:00.000Z",
      providerTimestamp: "2026-09-10T07:54:19.962Z",
      marketplaceCompleted: 6,
    }),
    { observedAt: "2026-09-10T08:00:00.000Z" },
  ).projection;
  const firstProjection = projectSnapshot(firstSnap, { observedAt: firstSnap.fetchedAt, prior: maintainedPrior });
  const second = await fetchObservatoryBoard({ timeoutMs: 20000 });
  let projection = firstProjection;
  let secondSnap = null;
  let secondError = null;
  if (second.snapshotResult.ok) {
    secondSnap = parseSnapshot(second.snapshotResult.body, {
      fetchedAt: second.snapshotResult.receipt.fetchedAt,
      bridgeUrl: second.urls.snapshot,
    });
    projection = projectSnapshot(secondSnap, { observedAt: secondSnap.fetchedAt, prior: firstProjection });
  } else {
    secondError = second.snapshotResult.error;
  }
  const body = {
    ok: true,
    proof: "live_source_update",
    bridge: first.urls.snapshot,
    marketWideTraffic: null,
    combinedActivity: null,
    activityLabels: "independent",
    crossSourceSum: { refused: true, total: null },
    firstHttpStatus: first.snapshotResult.receipt.httpStatus,
    secondHttpStatus: second.snapshotResult.receipt.httpStatus,
    firstFetchedAt: firstSnap.fetchedAt,
    secondFetchedAt: secondSnap ? secondSnap.fetchedAt : null,
    secondError,
    sourceUpdate: liveSourceChange("moltjobs", "marketplaceCompleted", maintainedPrior, firstProjection),
    sources: SOURCE_IDS.map((sourceId) => liveSourceRow(sourceId, firstProjection, projection)),
  };
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  return 0;
}

const LIVE_SAMPLE_KEYS = Object.freeze({
  moltjobs: ["marketplaceCompleted", "marketplaceJobs", "liquidityAgentsEverPaid"],
  x402stats: ["sellers_30d", "volume_usd_30d", "organic_sellers_30d"],
  smithery_mcp: ["registered_servers"],
});

function liveSourceChange(sourceId, key, beforeProjection, afterProjection) {
  const before = slotById(beforeProjection, sourceId);
  const after = slotById(afterProjection, sourceId);
  const beforeValue = metricValue(before, key);
  const afterValue = metricValue(after, key);
  const application = (afterProjection.lastApplications || []).find((entry) => entry.sourceId === sourceId) || null;
  return {
    sourceId,
    key,
    before: beforeValue,
    after: afterValue,
    population: (after.metrics.find((entry) => entry.key === key) || {}).population || null,
    summedWithPrior: false,
    pass: application && application.valueChanged ? "value_update" : application && application.applied ? "clock_update" : application && application.deduped ? "dedup" : "unchanged",
    activityLabel: after.activityLabel,
  };
}

function liveSourceRow(sourceId, beforeProjection, afterProjection) {
  const before = slotById(beforeProjection, sourceId);
  const after = slotById(afterProjection, sourceId);
  const application = (afterProjection.lastApplications || []).find((entry) => entry.sourceId === sourceId) || null;
  let secondPass = "unprojected";
  if (application) {
    if (application.deduped) secondPass = "dedup";
    else if (application.code === "KEPT_PRIOR") secondPass = "kept_prior";
    else if (application.refused) secondPass = "refused";
    else if (application.applied && application.valueChanged) secondPass = "value_update";
    else if (application.applied) secondPass = "clock_update";
    else secondPass = application.code || "unchanged";
  }
  return {
    sourceId,
    activityLabel: after.activityLabel,
    activityFigure: null,
    secondPass,
    valueChanged: application ? application.valueChanged === true : false,
    changes: changedMetrics(before, after),
    samples: sampleMetrics(after, LIVE_SAMPLE_KEYS[sourceId] || []),
    freshness: {
      state: after.freshness.state,
      fetchedAt: after.freshness.fetchedAt,
      providerTimestamp: after.freshness.providerTimestamp,
      ageMs: after.freshness.ageMs,
    },
    providerTimestampBefore: before.freshness.providerTimestamp,
    coverage: {
      state: after.coverage.state,
      presentPopulations: after.coverage.presentPopulations,
      missingPopulations: after.coverage.missingPopulations,
      okMetricCount: after.coverage.okMetricCount,
      envelopeComplete: after.coverage.envelopeCoverage ? after.coverage.envelopeCoverage.complete : null,
    },
    dedup: {
      duplicateCount: after.dedup.duplicateCount,
      consecutiveDuplicateCount: after.dedup.consecutiveDuplicateCount,
      acceptedCount: after.dedup.acceptedCount,
      shortIdentity: after.dedup.shortIdentity,
    },
  };
}

function sampleMetrics(slot, keys) {
  return keys.map((key) => {
    const metric = slot.metrics.find((entry) => entry.key === key);
    if (!metric) return { key, value: null, state: "missing", population: KEY_POPULATION[key] || null };
    return { key, value: metric.value, state: metric.state, unit: metric.unit, population: metric.population, window: metric.window };
  });
}

function changedMetrics(before, after) {
  const keys = [];
  for (const metric of before.metrics) if (!keys.includes(metric.key)) keys.push(metric.key);
  for (const metric of after.metrics) if (!keys.includes(metric.key)) keys.push(metric.key);
  const changes = [];
  for (const key of keys) {
    const left = before.metrics.find((entry) => entry.key === key);
    const right = after.metrics.find((entry) => entry.key === key);
    const leftValue = left ? left.value : null;
    const rightValue = right ? right.value : null;
    const leftState = left ? left.state : "missing";
    const rightState = right ? right.state : "missing";
    if (leftValue !== rightValue || leftState !== rightState) {
      const chosen = right || left;
      changes.push({
        key,
        before: leftValue,
        after: rightValue,
        population: chosen.population,
        unit: chosen.unit,
      });
    }
  }
  return changes;
}

if (invokedAsCli()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : "projection failed"}\n`);
    process.exitCode = 1;
  });
}
