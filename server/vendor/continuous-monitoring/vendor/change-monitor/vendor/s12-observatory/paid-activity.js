/**
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 SameDayDesk / Neomorphic LLC
 *
 * Paid-activity drilldown for /labs/agent-economy-observatory/.
 * Reconstructs from metric keys when paidActivity is absent (unpatched SDS).
 * Bounded ratios only when population and window align. Missing is not zero.
 * Named sources are not additive. Registry listings are not paid customers.
 */
import { SOURCE_IDS, namedSource, REFUSED_RATIO_CATALOG } from "./contract.js";

export const MOLTJOBS_PAID_KEYS = Object.freeze([
  "marketplaceJobs",
  "marketplaceCompleted",
  "marketplaceSettledVolumeUsdc",
  "marketplaceEmployers",
  "marketplaceFundedEmployers",
  "marketplaceCompletionRatio",
  "marketplaceFundedEmployerRatio",
  "liquidityRegisteredAgents",
  "liquidityAgentsEverPaid",
  "liquidityAgentsBidding30d",
  "platformProgramJobs",
  "platformProgramBudgetUsdc",
]);

export const RAW_PATHS = Object.freeze({
  jobCount: "data.totalJobs",
  completedCount: "data.totalCompleted",
  registeredAgents: "data.totalAgents",
  volumeUsdc: "data.totalVolumeUsdc",
  escrowDeposits: "data.escrowedUsdc",
  completionRatio: "data.totalCompleted / data.totalJobs",
  escrowToVolumeRatio: "data.escrowedUsdc / data.totalVolumeUsdc",
  completionSampleSize: "data.completionSampleSize",
  marketplaceJobs: "data.marketplace.jobs",
  marketplaceCompleted: "data.marketplace.completed",
  marketplaceSettledVolumeUsdc: "data.marketplace.settledVolumeUsdc",
  marketplaceEmployers: "data.marketplace.employers",
  marketplaceFundedEmployers: "data.marketplace.fundedEmployers",
  marketplaceCompletionRatio: "data.marketplace.completed / data.marketplace.jobs",
  marketplaceFundedEmployerRatio: "data.marketplace.fundedEmployers / data.marketplace.employers",
  liquidityRegisteredAgents: "data.liquidity.registeredAgents",
  liquidityAgentsEverPaid: "data.liquidity.agentsEverPaid",
  liquidityAgentsBidding30d: "data.liquidity.agentsBidding30d",
  platformProgramJobs: "data.platformPrograms[].jobs",
  platformProgramBudgetUsdc: "data.platformPrograms[].budgetUsdc",
  sellers_30d: "snapshot.sellers",
  organic_sellers_30d: "snapshot.organicSellers",
  volume_usd_30d: "snapshot.volumeUsd",
  organic_volume_usd_30d: "snapshot.organicVolumeUsd",
  registered_servers: "pagination.totalCount",
});

export const STATIC_REFUSED_RATIOS = REFUSED_RATIO_CATALOG;

const ALIGNED_RATIOS = Object.freeze([
  Object.freeze({
    key: "marketplaceCompletionRatio",
    numeratorKey: "marketplaceCompleted",
    denominatorKey: "marketplaceJobs",
    requirePopulation: "moltjobs_marketplace_ordinary_third_party",
    sourcePath: "data.marketplace.completed / data.marketplace.jobs",
  }),
  Object.freeze({
    key: "marketplaceFundedEmployerRatio",
    numeratorKey: "marketplaceFundedEmployers",
    denominatorKey: "marketplaceEmployers",
    requirePopulation: "moltjobs_marketplace_employers",
    sourcePath: "data.marketplace.fundedEmployers / data.marketplace.employers",
  }),
]);

const MISSING_STATES = new Set(["missing", "unavailable", "error", "source_error"]);

export function metricByKey(observation, key) {
  if (!observation || !Array.isArray(observation.metrics)) return null;
  return observation.metrics.find((entry) => entry && entry.key === key) || null;
}

export function observationFromSnapshot(snapshot, sourceId) {
  if (!snapshot || !Array.isArray(snapshot.observations)) return null;
  return snapshot.observations.find((entry) => entry && entry.sourceId === sourceId) || null;
}

export function ratioAlignmentOk(numerator, denominator, requirePopulation) {
  if (!numerator || !denominator) return false;
  if (numerator.state !== "ok" || denominator.state !== "ok") return false;
  if (numerator.value == null || denominator.value == null) return false;
  if (!numerator.population || !numerator.window || numerator.unit !== "count" || denominator.unit !== "count") return false;
  if (numerator.population !== denominator.population) return false;
  if (numerator.window !== denominator.window) return false;
  if (requirePopulation && numerator.population !== requirePopulation) return false;
  const den = asFiniteNumber(denominator.value);
  const num = asFiniteNumber(numerator.value);
  if (den == null || num == null || den <= 0 || num < 0 || !Number.isSafeInteger(den) || !Number.isSafeInteger(num)) return false;
  if (num > den) return false;
  return true;
}

export function alignedBoundedRatio(numerator, denominator, requirePopulation) {
  if (!numerator || !denominator || numerator.state === "missing" || denominator.state === "missing") {
    return { ok: false, state: "missing", value: null, alignment: "missing" };
  }
  if (numerator.state !== "ok" || denominator.state !== "ok") {
    return { ok: false, state: "contradictory", value: null, alignment: "operand_not_ok" };
  }
  if (!numerator.population || !numerator.window || numerator.unit !== "count" || denominator.unit !== "count"
      || numerator.population !== denominator.population || numerator.window !== denominator.window) {
    return { ok: false, state: "contradictory", value: null, alignment: "population_or_window_mismatch" };
  }
  if (requirePopulation && numerator.population !== requirePopulation) {
    return { ok: false, state: "contradictory", value: null, alignment: "population_or_window_mismatch" };
  }
  const den = asFiniteNumber(denominator.value);
  const num = asFiniteNumber(numerator.value);
  if (den == null || num == null || den < 0 || num < 0 || !Number.isSafeInteger(den) || !Number.isSafeInteger(num)) {
    return { ok: false, state: "contradictory", value: null, alignment: "non_numeric" };
  }
  if (den === 0) {
    return { ok: false, state: "contradictory", value: null, alignment: "zero_denominator" };
  }
  if (num > den) {
    return { ok: false, state: "contradictory", value: null, alignment: "subset_invariant_broken" };
  }
  return {
    ok: true,
    state: "ok",
    value: `${numerator.value}/${denominator.value}`,
    alignment: "same_population_same_window",
  };
}

export function missingNotZero(metric) {
  return displayMetricValue(metric || { state: "missing", value: null });
}

export function buildPaidActivityDrilldown(snapshot) {
  const moltjobs = observationFromSnapshot(snapshot, "moltjobs");
  const x402 = observationFromSnapshot(snapshot, "x402stats");
  const smithery = observationFromSnapshot(snapshot, "smithery_mcp");
  return {
    schemaVersion: snapshot && snapshot.schemaVersion ? snapshot.schemaVersion : null,
    fetchedAt: snapshot && snapshot.fetchedAt ? snapshot.fetchedAt : null,
    additivity: "not_additive",
    sources: SOURCE_IDS.map((id) => {
      if (id === "moltjobs") return moltjobsDrilldown(moltjobs);
      if (id === "x402stats") return x402Drilldown(x402);
      return smitheryDrilldown(smithery);
    }),
    refusedRatios: refusedFunnelMath(snapshot).ratios,
    crossSourceSum: refuseCrossSourceSum(snapshot),
    organicAsPaidCustomers: refuseOrganicAsPaidCustomers(snapshot),
    registryAsPaidDemand: refuseRegistryAsPaidDemand(snapshot),
  };
}

export function moltjobsDrilldown(observation) {
  const named = namedSource("moltjobs");
  const paid = observation && isPlainObject(observation.paidActivity) ? observation.paidActivity : null;
  const reconstructed = !paid;
  const groups = [
    group("totals_including_platform_programs", {
      rawPath: "data",
      population: "moltjobs_work_market",
      window: "unspecified_provider_snapshot",
      keys: ["jobCount", "completedCount", "registeredAgents", "volumeUsdc", "escrowDeposits", "completionRatio", "escrowToVolumeRatio", "completionSampleSize"],
      notes: (paid && paid.notes && paid.notes.totalsInclude) || "all job purposes, including platform programs",
      observation,
    }),
    group("marketplace_ordinary_third_party", {
      rawPath: "data.marketplace",
      population: "moltjobs_marketplace_ordinary_third_party",
      window: "unspecified_provider_snapshot",
      keys: ["marketplaceJobs", "marketplaceCompleted", "marketplaceSettledVolumeUsdc", "marketplaceCompletionRatio"],
      notes: (paid && paid.notes && paid.notes.marketplaceExcludes) || "Excludes PLATFORM_MARKETING and PLATFORM_REFERRAL.",
      observation,
    }),
    group("marketplace_employers", {
      rawPath: "data.marketplace",
      population: "moltjobs_marketplace_employers",
      window: "unspecified_provider_snapshot",
      keys: ["marketplaceEmployers", "marketplaceFundedEmployers", "marketplaceFundedEmployerRatio"],
      notes: "fundedEmployers is the subset that funded escrow. Not unique humans.",
      observation,
    }),
    group("liquidity_registered_agents", {
      rawPath: "data.liquidity.registeredAgents",
      population: "moltjobs_registered_agents",
      window: "unspecified_provider_snapshot",
      keys: ["liquidityRegisteredAgents"],
      notes: "All agent records. Not a conversion-funnel denominator.",
      observation,
    }),
    group("liquidity_agents_ever_paid", {
      rawPath: "data.liquidity.agentsEverPaid",
      population: "moltjobs_agents_ever_paid",
      window: "unspecified_provider_snapshot",
      keys: ["liquidityAgentsEverPaid"],
      notes: "Distinct agents that completed paid work. Not unique humans.",
      observation,
    }),
    group("liquidity_agents_bidding_30d", {
      rawPath: "data.liquidity.agentsBidding30d",
      population: "moltjobs_agents_bidding_30d",
      window: "30d",
      keys: ["liquidityAgentsBidding30d"],
      notes: "30-day bidding window. Not aligned with lifetime registeredAgents.",
      observation,
    }),
    group("platform_programs", {
      rawPath: "data.platformPrograms",
      population: "moltjobs_platform_programs",
      window: "unspecified_provider_snapshot",
      keys: ["platformProgramJobs", "platformProgramBudgetUsdc"],
      notes: "Promotion spend. Not ordinary marketplace demand.",
      observation,
    }),
  ];

  const paidKeyOk = MOLTJOBS_PAID_KEYS.some((key) => {
    const metric = metricByKey(observation, key);
    return metric && metric.state === "ok";
  });
  const available = paid ? Boolean(paid.available) : paidKeyOk;

  return {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    title: named ? named.title : "Work market",
    available,
    reconstructed,
    asOf: paid && paid.asOf ? paid.asOf : null,
    providerTimestamp: observation && observation.providerTimestamp ? observation.providerTimestamp : null,
    definitionsUrl: (paid && paid.definitionsUrl) || "https://moltjobs.io/docs/api#stats",
    definitionsUrlSource: paid && paid.definitionsUrl ? "envelope" : "static_contract",
    sourceSchemaVersion: paid && paid.sourceSchemaVersion != null ? paid.sourceSchemaVersion : null,
    coverage: observation && observation.coverage ? observation.coverage : null,
    window: observation && observation.coverage && observation.coverage.window
      ? observation.coverage.window
      : "unspecified_provider_snapshot",
    sample: sampleFrom(observation, "completionSampleSize"),
    notes: (paid && paid.notes) || {
      totalsInclude: "all job purposes, including platform programs",
      marketplaceExcludes: "PLATFORM_MARKETING and PLATFORM_REFERRAL",
    },
    groups,
    ratios: ratiosFor(observation, paid),
    refusedRatios: paid && Array.isArray(paid.refusedRatios)
      ? paid.refusedRatios.map((row) => ({ ...row, ok: false, value: null }))
      : STATIC_REFUSED_RATIOS.filter((row) => row.sourceId === "moltjobs").map((row) => ({ ...row, ok: false, value: null })),
    reconcile: (paid && paid.reconcile) || reconstructReconcile(observation),
    establishes: (paid && paid.establishes)
      || "Provider-split MoltJobs populations: totals (incl. programs), ordinary marketplace, liquidity agent sets, itemised platform programs.",
    doesNotEstablish: (paid && paid.doesNotEstablish) || [
      "repeat demand",
      "a registration-to-paid conversion funnel",
      "unique humans / private users",
      "organic third-party demand from totals",
      "SameDayDesk revenue",
      "cross-source totals",
    ],
    availability: observation ? observation.availability : "missing_from_snapshot",
  };
}

export function x402Drilldown(observation) {
  const paid = observation && isPlainObject(observation.paidActivity) ? observation.paidActivity : null;
  const windowMetric = metricByKey(observation, "window_days");
  return {
    sourceId: "x402stats",
    sourceKind: "settlement",
    available: false,
    reconstructed: !paid,
    asOf: paid && paid.asOf ? paid.asOf : null,
    providerTimestamp: observation && observation.providerTimestamp ? observation.providerTimestamp : null,
    window: windowMetric && windowMetric.state === "ok" ? `${windowMetric.value}d` : "30d",
    coverage: observation && observation.coverage ? observation.coverage : null,
    sample: null,
    groups: [
      group("provider_indexed_sellers", {
        rawPath: "snapshot.sellers",
        population: "provider_indexed_sellers",
        window: "30d",
        keys: ["sellers_30d"],
        notes: "Indexed sellers in the rolling window. Not unique customers.",
        observation,
      }),
      group("provider_heuristic_organic_sellers", {
        rawPath: "snapshot.organicSellers",
        population: "provider_heuristic_organic_sellers",
        window: "30d",
        keys: ["organic_sellers_30d"],
        notes: "Provider heuristic. Not paid customers.",
        observation,
      }),
    ],
    ratios: [],
    refusedRatios: paid && Array.isArray(paid.refusedRatios)
      ? paid.refusedRatios.map((row) => ({ ...row, ok: false, value: null }))
      : STATIC_REFUSED_RATIOS.filter((row) => row.sourceId === "x402stats").map((row) => ({ ...row, ok: false, value: null })),
    reason: (paid && paid.reason)
      || "no registered-vs-paid or marketplace-vs-program split; organic fields are provider heuristics",
    establishes: (paid && paid.establishes)
      || "Provider rolling-window settlement/protocol aggregates, including heuristic organic fields.",
    doesNotEstablish: (paid && paid.doesNotEstablish) || [
      "a paid-customer population distinct from indexed sellers",
      "repeat demand",
      "unique humans",
      "SameDayDesk settlement",
    ],
    availability: observation ? observation.availability : "missing_from_snapshot",
  };
}

export function smitheryDrilldown(observation) {
  const paid = observation && isPlainObject(observation.paidActivity) ? observation.paidActivity : null;
  return {
    sourceId: "smithery_mcp",
    sourceKind: "capability_discovery",
    available: false,
    reconstructed: !paid,
    asOf: paid && paid.asOf ? paid.asOf : null,
    providerTimestamp: observation && observation.providerTimestamp ? observation.providerTimestamp : null,
    window: "catalog_snapshot",
    coverage: observation && observation.coverage ? observation.coverage : null,
    sample: null,
    groups: [
      group("smithery_server_catalog", {
        rawPath: "pagination.totalCount",
        population: "smithery_server_catalog",
        window: "catalog_snapshot",
        keys: ["registered_servers"],
        notes: "Catalog registrations. Not paid customers or traffic.",
        observation,
      }),
    ],
    ratios: [],
    refusedRatios: paid && Array.isArray(paid.refusedRatios)
      ? paid.refusedRatios.map((row) => ({ ...row, ok: false, value: null }))
      : STATIC_REFUSED_RATIOS.filter((row) => row.sourceId === "smithery_mcp").map((row) => ({ ...row, ok: false, value: null })),
    reason: (paid && paid.reason)
      || "catalog registrations are not paid customers, traffic, or heartbeats",
    establishes: (paid && paid.establishes)
      || "Catalog registration count from Smithery servers pagination.totalCount.",
    doesNotEstablish: (paid && paid.doesNotEstablish) || [
      "paid customers",
      "active traffic",
      "runtime heartbeats",
      "repeat demand",
    ],
    availability: observation ? observation.availability : "missing_from_snapshot",
  };
}

export function refusedFunnelMath(snapshot) {
  const moltjobs = observationFromSnapshot(snapshot, "moltjobs");
  const x402 = observationFromSnapshot(snapshot, "x402stats");
  const smithery = observationFromSnapshot(snapshot, "smithery_mcp");
  const attempts = [];

  for (const spec of STATIC_REFUSED_RATIOS) {
    const observation = spec.sourceId === "moltjobs"
      ? moltjobs
      : spec.sourceId === "x402stats"
        ? x402
        : spec.sourceId === "smithery_mcp"
          ? smithery
          : null;
    const numerator = spec.sourceId === "cross_source"
      ? metricByKey(moltjobs, spec.numeratorKey)
      : spec.numeratorKey
        ? metricByKey(observation, spec.numeratorKey)
        : null;
    const denominator = spec.sourceId === "cross_source"
      ? metricByKey(x402, spec.denominatorKey)
      : spec.denominatorKey
        ? metricByKey(observation, spec.denominatorKey)
        : null;
    const aligned = spec.denominatorKey ? ratioAlignmentOk(numerator, denominator) : false;
    const row = {
      ...spec,
      aligned,
      ok: false,
      value: null,
      conversion: null,
      funnel: null,
      reason: spec.reason,
    };
    attempts.push(row);
  }

  return {
    refused: true,
    ok: false,
    value: null,
    conversion: null,
    funnel: null,
    ratios: attempts,
    attempts,
    refusedRatios: attempts,
    anyOkConversion: false,
    note: "These ratios are refused even when both counts are present. Presence of two numbers is not alignment.",
    reason: "Liquidity agent sets, totals vs marketplace, organic heuristics, and catalog registrations are different populations. This overlay does not emit a registration-to-paid conversion funnel.",
  };
}

export function refuseCrossSourceSum(_snapshot) {
  return {
    refused: true,
    total: null,
    figure: null,
    sum: null,
    sources: SOURCE_IDS.slice(),
    reason: "Named sources are not additive. This overlay does not emit a total agent economy figure or a cross-source paid-activity sum.",
  };
}

export function refuseRegistryAsPaidDemand(_snapshot) {
  return {
    refused: true,
    paidCustomers: null,
    traffic: null,
    heartbeats: null,
    reason: "Smithery pagination.totalCount is catalog registrations, not paid customers, traffic, or heartbeats.",
  };
}

export function refuseOrganicAsPaidCustomers(_snapshot) {
  return {
    refused: true,
    paidCustomers: null,
    conversion: null,
    reason: "x402stats organic_sellers_30d / organic_volume_usd_30d are provider heuristics, not paid customers.",
  };
}

export function buildOperatorDecision(snapshot) {
  const drilldown = buildPaidActivityDrilldown(snapshot);
  const moltjobs = observationFromSnapshot(snapshot, "moltjobs");
  const smithery = observationFromSnapshot(snapshot, "smithery_mcp");
  const registered = pickNumeric(moltjobs, ["liquidityRegisteredAgents", "registeredAgents"]);
  const everPaid = pickNumeric(moltjobs, ["liquidityAgentsEverPaid"]);
  const bidding = pickNumeric(moltjobs, ["liquidityAgentsBidding30d"]);
  const marketCompleted = pickNumeric(moltjobs, ["marketplaceCompleted"]);
  const funded = pickNumeric(moltjobs, ["marketplaceFundedEmployers"]);
  const settled = pickNumeric(moltjobs, ["marketplaceSettledVolumeUsdc"]);
  const catalog = pickNumeric(smithery, ["registered_servers"]);

  const evidence = {
    snapshotFetchedAt: snapshot && snapshot.fetchedAt ? snapshot.fetchedAt : null,
    moltjobsFetchedAt: moltjobs && moltjobs.fetchedAt ? moltjobs.fetchedAt : null,
    moltjobsProviderTimestamp: moltjobs && moltjobs.providerTimestamp ? moltjobs.providerTimestamp : null,
    moltjobsAvailability: moltjobs ? moltjobs.availability : "missing_from_snapshot",
    registeredAgents: registered,
    liquidityAgentsEverPaid: everPaid,
    liquidityAgentsBidding30d: bidding,
    marketplaceCompleted: marketCompleted,
    marketplaceFundedEmployers: funded,
    marketplaceSettledVolumeUsdc: settled,
    smitheryRegisteredServers: catalog,
    purchaseExecuted: false,
    bidExecuted: false,
    funnelMath: "refused",
    crossSourceSum: "refused",
  };

  const conclusions = {
    attentionIsNotPaidDemand: true,
    catalogIsNotPaidDemand: true,
    organicHeuristicIsNotPaidCustomers: true,
    sourcesAreNotAdditive: true,
  };

  if (!moltjobs || moltjobs.availability === "missing_from_snapshot") {
    return {
      status: "paid_activity_source_missing",
      action: "none",
      purchaseExecuted: false,
      bidExecuted: false,
      chosen: null,
      evidence,
      conclusions,
      drilldown,
      note: "The work-market envelope was not in this snapshot (capability_source_missing analogue). Missing is not zero. Do not treat catalog listings as paid demand. This page does not invent paid demand, bid, or execute a purchase. Retain evidence ids and timestamps if any exist.",
    };
  }
  if (moltjobs.availability === "unavailable" || moltjobs.availability === "error") {
    return {
      status: "paid_activity_source_unavailable",
      action: "none",
      purchaseExecuted: false,
      bidExecuted: false,
      chosen: null,
      evidence,
      conclusions,
      drilldown,
      note: "The work-market read failed or was unavailable (capability_source_unavailable analogue). That is not a zeroed paid-activity ledger. Do not bid or purchase from this page.",
    };
  }

  const paidSignalKeys = ["marketplaceFundedEmployers", "marketplaceCompleted", "marketplaceSettledVolumeUsdc", "liquidityAgentsEverPaid"];
  const paidSignals = [funded, marketCompleted, settled, everPaid];
  const anyPaidKeyPresent = paidSignalKeys.some((key) => metricByKey(moltjobs, key));
  const anyPaidOk = paidSignals.some((row) => row && row.state === "ok");

  if (!anyPaidKeyPresent || !anyPaidOk) {
    return {
      status: "paid_activity_missing",
      action: "retain_evidence_only",
      purchaseExecuted: false,
      bidExecuted: false,
      chosen: {
        sourceId: "moltjobs",
        kind: "paid_activity_populations",
        asOf: moltjobs.providerTimestamp || null,
      },
      evidence,
      conclusions,
      drilldown,
      note: "Marketplace funded employers, marketplace completed, settled volume, and agents-ever-paid are missing (not zero) on this envelope. Registered agents and catalog listings are not paid demand. Retain ids and timestamps. Do not bid or purchase from this page.",
    };
  }

  const sparse = isSparsePaidActivity({ registered, everPaid, marketCompleted, funded, settled });
  return {
    status: sparse ? "retain_evidence_sparse_paid_activity" : "retain_evidence_only",
    action: "retain_evidence_only",
    purchaseExecuted: false,
    bidExecuted: false,
    chosen: {
      sourceId: "moltjobs",
      kind: "paid_activity_populations",
      asOf: moltjobs.providerTimestamp || null,
    },
    evidence,
    conclusions,
    drilldown,
    note: sparse
      ? "At least one paid-activity count is zero or within the local low-count thresholds (funded employers ≤3, completions or ever-paid agents ≤10). This is not a comparison to registered agents. Attention is not paid demand. Those are different populations, not a conversion funnel. Catalog registrations are not paid customers. x402stats organic fields are heuristics. Retain ids and timestamps. Do not bid or purchase from this page."
      : "Paid-activity counts are shown in their own populations (ordinary marketplace vs totals vs liquidity). They do not establish repeat demand or unique humans. Catalog registrations remain catalog-only. Retain evidence. This page does not bid or execute a purchase.",
  };
}

function isSparsePaidActivity({ everPaid, marketCompleted, funded, settled }) {
  const paid = everPaid && everPaid.state === "ok" ? asFiniteNumber(everPaid.value) : null;
  const completed = marketCompleted && marketCompleted.state === "ok" ? asFiniteNumber(marketCompleted.value) : null;
  const fund = funded && funded.state === "ok" ? asFiniteNumber(funded.value) : null;
  const volume = settled && settled.state === "ok" ? asFiniteNumber(settled.value) : null;
  if (fund === 0 || completed === 0 || paid === 0 || volume === 0) return true;
  if (fund != null && fund <= 3) return true;
  if (completed != null && completed <= 10) return true;
  if (paid != null && paid <= 10) return true;
  return false;
}

function group(id, spec) {
  return {
    id,
    rawPath: spec.rawPath,
    population: spec.population,
    window: spec.window,
    notes: spec.notes,
    coverage: spec.observation && spec.observation.coverage ? spec.observation.coverage : null,
    metrics: spec.keys.map((key) => presentMetric(spec.observation, key)),
  };
}

function presentMetric(observation, key) {
  const metric = metricByKey(observation, key);
  if (!metric) {
    return {
      key,
      rawPath: RAW_PATHS[key] || null,
      state: "missing",
      value: null,
      unit: null,
      population: null,
      window: null,
      sample: null,
      display: displayMetricValue({ key, state: "missing", value: null }),
      sourcePath: RAW_PATHS[key] || null,
    };
  }
  if (ALIGNED_RATIOS.some(spec => spec.key === key)) {
    const computed = ratiosFor(observation).find(row => row.key === key);
    return { ...metric, rawPath: RAW_PATHS[key], value: computed.value,
      state: computed.state, display: computed.display, ratioAlignment: computed.alignment };
  }
  return {
    key: metric.key,
    rawPath: metric.sourcePath || RAW_PATHS[key] || null,
    state: metric.state,
    value: metric.value,
    unit: metric.unit,
    population: metric.population,
    window: metric.window,
    sample: metric.sample == null ? null : metric.sample,
    definition: metric.definition,
    display: displayMetricValue(metric),
    sourcePath: metric.sourcePath || RAW_PATHS[key] || null,
    ratioAlignment: metric.ratioAlignment || null,
    numeratorKey: metric.numeratorKey || null,
    denominatorKey: metric.denominatorKey || null,
  };
}

function ratiosFor(observation, _paid) {
  // Supplied derived fields cannot certify their own operands or alignment.
  return ALIGNED_RATIOS.map(spec => {
    const computed = alignedBoundedRatio(metricByKey(observation, spec.numeratorKey),
      metricByKey(observation, spec.denominatorKey), spec.requirePopulation);
    return {
      key: spec.key, numeratorKey: spec.numeratorKey, denominatorKey: spec.denominatorKey,
      alignment: computed.alignment, state: computed.state, value: computed.value,
      display: displayMetricValue({ state: computed.state, value: computed.value, unit: "ratio" }),
      rawPath: spec.sourcePath,
    };
  });
}

function reconstructReconcile(observation) {
  const total = metricByKey(observation, "jobCount");
  const market = metricByKey(observation, "marketplaceJobs");
  const programs = metricByKey(observation, "platformProgramJobs");
  const formula = "data.totalJobs = data.marketplace.jobs + sum(data.platformPrograms[].jobs)";
  if (!total || !market || !programs || total.state !== "ok" || market.state !== "ok" || programs.state !== "ok") {
    return {
      formula,
      observedTotalJobs: total && total.state === "ok" ? total.value : null,
      marketplaceJobs: market && market.state === "ok" ? market.value : null,
      platformProgramJobs: programs && programs.state === "ok" ? programs.value : null,
      composed: null,
      state: "missing",
    };
  }
  const composed = Number(market.value) + Number(programs.value);
  return {
    formula,
    observedTotalJobs: total.value,
    marketplaceJobs: market.value,
    platformProgramJobs: programs.value,
    composed,
    state: Number(total.value) === composed ? "ok" : "contradictory",
  };
}

function pickNumeric(observation, keys) {
  for (const key of keys) {
    const metric = metricByKey(observation, key);
    if (metric) {
      return {
        key,
        state: metric.state,
        value: metric.value,
        population: metric.population,
        window: metric.window,
        rawPath: metric.sourcePath || RAW_PATHS[key] || null,
      };
    }
  }
  return {
    key: keys[0],
    state: "missing",
    value: null,
    population: null,
    window: null,
    rawPath: RAW_PATHS[keys[0]] || null,
  };
}

function sampleFrom(observation, key) {
  const metric = metricByKey(observation, key);
  if (!metric || metric.state !== "ok") return null;
  return { key, value: metric.value, rawPath: metric.sourcePath || RAW_PATHS[key] || null };
}

function displayMetricValue(metric) {
  if (!metric) {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  const state = metric.state || "missing";
  if (state === "missing") {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  if (MISSING_STATES.has(state) && (metric.value == null || state !== "ok")) {
    if (metric.value == null || state === "unavailable" || state === "error" || state === "source_error") {
      return { text: state, numeric: null, invented: false };
    }
  }
  if (state !== "ok") {
    if (metric.value == null) return { text: state, numeric: null, invented: false };
    if (state === "contradictory") {
      return { text: "contradictory (not displayed as a ratio)", numeric: null, invented: false };
    }
  }
  if (metric.value == null) {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  return { text: formatScalar(metric.value, metric.unit), numeric: asFiniteNumber(metric.value), invented: false };
}

function formatScalar(value, unit) {
  if (unit === "USDC") return `${value} USDC`;
  if (unit === "USD" && (typeof value === "number" || typeof value === "string")) return `${value} USD`;
  if (unit === "ratio" && typeof value === "number") return String(value);
  return String(value);
}

function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    if (value.includes("/")) {
      const [n, d] = value.split("/");
      const num = Number(n);
      const den = Number(d);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
    }
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export const refuseFunnelMath = refusedFunnelMath;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
