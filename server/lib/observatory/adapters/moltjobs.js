/**
 * Work-market adapter: wraps S49 MoltJobs capture→normalize into the
 * observatory envelope, then adds source-faithful marketplace / liquidity /
 * platform-program populations from the same /v1/stats body.
 *
 * Totals include platform programs. Marketplace excludes PLATFORM_MARKETING
 * and PLATFORM_REFERRAL. Liquidity agent sets are distinct populations, not
 * a conversion funnel. Missing is not zero. Sources are not additive.
 */

import {
  MOLTJOBS_PROVIDER_ID,
  MOLTJOBS_STATS_SOURCE_URL,
  moltjobsCaptureToLabelledPayload,
} from "../../market-observations/moltjobs-stats-adapter.js";
import { normalizeMarketStats } from "../../market-observations/normalize-market-stats.js";
import {
  WITHHELD_CONCLUSIONS,
  boundRawExcerpt,
  captureErrorRecord,
  classifyFetchAvailability,
  classifyProviderTimestamp,
  createEnvelope,
  createMetric,
  defaultCoverage,
  hasOwn,
  inspectNumeric,
  isPlainObject,
} from "../contract.js";

export const sourceId = "moltjobs";
export const sourceKind = "work_market";
export const upstreamUrl = MOLTJOBS_STATS_SOURCE_URL;
export const evidenceClass = "provider_reported_aggregate";

const WINDOW = "unspecified_provider_snapshot";
const POPULATION = "moltjobs_work_market";
const MARKETPLACE_POPULATION = "moltjobs_marketplace_ordinary_third_party";
const EMPLOYER_POPULATION = "moltjobs_marketplace_employers";
const REGISTERED_POPULATION = "moltjobs_registered_agents";
const EVER_PAID_POPULATION = "moltjobs_agents_ever_paid";
const BIDDING_30D_POPULATION = "moltjobs_agents_bidding_30d";
const PROGRAM_POPULATION = "moltjobs_platform_programs";
const WINDOW_30D = "30d";

const SOURCE_WITHHELD = Object.freeze([
  ...WITHHELD_CONCLUSIONS,
  "repeat_demand",
  "conversion_funnel",
  "paid_demand_population",
]);

const DEFINITIONS = Object.freeze({
  jobCount: "Provider-reported data.totalJobs mapped to jobCount. Totals include all job purposes, including platform programs. Work-market snapshot, not traffic.",
  completedCount: "Provider-reported data.totalCompleted. Includes platform programs. Not delivery proof for SameDayDesk.",
  registeredAgents: "Provider-reported data.totalAgents. Registered agents, not active traffic or paid customers.",
  volumeUsdc: "Provider-reported data.totalVolumeUsdc. Budget of every completed job, including platform programs. Not SameDayDesk revenue.",
  escrowDeposits: "Provider-reported data.escrowedUsdc. Not settled SameDayDesk funds.",
  avgCompletionTimeMs: "Provider-reported average completion time in milliseconds. Sample is completionSampleSize, not marketplace.completed.",
  medianCompletionTimeMs: "Provider-reported median completion time in milliseconds. Sample is completionSampleSize, not marketplace.completed.",
  avgTimeToFillMs: "Provider-reported average time-to-fill in milliseconds.",
  medianTimeToFillMs: "Provider-reported median time-to-fill in milliseconds.",
  completionSampleSize: "Provider-reported data.completionSampleSize. Jobs behind the timing averages; excludes jobs with no accepted bid. Not the marketplace completed count.",
  disputeRate: "Provider-reported data.disputeRate. Disputes ÷ all jobs. Not a SameDayDesk quality score.",
  completionRatio: "Derived completedCount/jobCount when both are ok on the totals population and same window. Totals include platform programs. Not paid conversion.",
  escrowToVolumeRatio: "Derived escrowDeposits/volumeUsdc when both are ok on the same window.",
  marketplaceJobs: "Provider-reported data.marketplace.jobs. Ordinary third-party jobs. Excludes PLATFORM_MARKETING and PLATFORM_REFERRAL.",
  marketplaceCompleted: "Provider-reported data.marketplace.completed. Ordinary jobs that settled. Excludes platform marketing and referral.",
  marketplaceSettledVolumeUsdc: "Provider-reported data.marketplace.settledVolumeUsdc. USDC released on ordinary work. Excludes platform marketing and referral.",
  marketplaceEmployers: "Provider-reported data.marketplace.employers. Distinct accounts that posted ordinary work. Excludes platform programs. Not unique humans.",
  marketplaceFundedEmployers: "Provider-reported data.marketplace.fundedEmployers. Ordinary employers who actually funded escrow. Subset of marketplace.employers. Not unique humans.",
  marketplaceCompletionRatio: "Bounded ratio marketplace.completed / marketplace.jobs when both are ok on moltjobs_marketplace_ordinary_third_party and the same snapshot window. Not repeat demand.",
  marketplaceFundedEmployerRatio: "Bounded ratio marketplace.fundedEmployers / marketplace.employers when both are ok on moltjobs_marketplace_employers and the same snapshot window. Funded is the official subset that funded escrow.",
  liquidityRegisteredAgents: "Provider-reported data.liquidity.registeredAgents. All agent records. Distinct from agentsEverPaid and agentsBidding30d. Not a funnel denominator.",
  liquidityAgentsEverPaid: "Provider-reported data.liquidity.agentsEverPaid. Distinct agents that completed paid work. Excludes agents that only bid. Not unique humans and not a conversion from registrations.",
  liquidityAgentsBidding30d: "Provider-reported data.liquidity.agentsBidding30d. Distinct agents that bid in 30 days. 30d window; not comparable to lifetime registeredAgents as a conversion rate.",
  platformProgramJobs: "Sum of data.platformPrograms[].jobs. Promotion / platform-program jobs, not ordinary marketplace demand.",
  platformProgramBudgetUsdc: "Sum of data.platformPrograms[].budgetUsdc. Itemised promotion spend, not ordinary marketplace volume.",
});

const OBSERVED_KEYS = Object.freeze([
  "jobCount",
  "completedCount",
  "registeredAgents",
  "volumeUsdc",
  "escrowDeposits",
  "avgCompletionTimeMs",
  "medianCompletionTimeMs",
  "avgTimeToFillMs",
  "medianTimeToFillMs",
  "completionSampleSize",
  "disputeRate",
  "completionRatio",
  "escrowToVolumeRatio",
]);

const PAID_ACTIVITY_KEYS = Object.freeze([
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

const CORE_KEYS = Object.freeze([
  "jobCount",
  "completedCount",
  "registeredAgents",
  "volumeUsdc",
  "escrowDeposits",
]);

const MARKETPLACE_SPECS = Object.freeze([
  Object.freeze({
    key: "marketplaceJobs",
    path: ["marketplace", "jobs"],
    kind: "integer",
    unit: "count",
    population: MARKETPLACE_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "marketplaceCompleted",
    path: ["marketplace", "completed"],
    kind: "integer",
    unit: "count",
    population: MARKETPLACE_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "marketplaceSettledVolumeUsdc",
    path: ["marketplace", "settledVolumeUsdc"],
    kind: "decimal",
    unit: "USDC",
    population: MARKETPLACE_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "marketplaceEmployers",
    path: ["marketplace", "employers"],
    kind: "integer",
    unit: "count",
    population: EMPLOYER_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "marketplaceFundedEmployers",
    path: ["marketplace", "fundedEmployers"],
    kind: "integer",
    unit: "count",
    population: EMPLOYER_POPULATION,
    window: WINDOW,
  }),
]);

const LIQUIDITY_SPECS = Object.freeze([
  Object.freeze({
    key: "liquidityRegisteredAgents",
    path: ["liquidity", "registeredAgents"],
    kind: "integer",
    unit: "count",
    population: REGISTERED_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "liquidityAgentsEverPaid",
    path: ["liquidity", "agentsEverPaid"],
    kind: "integer",
    unit: "count",
    population: EVER_PAID_POPULATION,
    window: WINDOW,
  }),
  Object.freeze({
    key: "liquidityAgentsBidding30d",
    path: ["liquidity", "agentsBidding30d"],
    kind: "integer",
    unit: "count",
    population: BIDDING_30D_POPULATION,
    window: WINDOW_30D,
  }),
]);

const REFUSED_RATIOS = Object.freeze([
  Object.freeze({
    key: "everPaid_over_registered",
    numeratorKey: "liquidityAgentsEverPaid",
    denominatorKey: "liquidityRegisteredAgents",
    reason: "data.liquidity.agentsEverPaid and data.liquidity.registeredAgents are different populations. Official docs forbid mixing them as a conversion funnel.",
  }),
  Object.freeze({
    key: "bidding30d_over_registered",
    numeratorKey: "liquidityAgentsBidding30d",
    denominatorKey: "liquidityRegisteredAgents",
    reason: "agentsBidding30d is a 30-day window; registeredAgents is the lifetime agent-record population.",
  }),
  Object.freeze({
    key: "everPaid_over_bidding30d",
    numeratorKey: "liquidityAgentsEverPaid",
    denominatorKey: "liquidityAgentsBidding30d",
    reason: "Lifetime ever-paid vs 30-day bidding window. Populations and windows do not align.",
  }),
  Object.freeze({
    key: "marketplaceCompleted_over_totalCompleted",
    numeratorKey: "marketplaceCompleted",
    denominatorKey: "completedCount",
    reason: "marketplace.completed excludes platform programs; data.totalCompleted includes them.",
  }),
  Object.freeze({
    key: "marketplaceSettledVolume_over_totalVolume",
    numeratorKey: "marketplaceSettledVolumeUsdc",
    denominatorKey: "volumeUsdc",
    reason: "marketplace.settledVolumeUsdc is ordinary work; data.totalVolumeUsdc includes platform programs.",
  }),
  Object.freeze({
    key: "marketplaceJobs_over_totalJobs_as_conversion",
    numeratorKey: "marketplaceJobs",
    denominatorKey: "jobCount",
    reason: "Totals vs marketplace is a composition (programs + ordinary), not a conversion from attention to paid demand. See paidActivity.reconcile.",
  }),
]);

export const metricSpecs = Object.freeze(
  [...OBSERVED_KEYS, ...PAID_ACTIVITY_KEYS].map((key) => Object.freeze({
    key,
    unit: unitFor(key),
    definition: DEFINITIONS[key],
    population: populationFor(key),
    window: windowForKey(key),
  })),
);

export const descriptor = Object.freeze({
  sourceId,
  sourceKind,
  upstreamUrl,
  evidenceClass,
  establishes:
    "Provider-reported MoltJobs /v1/stats aggregates, split into totals (including platform programs), ordinary marketplace work, liquidity agent sets, and itemised platform programs for one snapshot.",
  doesNotEstablish: Object.freeze([
    "agent traffic",
    "unique customers",
    "organic demand",
    "repeat demand",
    "a registration-to-paid conversion funnel",
    "SameDayDesk revenue",
    "settlement",
    "cross-market totals",
  ]),
  withheldConclusions: SOURCE_WITHHELD,
  notes:
    "Compatible with /api/market-observations/moltjobs-stats. Marketplace excludes PLATFORM_MARKETING and PLATFORM_REFERRAL. Liquidity populations are not a funnel. Missing metrics stay null, not zero.",
  metricKeys: Object.freeze([...OBSERVED_KEYS, ...PAID_ACTIVITY_KEYS]),
});

export function observe(capture, ctx = {}) {
  const labelled = moltjobsCaptureToLabelledPayload({
    providerId: MOLTJOBS_PROVIDER_ID,
    fetchedAt: capture.fetchedAt ?? null,
    sourceUrl: capture.sourceUrl ?? upstreamUrl,
    httpStatus: capture.httpStatus ?? null,
    body: capture.body,
    error: capture.error ?? null,
  });
  const observation = normalizeMarketStats(labelled);
  const fetchedAt = observation.fetchedAt ?? capture.fetchedAt ?? null;
  const record = rawStatsRecord(capture.body);
  const providerTimestampRaw = firstText(
    record && record.asOf,
    observation.sourceTime,
  );
  const picked = classifyProviderTimestamp(providerTimestampRaw, fetchedAt, ctx.nowMs);
  const fetchAvailability = classifyFetchAvailability(capture);
  const snapshotWindow = windowFromBody(record) || windowFromBody(labelled.body) || WINDOW;

  const metrics = OBSERVED_KEYS.map((key) => {
    const src = observation.metricsByKey ? observation.metricsByKey[key] : null;
    const state = src && src.state ? src.state : (fetchAvailability || "missing");
    return createMetric({
      key,
      value: src ? src.value : null,
      unit: src && src.unit ? src.unit : unitFor(key),
      state,
      definition: DEFINITIONS[key],
      population: POPULATION,
      window: snapshotWindow,
      sourcePath: sourcePathForExisting(key),
    });
  });

  const paid = buildPaidActivity(record, {
    fetchAvailability,
    totalsJobCount: metrics.find((entry) => entry.key === "jobCount") || null,
    totalsCompleted: metrics.find((entry) => entry.key === "completedCount") || null,
    totalsVolume: metrics.find((entry) => entry.key === "volumeUsdc") || null,
    totalsRegistered: metrics.find((entry) => entry.key === "registeredAgents") || null,
    snapshotWindow,
  });
  metrics.push(...paid.metrics);

  const availability = resolveAvailability({
    fetchAvailability,
    observationAvailability: observation.availability,
    providerTimestampState: picked.state,
    metrics,
  });

  const errors = [];
  const warnings = [];
  const capturedError = captureErrorRecord(capture);
  if (capturedError) errors.push(capturedError);
  else if (observation.error) errors.push(observation.error);
  if (picked.state === "stale") {
    warnings.push({
      code: "stale_provider_timestamp",
      message: "provider timestamp is older than the observatory stale window",
    });
  } else if (picked.state === "missing") {
    warnings.push({
      code: "missing_provider_timestamp",
      message: "provider payload did not include a usable timestamp",
    });
  } else if (picked.state === "invalid") {
    warnings.push({
      code: "invalid_provider_timestamp",
      message: "provider timestamp was present but not a usable clock",
    });
  }
  for (const warning of paid.warnings) warnings.push(warning);
  for (const metric of metrics) {
    if (metric.state !== "ok") {
      warnings.push({
        code: metric.state,
        metric: metric.key,
        message: `${metric.key} is ${metric.state}`,
      });
    }
  }

  const coverageNotes = [
    "Single MoltJobs stats snapshot. Totals include platform programs. Marketplace excludes PLATFORM_MARKETING and PLATFORM_REFERRAL.",
    "Liquidity agent sets are distinct populations, not a conversion funnel.",
    "Not agent traffic, unique humans, repeat demand, or SameDayDesk revenue.",
  ].join(" ");

  return createEnvelope({
    sourceId,
    sourceKind,
    upstreamUrl,
    fetchedAt,
    providerTimestamp: picked.timestamp,
    providerTimestampState: picked.state,
    availability,
    httpStatus: observation.httpStatus ?? capture.httpStatus ?? null,
    cache: capture.cache,
    metrics,
    coverage: defaultCoverage({
      kind: "point_snapshot",
      population: POPULATION,
      window: snapshotWindow,
      notes: coverageNotes,
    }),
    errors,
    warnings,
    evidenceClass,
    rawSourceLink: upstreamUrl,
    withheldConclusions: SOURCE_WITHHELD,
    rawExcerpt: boundRawExcerpt(capture.body ?? capture.rawText),
    paidActivity: paid.block,
  });
}

export function buildPaidActivity(record, ctx = {}) {
  const snapshotWindow = ctx.snapshotWindow || windowFromBody(record) || WINDOW;
  const warnings = [];
  const fetchState = ctx.fetchAvailability || null;
  const asOf = record && typeof record.asOf === "string" ? record.asOf : null;
  const definitionsUrl = record && typeof record.definitionsUrl === "string" ? record.definitionsUrl : null;
  const sourceSchemaVersion = record && record.schemaVersion != null ? record.schemaVersion : null;
  const notes = isPlainObject(record && record.notes) ? {
    totalsInclude: typeof record.notes.totalsInclude === "string" ? record.notes.totalsInclude : null,
    marketplaceExcludes: typeof record.notes.marketplaceExcludes === "string" ? record.notes.marketplaceExcludes : null,
  } : { totalsInclude: null, marketplaceExcludes: null };

  const unavailableState = fetchState === "unavailable" ? "unavailable" : (fetchState || null);

  const sourceMetrics = [];
  for (const spec of [...MARKETPLACE_SPECS, ...LIQUIDITY_SPECS]) {
    sourceMetrics.push(metricFromPath(record, { ...spec, window: spec.window === WINDOW ? snapshotWindow : spec.window }, unavailableState));
  }

  const programs = record && Array.isArray(record.platformPrograms) ? record.platformPrograms : null;
  sourceMetrics.push(sumProgramMetric({
    key: "platformProgramJobs",
    field: "jobs",
    kind: "integer",
    unit: "count",
    programs,
    unavailableState,
    window: snapshotWindow,
  }));
  sourceMetrics.push(sumProgramMetric({
    key: "platformProgramBudgetUsdc",
    field: "budgetUsdc",
    kind: "decimal",
    unit: "USDC",
    programs,
    unavailableState,
    window: snapshotWindow,
  }));

  const byKey = Object.create(null);
  for (const metric of sourceMetrics) byKey[metric.key] = metric;

  const marketplaceCompletionRatio = alignedRatio({
    key: "marketplaceCompletionRatio",
    numerator: byKey.marketplaceCompleted,
    denominator: byKey.marketplaceJobs,
    population: MARKETPLACE_POPULATION,
    window: snapshotWindow,
    subsetInvariant: true,
    definition: DEFINITIONS.marketplaceCompletionRatio,
    sourcePath: "data.marketplace.completed / data.marketplace.jobs",
  });
  const marketplaceFundedEmployerRatio = alignedRatio({
    key: "marketplaceFundedEmployerRatio",
    numerator: byKey.marketplaceFundedEmployers,
    denominator: byKey.marketplaceEmployers,
    population: EMPLOYER_POPULATION,
    window: snapshotWindow,
    subsetInvariant: true,
    definition: DEFINITIONS.marketplaceFundedEmployerRatio,
    sourcePath: "data.marketplace.fundedEmployers / data.marketplace.employers",
  });

  const metrics = [
    ...sourceMetrics,
    marketplaceCompletionRatio,
    marketplaceFundedEmployerRatio,
  ];
  for (const metric of metrics) byKey[metric.key] = metric;

  if (record && !isPlainObject(record.marketplace) && !unavailableState) {
    warnings.push({
      code: "marketplace_missing",
      message: "data.marketplace was absent. Marketplace paid-activity metrics are missing, not zero.",
    });
  }
  if (record && !isPlainObject(record.liquidity) && !unavailableState) {
    warnings.push({
      code: "liquidity_missing",
      message: "data.liquidity was absent. Liquidity populations are missing, not zero.",
    });
  }

  const totalsRegistered = ctx.totalsRegistered;
  const liquidityRegistered = byKey.liquidityRegisteredAgents;
  if (
    totalsRegistered && totalsRegistered.state === "ok"
    && liquidityRegistered && liquidityRegistered.state === "ok"
    && totalsRegistered.value !== liquidityRegistered.value
  ) {
    warnings.push({
      code: "registered_agents_path_mismatch",
      message: "data.totalAgents and data.liquidity.registeredAgents disagree. Both paths are kept; neither is rewritten.",
    });
  }

  const reconcile = buildReconcile({
    totalsJobCount: ctx.totalsJobCount,
    marketplaceJobs: byKey.marketplaceJobs,
    platformProgramJobs: byKey.platformProgramJobs,
  });
  if (reconcile.state === "contradictory") {
    warnings.push({
      code: "totals_reconcile_mismatch",
      message: "data.totalJobs does not equal data.marketplace.jobs + sum(data.platformPrograms[].jobs). Official docs: the endpoint is wrong — not a conversion reading.",
    });
  }

  const available = Boolean(
    record
    && (isPlainObject(record.marketplace) || isPlainObject(record.liquidity) || Array.isArray(record.platformPrograms)),
  );

  const block = {
    sourceId,
    available,
    asOf,
    definitionsUrl: definitionsUrl || "https://moltjobs.io/docs/api#stats",
    sourceSchemaVersion,
    notes,
    populations: [
      {
        id: POPULATION,
        rawPath: "data",
        window: snapshotWindow,
        notes: notes.totalsInclude || "all job purposes, including platform programs",
        metricKeys: [...OBSERVED_KEYS],
      },
      {
        id: MARKETPLACE_POPULATION,
        rawPath: "data.marketplace",
        window: snapshotWindow,
        notes: notes.marketplaceExcludes || "PLATFORM_MARKETING and PLATFORM_REFERRAL",
        metricKeys: [
          "marketplaceJobs",
          "marketplaceCompleted",
          "marketplaceSettledVolumeUsdc",
          "marketplaceCompletionRatio",
        ],
      },
      {
        id: EMPLOYER_POPULATION,
        rawPath: "data.marketplace",
        window: snapshotWindow,
        notes: "Ordinary employers. fundedEmployers is the subset that funded escrow.",
        metricKeys: ["marketplaceEmployers", "marketplaceFundedEmployers", "marketplaceFundedEmployerRatio"],
      },
      {
        id: REGISTERED_POPULATION,
        rawPath: "data.liquidity.registeredAgents",
        window: snapshotWindow,
        notes: "All agent records. Not a conversion-funnel denominator.",
        metricKeys: ["liquidityRegisteredAgents"],
      },
      {
        id: EVER_PAID_POPULATION,
        rawPath: "data.liquidity.agentsEverPaid",
        window: snapshotWindow,
        notes: "Distinct agents that completed paid work. Not unique humans.",
        metricKeys: ["liquidityAgentsEverPaid"],
      },
      {
        id: BIDDING_30D_POPULATION,
        rawPath: "data.liquidity.agentsBidding30d",
        window: WINDOW_30D,
        notes: "Distinct agents that bid in 30 days. Window does not align with lifetime registeredAgents.",
        metricKeys: ["liquidityAgentsBidding30d"],
      },
      {
        id: PROGRAM_POPULATION,
        rawPath: "data.platformPrograms",
        window: snapshotWindow,
        notes: "Promotion spend, itemised by purpose. Not ordinary marketplace work.",
        metricKeys: ["platformProgramJobs", "platformProgramBudgetUsdc"],
      },
    ],
    ratios: [
      {
        key: marketplaceCompletionRatio.key,
        numeratorKey: "marketplaceCompleted",
        denominatorKey: "marketplaceJobs",
        alignment: marketplaceCompletionRatio.ratioAlignment || null,
        state: marketplaceCompletionRatio.state,
        value: marketplaceCompletionRatio.value,
      },
      {
        key: marketplaceFundedEmployerRatio.key,
        numeratorKey: "marketplaceFundedEmployers",
        denominatorKey: "marketplaceEmployers",
        alignment: marketplaceFundedEmployerRatio.ratioAlignment || null,
        state: marketplaceFundedEmployerRatio.state,
        value: marketplaceFundedEmployerRatio.value,
      },
    ],
    refusedRatios: REFUSED_RATIOS.map((entry) => ({ ...entry })),
    reconcile,
    establishes:
      "Provider-split MoltJobs populations: totals (including platform programs), ordinary marketplace work, liquidity agent sets, and itemised platform programs at asOf.",
    doesNotEstablish: [
      "repeat demand",
      "a registration-to-paid conversion funnel",
      "unique humans / private users",
      "organic third-party demand from totals",
      "SameDayDesk revenue",
      "cross-source totals",
    ],
  };

  return { metrics, warnings, block };
}

function metricFromPath(record, spec, unavailableState) {
  const sourcePath = `data.${spec.path.join(".")}`;
  if (unavailableState) {
    return createMetric({
      key: spec.key,
      value: null,
      unit: spec.unit,
      state: unavailableState === "unavailable" ? "unavailable" : "error",
      definition: DEFINITIONS[spec.key],
      population: spec.population,
      window: spec.window,
      sourcePath,
    });
  }
  const raw = getNested(record, spec.path);
  const inspected = raw === undefined
    ? { state: "missing", value: null }
    : inspectNumeric(raw, spec.kind);
  return createMetric({
    key: spec.key,
    value: inspected.value,
    unit: spec.unit,
    state: inspected.state,
    definition: DEFINITIONS[spec.key],
    population: spec.population,
    window: spec.window,
    sourcePath,
    evidenceClass,
  });
}

function sumProgramMetric({ key, field, kind, unit, programs, unavailableState, window = WINDOW }) {
  const sourcePath = `data.platformPrograms[].${field}`;
  if (unavailableState) {
    return createMetric({
      key,
      value: null,
      unit,
      state: unavailableState === "unavailable" ? "unavailable" : "error",
      definition: DEFINITIONS[key],
      population: PROGRAM_POPULATION,
      window,
      sourcePath,
    });
  }
  if (!Array.isArray(programs)) {
    return createMetric({
      key,
      value: null,
      unit,
      state: "missing",
      definition: DEFINITIONS[key],
      population: PROGRAM_POPULATION,
      window,
      sourcePath,
    });
  }
  if (programs.length === 0) {
    return createMetric({
      key,
      value: 0,
      unit,
      state: "ok",
      definition: DEFINITIONS[key],
      population: PROGRAM_POPULATION,
      window,
      sourcePath,
      evidenceClass,
    });
  }
  let sum = 0n;
  let scale = 0;
  for (const row of programs) {
    if (!isPlainObject(row) || !hasOwn(row, field)) {
      return createMetric({
        key,
        value: null,
        unit,
        state: "missing",
        definition: DEFINITIONS[key],
        population: PROGRAM_POPULATION,
        window,
        sourcePath,
      });
    }
    const inspected = inspectNumeric(row[field], kind);
    if (inspected.state !== "ok") {
      return createMetric({
        key,
        value: null,
        unit,
        state: inspected.state,
        definition: DEFINITIONS[key],
        population: PROGRAM_POPULATION,
        window,
        sourcePath,
      });
    }
    const text = String(inspected.value);
    if (!/^\d+(?:\.\d+)?$/.test(text)) {
      return createMetric({
        key,
        value: null,
        unit,
        state: "invalid",
        definition: DEFINITIONS[key],
        population: PROGRAM_POPULATION,
        window,
        sourcePath,
      });
    }
    const [whole, fraction = ""] = text.split(".");
    const nextScale = Math.max(scale, fraction.length);
    sum = sum * 10n ** BigInt(nextScale - scale)
      + BigInt(whole + fraction) * 10n ** BigInt(nextScale - fraction.length);
    scale = nextScale;
  }
  const digits = sum.toString().padStart(scale + 1, "0");
  const exact = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "") : digits;
  const checked = inspectNumeric(exact, kind);
  const value = checked.state === "ok"
    ? (String(Number(exact)) === exact && Number.isSafeInteger(Number(exact)) ? Number(exact) : checked.value)
    : null;
  return createMetric({
    key,
    value,
    unit,
    state: checked.state,
    definition: DEFINITIONS[key],
    population: PROGRAM_POPULATION,
    window,
    sourcePath,
    evidenceClass,
  });
}

function alignedRatio({
  key,
  numerator,
  denominator,
  population,
  window,
  subsetInvariant,
  definition,
  sourcePath,
}) {
  const base = {
    key,
    unit: "ratio",
    definition,
    population,
    window,
    sourcePath,
    numeratorKey: numerator ? numerator.key : null,
    denominatorKey: denominator ? denominator.key : null,
    evidenceClass,
  };
  if (!numerator || !denominator) {
    return createMetric({ ...base, value: null, state: "missing", ratioAlignment: "missing" });
  }
  if (numerator.state === "missing" || denominator.state === "missing") {
    return createMetric({ ...base, value: null, state: "missing", ratioAlignment: "missing" });
  }
  if (numerator.state !== "ok" || denominator.state !== "ok") {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "operand_not_ok",
    });
  }
  if (numerator.population !== denominator.population || numerator.window !== denominator.window) {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "population_or_window_mismatch",
    });
  }
  if (numerator.population !== population || numerator.window !== window) {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "population_or_window_mismatch",
    });
  }
  const denNumeric = asFiniteNumber(denominator.value);
  const numNumeric = asFiniteNumber(numerator.value);
  if (denNumeric == null || numNumeric == null) {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "non_numeric",
    });
  }
  if (denNumeric === 0) {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "zero_denominator",
    });
  }
  if (subsetInvariant && numNumeric > denNumeric) {
    return createMetric({
      ...base,
      value: null,
      state: "contradictory",
      ratioAlignment: "subset_invariant_broken",
    });
  }
  return createMetric({
    ...base,
    value: `${numerator.value}/${denominator.value}`,
    state: "ok",
    ratioAlignment: "same_population_same_window",
  });
}

function buildReconcile({ totalsJobCount, marketplaceJobs, platformProgramJobs }) {
  const formula = "data.totalJobs = data.marketplace.jobs + sum(data.platformPrograms[].jobs)";
  const observed = totalsJobCount && totalsJobCount.state === "ok" ? totalsJobCount.value : null;
  const market = marketplaceJobs && marketplaceJobs.state === "ok" ? marketplaceJobs.value : null;
  const programs = platformProgramJobs && platformProgramJobs.state === "ok" ? platformProgramJobs.value : null;
  if (observed == null || market == null || programs == null) {
    return {
      formula,
      observedTotalJobs: observed,
      marketplaceJobs: market,
      platformProgramJobs: programs,
      composed: null,
      state: "missing",
    };
  }
  const composed = Number(market) + Number(programs);
  const match = Number(observed) === composed;
  return {
    formula,
    observedTotalJobs: observed,
    marketplaceJobs: market,
    platformProgramJobs: programs,
    composed,
    state: match ? "ok" : "contradictory",
  };
}

function resolveAvailability({
  fetchAvailability,
  observationAvailability,
  providerTimestampState,
  metrics,
}) {
  if (fetchAvailability) return fetchAvailability;
  if (observationAvailability === "source_error") return "error";
  if (observationAvailability === "unavailable") return "unavailable";
  if (providerTimestampState === "stale") return "stale";
  const core = metrics.filter((metric) => CORE_KEYS.includes(metric.key));
  const okCount = core.filter((metric) => metric.state === "ok").length;
  const presentBad = core.filter((metric) => metric.state !== "ok" && metric.state !== "missing").length;
  const missing = core.filter((metric) => metric.state === "missing").length;
  if (okCount === 0) return "error";
  if (presentBad > 0 || missing > 0) return "partial";
  return "ok";
}

function rawStatsRecord(body) {
  if (!isPlainObject(body)) return null;
  if (isPlainObject(body.data)) {
    const data = body.data;
    if (
      hasOwn(data, "marketplace")
      || hasOwn(data, "liquidity")
      || hasOwn(data, "platformPrograms")
      || hasOwn(data, "totalJobs")
      || hasOwn(data, "asOf")
    ) {
      return data;
    }
  }
  return body;
}

function getNested(record, path) {
  let current = record;
  for (const key of path) {
    if (!isPlainObject(current) || !hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function windowFromBody(body) {
  if (!isPlainObject(body)) return null;
  if (typeof body.window === "string" && body.window) return body.window;
  if (typeof body.windowId === "string" && body.windowId) return body.windowId;
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function asFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function unitFor(key) {
  if (
    key === "volumeUsdc"
    || key === "escrowDeposits"
    || key === "marketplaceSettledVolumeUsdc"
    || key === "platformProgramBudgetUsdc"
  ) return "USDC";
  if (key.endsWith("Ms")) return "ms";
  if (
    key === "disputeRate"
    || key === "completionRatio"
    || key === "escrowToVolumeRatio"
    || key === "marketplaceCompletionRatio"
    || key === "marketplaceFundedEmployerRatio"
  ) return "ratio";
  return "count";
}

function populationFor(key) {
  if (key === "marketplaceEmployers" || key === "marketplaceFundedEmployers" || key === "marketplaceFundedEmployerRatio") {
    return EMPLOYER_POPULATION;
  }
  if (key.startsWith("marketplace")) return MARKETPLACE_POPULATION;
  if (key === "liquidityRegisteredAgents") return REGISTERED_POPULATION;
  if (key === "liquidityAgentsEverPaid") return EVER_PAID_POPULATION;
  if (key === "liquidityAgentsBidding30d") return BIDDING_30D_POPULATION;
  if (key.startsWith("platformProgram")) return PROGRAM_POPULATION;
  return POPULATION;
}

function windowForKey(key) {
  if (key === "liquidityAgentsBidding30d") return WINDOW_30D;
  return WINDOW;
}

function sourcePathForExisting(key) {
  const map = {
    jobCount: "data.totalJobs",
    completedCount: "data.totalCompleted",
    registeredAgents: "data.totalAgents",
    volumeUsdc: "data.totalVolumeUsdc",
    escrowDeposits: "data.escrowedUsdc",
    avgCompletionTimeMs: "data.avgCompletionTimeMs",
    medianCompletionTimeMs: "data.medianCompletionTimeMs",
    avgTimeToFillMs: "data.avgTimeToFillMs",
    medianTimeToFillMs: "data.medianTimeToFillMs",
    completionSampleSize: "data.completionSampleSize",
    disputeRate: "data.disputeRate",
    completionRatio: "data.totalCompleted / data.totalJobs",
    escrowToVolumeRatio: "data.escrowedUsdc / data.totalVolumeUsdc",
  };
  return map[key] || null;
}
