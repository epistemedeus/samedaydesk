/**
 * Source-to-decision projection for observatory snapshots.
 *
 * Four planes stay separate: job listings, task completion, transaction
 * totals, and catalog presence. Nothing in this module adds those planes
 * together. Activity rank exists only inside one open-job page, with that
 * page's returned-row denominator. Missing stays missing.
 */

import { isPlainObject } from "./contract.js";
import { MAINTAINED_CAPABILITY } from "./maintained-capability.js";

export const POSITIONING_SCHEMA_VERSION = "pilot.external-observatory.positioning.v1";

const PURPOSE_TOKEN = /^[A-Z][A-Z0-9_]{0,63}$/;
const DOES_NOT = Object.freeze([
  "listing",
  "broadcast",
  "customer_message",
  "bid",
  "spend",
]);

const WITHHELD = Object.freeze([
  "independent_customers",
  "estimated_customers",
  "full_realtime_coverage",
  "cross_plane_total",
  "inbound_use",
  "demand",
  "repeat_demand",
  "revenue",
]);

const NODE_DEFS = Object.freeze([
  Object.freeze({
    id: "open_nonexpired_page",
    plane: "job_listings",
    sourceId: "moltjobs_open_jobs",
    metricKey: "returned_rows",
    role: "open_queue",
    population: "moltjobs_public_open_nonexpired_page",
    window: "status_OPEN_limit_20_includeExpired_false",
    unit: "count",
    uncertainty: Object.freeze(["single_capture", "provider_page_order", "not_marketplace_stock", "not_unique_agents"]),
  }),
  Object.freeze({
    id: "ordinary_created_stock",
    plane: "job_listings",
    sourceId: "moltjobs",
    metricKey: "marketplaceJobs",
    role: "historical_stock",
    population: "moltjobs_marketplace_ordinary_third_party",
    window: "unspecified_provider_snapshot",
    unit: "count",
    uncertainty: Object.freeze(["created_stock_not_open_queue", "not_a_listing_feed"]),
  }),
  Object.freeze({
    id: "all_purpose_created_stock",
    plane: "job_listings",
    sourceId: "moltjobs",
    metricKey: "jobCount",
    role: "historical_stock",
    population: "moltjobs_work_market",
    window: "unspecified_provider_snapshot",
    unit: "count",
    uncertainty: Object.freeze(["includes_platform_programs", "not_comparable_with_ordinary_stock", "not_open_queue"]),
  }),
  Object.freeze({
    id: "all_purpose_completed",
    plane: "task_completion",
    sourceId: "moltjobs",
    metricKey: "completedCount",
    role: "completion_stock",
    population: "moltjobs_work_market",
    window: "unspecified_provider_snapshot",
    unit: "count",
    uncertainty: Object.freeze(["includes_platform_programs", "not_a_listing"]),
  }),
  Object.freeze({
    id: "ordinary_completed",
    plane: "task_completion",
    sourceId: "moltjobs",
    metricKey: "marketplaceCompleted",
    role: "completion_stock",
    population: "moltjobs_marketplace_ordinary_third_party",
    window: "unspecified_provider_snapshot",
    unit: "count",
    uncertainty: Object.freeze(["not_the_open_queue", "not_samedaydesk_delivery"]),
  }),
  Object.freeze({
    id: "all_purpose_volume",
    plane: "transaction_totals",
    sourceId: "moltjobs",
    metricKey: "volumeUsdc",
    role: "provider_total",
    population: "moltjobs_work_market",
    window: "unspecified_provider_snapshot",
    unit: "USDC",
    uncertainty: Object.freeze(["includes_platform_programs", "not_samedaydesk_revenue"]),
  }),
  Object.freeze({
    id: "ordinary_settled_volume",
    plane: "transaction_totals",
    sourceId: "moltjobs",
    metricKey: "marketplaceSettledVolumeUsdc",
    role: "provider_total",
    population: "moltjobs_marketplace_ordinary_third_party",
    window: "unspecified_provider_snapshot",
    unit: "USDC",
    uncertainty: Object.freeze(["not_open_queue", "not_samedaydesk_revenue"]),
  }),
  Object.freeze({
    id: "escrow_deposits",
    plane: "transaction_totals",
    sourceId: "moltjobs",
    metricKey: "escrowDeposits",
    role: "provider_total",
    population: "moltjobs_work_market",
    window: "unspecified_provider_snapshot",
    unit: "USDC",
    uncertainty: Object.freeze(["locked_funds_not_settlement", "not_samedaydesk_revenue"]),
  }),
  Object.freeze({
    id: "protocol_volume_30d",
    plane: "transaction_totals",
    sourceId: "x402stats",
    metricKey: "volume_usd_30d",
    role: "provider_total",
    population: "provider_indexed_volume",
    window: "30d",
    unit: "USD",
    uncertainty: Object.freeze(["different_unit_from_usdc", "different_window", "not_job_listings"]),
  }),
  Object.freeze({
    id: "protocol_organic_volume_30d",
    plane: "transaction_totals",
    sourceId: "x402stats",
    metricKey: "organic_volume_usd_30d",
    role: "provider_heuristic",
    population: "provider_heuristic_organic_volume",
    window: "30d",
    unit: "USD",
    uncertainty: Object.freeze(["provider_heuristic", "not_organic_demand_proof"]),
  }),
  Object.freeze({
    id: "smithery_catalog",
    plane: "catalog_presence",
    sourceId: "smithery_mcp",
    metricKey: "registered_servers",
    role: "catalog_registration",
    population: "smithery_server_catalog",
    window: "catalog_snapshot",
    unit: "count",
    uncertainty: Object.freeze(["registrations_not_traffic", "not_runtime_heartbeats"]),
  }),
]);

export function projectPositioning(input = {}) {
  const fetchedAt = typeof input.fetchedAt === "string" ? input.fetchedAt : null;
  const observations = Array.isArray(input.observations)
    ? input.observations.map(readObservation).filter(Boolean)
    : [];
  const conflicts = [];
  const bySource = new Map();

  for (const observation of observations) {
    if (!observation.sourceId) {
      conflicts.push({ code: "invalid_source", sourceId: null });
      continue;
    }
    if (bySource.has(observation.sourceId)) {
      const prior = bySource.get(observation.sourceId);
      conflicts.push({
        code: "duplicate_source",
        sourceId: observation.sourceId,
        metricValues: prior ? conflictValues(prior, observation) : null,
      });
      bySource.set(observation.sourceId, null);
      continue;
    }
    bySource.set(observation.sourceId, observation);
  }

  const blocked = conflicts.length > 0;
  const planes = {
    job_listings: { nodes: [] },
    task_completion: { nodes: [] },
    transaction_totals: { nodes: [] },
    catalog_presence: { nodes: [] },
  };

  for (const def of NODE_DEFS) {
    const source = blocked ? null : bySource.get(def.sourceId) || null;
    const node = blocked
      ? withheldNode(def, "conflict")
      : nodeFrom(def, source);
    planes[def.plane].nodes.push(node);
  }

  const open = blocked ? null : bySource.get("moltjobs_open_jobs") || null;
  const openConflict = !blocked && open && pageCountsConflict(open);
  if (openConflict) {
    conflicts.push({ code: "open_page_count_conflict", sourceId: "moltjobs_open_jobs" });
  }

  const activityRanking = blocked || openConflict
    ? withheldRanking(blocked ? "conflicting_sources" : "open_page_count_conflict")
    : rankOpenPage(open);

  const decision = decide({
    blocked: blocked || openConflict,
    open,
    ranking: activityRanking,
  });

  return {
    schemaVersion: POSITIONING_SCHEMA_VERSION,
    fetchedAt,
    additivity: "not_additive",
    coverage: {
      complete: false,
      census: false,
      realtime: false,
      additivity: "not_additive",
      notes: "Named public source planes only. Not a census of autonomous agents and not full real-time coverage.",
    },
    planes,
    activityRanking,
    decision,
    heldAside: heldAside(blocked ? new Map() : bySource),
    notAdopted: [{
      sourceId: "moltjobs_activity",
      method: "GET",
      path: "/v1/activity",
      called: false,
      reason: "The public activity feed includes agentName and jobTitle. This projection does not call it. Task completion stays on the stats completion metrics.",
    }],
    documentedUnavailable: [{
      sourceId: "x402scan",
      called: false,
      reason: "x402scan data endpoints require micropayment; documented only, never called as success",
    }],
    conflicts,
    withheldConclusions: WITHHELD.slice(),
  };
}

function readObservation(row) {
  if (!isPlainObject(row)) return null;
  const sourceId = typeof row.sourceId === "string" && /^[a-z0-9_]+$/.test(row.sourceId)
    ? row.sourceId
    : null;
  return {
    sourceId,
    availability: typeof row.availability === "string" ? row.availability : "error",
    providerTimestampState: typeof row.providerTimestampState === "string" ? row.providerTimestampState : "missing",
    evidenceClass: typeof row.evidenceClass === "string" ? row.evidenceClass : null,
    metrics: Array.isArray(row.metrics) ? row.metrics.map(readMetric).filter(Boolean) : [],
    workload: readWorkload(row.workload),
  };
}

function readMetric(metric) {
  if (!isPlainObject(metric) || typeof metric.key !== "string") return null;
  if (!/^[a-z0-9_]+$/i.test(metric.key)) return null;
  const state = typeof metric.state === "string" ? metric.state : "invalid";
  const value = state === "ok" ? metric.value : null;
  return {
    key: metric.key,
    state,
    value: state === "ok" ? value : null,
    unit: typeof metric.unit === "string" ? metric.unit : null,
    population: typeof metric.population === "string" ? metric.population : null,
    window: typeof metric.window === "string" ? metric.window : null,
    evidenceClass: typeof metric.evidenceClass === "string" ? metric.evidenceClass : null,
  };
}

function readWorkload(workload) {
  if (!isPlainObject(workload)) return null;
  return {
    queryExhausted: workload.queryExhausted === true,
    purposes: readTokens(workload.purposes),
    participationModes: readTokens(workload.participationModes),
    templateSlugs: readSlugs(workload.templateSlugs),
    matchedJobIds: Array.isArray(workload.matchedJobIds)
      ? workload.matchedJobIds.filter((id) => MAINTAINED_CAPABILITY.jobIds.includes(id))
      : [],
  };
}

function readTokens(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    if (typeof item.token !== "string" || !PURPOSE_TOKEN.test(item.token)) continue;
    if (!Number.isSafeInteger(item.count) || item.count < 0) continue;
    out.push({
      token: item.token,
      class: typeof item.class === "string" && /^[a-z_]+$/.test(item.class) ? item.class : "unspecified",
      count: item.count,
    });
  }
  return out;
}

function readSlugs(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    if (typeof item.token !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(item.token)) continue;
    if (!Number.isSafeInteger(item.count) || item.count < 0) continue;
    out.push({ token: item.token, count: item.count });
  }
  return out;
}

function conflictValues(prior, next) {
  const keys = new Set([
    ...prior.metrics.map((metric) => metric.key),
    ...next.metrics.map((metric) => metric.key),
  ]);
  const values = {};
  for (const key of [...keys].sort()) {
    values[key] = [
      prior.metrics.find((metric) => metric.key === key)?.value ?? null,
      next.metrics.find((metric) => metric.key === key)?.value ?? null,
    ];
  }
  return values;
}

function withheldNode(def, state) {
  return {
    id: def.id,
    plane: def.plane,
    sourceId: def.sourceId,
    metricKey: def.metricKey,
    role: def.role,
    population: def.population,
    window: def.window,
    unit: def.unit,
    evidenceClass: null,
    state,
    value: null,
    uncertainty: [...def.uncertainty, state],
    usableForCurrentCut: false,
    attributes: null,
  };
}

function nodeFrom(def, observation) {
  const node = withheldNode(def, observation ? "missing" : "unobserved");
  if (!observation) return node;
  const metric = observation.metrics.find((item) => item.key === def.metricKey);
  if (!metric) return node;
  node.state = metric.state;
  node.value = metric.state === "ok" ? metric.value : null;
  node.population = metric.population || def.population;
  node.window = metric.window || def.window;
  node.unit = metric.unit || def.unit;
  node.evidenceClass = metric.evidenceClass || observation.evidenceClass;
  const stale = observation.providerTimestampState === "stale" || observation.availability === "stale";
  const failed = observation.availability === "unavailable" || observation.availability === "error";
  node.usableForCurrentCut = !stale && !failed && metric.state === "ok"
    && (observation.availability === "ok" || observation.availability === "partial");
  if (observation.providerTimestampState === "missing") node.uncertainty.push("provider_clock_missing");
  if (stale) node.uncertainty.push("stale");
  if (observation.availability === "partial") node.uncertainty.push("partial_source");
  if (failed) node.uncertainty.push(observation.availability);
  node.uncertainty = [...new Set(node.uncertainty)];
  if (def.id === "open_nonexpired_page") node.attributes = openAttributes(observation);
  return node;
}

function openAttributes(observation) {
  const workload = observation.workload;
  return {
    queryExhausted: workload ? workload.queryExhausted : false,
    purposeTokens: workload ? workload.purposes : [],
    participationTokens: workload ? workload.participationModes : [],
    templateSlugs: workload ? workload.templateSlugs : [],
    matchedJobIds: workload ? workload.matchedJobIds : [],
    exactSkillMatches: metricView(observation, "capability_skill_matches"),
    ordinaryRows: metricView(observation, "ordinary_rows"),
    platformProgramRows: metricView(observation, "platform_program_rows"),
    fundedTrueRows: metricView(observation, "funded_true_rows"),
  };
}

function metricView(observation, key) {
  const metric = observation.metrics.find((item) => item.key === key);
  if (!metric) return { state: "missing", value: null };
  return { state: metric.state, value: metric.state === "ok" ? metric.value : null };
}

function pageCountsConflict(observation) {
  const returned = metricView(observation, "returned_rows");
  const platform = metricView(observation, "platform_program_rows");
  const ordinary = metricView(observation, "ordinary_rows");
  const unclassified = metricView(observation, "unclassified_rows");
  const parts = [returned, platform, ordinary, unclassified];
  if (!parts.every((item) => item.state === "ok")) return false;
  return returned.value !== platform.value + ordinary.value + unclassified.value;
}

function withheldRanking(reason) {
  return {
    state: "withheld",
    reason,
    comparisonGroup: "moltjobs_public_open_nonexpired_page_purpose",
    denominator: { key: "returned_rows", state: "withheld", value: null, population: null, window: null },
    ordered: [],
  };
}

function rankOpenPage(observation) {
  if (!observation) return withheldRanking("open_page_unobserved");
  if (observation.availability === "unavailable" || observation.availability === "error" || observation.availability === "stale") {
    return withheldRanking(observation.availability);
  }
  const returned = metricView(observation, "returned_rows");
  if (returned.state !== "ok") return withheldRanking("denominator_missing");
  const workload = observation.workload;
  const rows = workload && workload.purposes.length
    ? workload.purposes.map((item) => ({
      nodeId: `purpose:${item.token}`,
      numerator: item.count,
      mechanism: `Returned rows carry purpose ${item.token}.`,
      mechanismBasis: "observed",
    }))
    : [
      { nodeId: "purpose_class:platform_program", key: "platform_program_rows" },
      { nodeId: "purpose_class:ordinary", key: "ordinary_rows" },
    ].map((item) => {
      const metric = metricView(observation, item.key);
      return {
        nodeId: item.nodeId,
        numerator: metric.state === "ok" ? metric.value : null,
        mechanism: `Metric ${item.key} on the open page.`,
        mechanismBasis: "observed",
        state: metric.state,
      };
    });

  const comparable = rows.filter((row) => Number.isSafeInteger(row.numerator) && row.numerator > 0);
  if (!comparable.length) {
    return {
      state: "withheld",
      reason: returned.value === 0 ? "empty_page" : "no_positive_purpose_count",
      comparisonGroup: "moltjobs_public_open_nonexpired_page_purpose",
      denominator: denominatorOf(observation, returned),
      ordered: [],
    };
  }
  comparable.sort((a, b) => (b.numerator - a.numerator) || (a.nodeId < b.nodeId ? -1 : 1));
  return {
    state: "ok",
    reason: null,
    comparisonGroup: "moltjobs_public_open_nonexpired_page_purpose",
    denominator: denominatorOf(observation, returned),
    ordered: comparable.map((row, index) => ({
      rank: index + 1,
      rankCount: comparable.length,
      nodeId: row.nodeId,
      plane: "job_listings",
      numerator: { key: "purpose_rows", value: row.numerator, state: "ok" },
      denominator: denominatorOf(observation, returned),
      uncertainty: uncertaintyForRank(observation),
      mechanism: row.mechanism,
      mechanismBasis: "observed",
      inference: row.nodeId === "purpose:PLATFORM_REFERRAL" || row.nodeId === "purpose:PLATFORM_MARKETING"
        ? {
          basis: "inference",
          text: "Stats documentation excludes this purpose from ordinary marketplace work.",
          citation: "https://moltjobs.io/docs/api#stats",
        }
        : null,
    })),
  };
}

function denominatorOf(observation, returned) {
  return {
    key: "returned_rows",
    state: "ok",
    value: returned.value,
    population: "moltjobs_public_open_nonexpired_page",
    window: "status_OPEN_limit_20_includeExpired_false",
    queryExhausted: Boolean(observation.workload && observation.workload.queryExhausted),
  };
}

function uncertaintyForRank(observation) {
  const uncertainty = [
    "single_capture",
    "provider_page_order",
    "not_marketplace_stock",
    "not_unique_agents",
    "not_a_conversion",
    "other_statuses_and_expired_unqueried",
  ];
  if (!observation.workload || !observation.workload.queryExhausted) uncertainty.push("query_not_exhausted");
  if (observation.providerTimestampState === "missing") uncertainty.push("provider_clock_missing");
  if (observation.providerTimestampState === "stale" || observation.availability === "stale") uncertainty.push("stale");
  const unclassified = metricView(observation, "unclassified_rows");
  if (unclassified.state === "ok" && unclassified.value > 0) uncertainty.push("unclassified_rows_present");
  return uncertainty;
}

function decide({ blocked, open, ranking }) {
  const capability = {
    schema: MAINTAINED_CAPABILITY.schema,
    package: MAINTAINED_CAPABILITY.package,
    version: MAINTAINED_CAPABILITY.version,
    execution: MAINTAINED_CAPABILITY.execution,
    purchaseAuthority: MAINTAINED_CAPABILITY.purchaseAuthority,
    hostedAcquisition: MAINTAINED_CAPABILITY.hostedAcquisition,
    jobIds: MAINTAINED_CAPABILITY.jobIds.slice(),
    basis: "maintained_package_on_this_baseline",
  };
  const nextBase = {
    kind: "measurement",
    doesNotDo: DOES_NOT.slice(),
  };
  if (blocked || !open || open.availability === "unavailable" || open.availability === "error") {
    return {
      state: blocked ? "blocked" : "unobserved",
      usableForCurrentCut: false,
      capability,
      meetsMaintainedExecution: "unobserved",
      exactSkillOverlap: "unobserved",
      openQueueMechanism: { basis: "unobserved", purposeTokens: [], participationTokens: [] },
      statements: [{
        basis: "observed",
        text: blocked
          ? "Conflicting or internally inconsistent source rows were withheld. No plane was selected from them."
          : "The fixed public open-jobs page was not available in this input.",
      }],
      inboundUse: "unobserved",
      confirmationWouldRequire: confirmationText(),
      nextAction: {
        ...nextBase,
        id: blocked ? "resolve_conflict_then_recapture" : "capture_fixed_open_jobs_query",
        falsifier: "A later non-conflicting read of the fixed public open-jobs URL with a schema-valid page. Marketplace stock, settlement totals, and catalog registrations do not describe that page.",
      },
    };
  }

  const workload = open.workload;
  const matches = metricView(open, "capability_skill_matches");
  const overlap = matches.state === "ok" ? (matches.value > 0 ? "present" : "none") : "unobserved";
  const meets = overlap === "present"
    ? "exact_skill_overlap"
    : overlap === "none"
      ? "no_exact_overlap"
      : "unobserved";
  const purposes = workload ? workload.purposes : [];
  const modes = workload ? workload.participationModes : [];
  const statements = [];
  if (purposes.length) {
    statements.push({
      basis: "observed",
      text: `Purpose tokens on the returned page: ${purposes.map((item) => `${item.token} ${item.count}`).join(", ")}.`,
    });
  }
  if (modes.length) {
    statements.push({
      basis: "observed",
      text: `Participation tokens on the returned page: ${modes.map((item) => `${item.token} ${item.count}`).join(", ")}.`,
    });
  }
  if (matches.state === "ok") {
    statements.push({
      basis: "observed",
      text: matches.value > 0
        ? `Exact useful-jobs skill matches on the page: ${matches.value}.`
        : "Exact useful-jobs skill matches on the page: 0. Zero is a row count, not proof the market has no ordinary work.",
    });
  }
  statements.push({
    basis: "inference",
    text: "useful-jobs 1.4.7 runs offline on caller-supplied artifacts. A platform-program purpose token is not one of those jobs. Stats documentation excludes PLATFORM_MARKETING and PLATFORM_REFERRAL from ordinary marketplace work.",
    citation: "https://moltjobs.io/docs/api#stats",
  });
  if (workload && workload.queryExhausted) {
    statements.push({
      basis: "observed",
      text: "meta.hasMore was false for this fixed query. Other statuses and expired jobs were not queried.",
    });
  }
  if (open.providerTimestampState === "missing") {
    statements.push({
      basis: "observed",
      text: "The open-jobs page did not carry a provider timestamp. Freshness is the observer fetch time only.",
    });
  }

  const stale = open.providerTimestampState === "stale" || open.availability === "stale";
  return {
    state: "projected",
    usableForCurrentCut: !stale && ranking.state !== "withheld" && (open.availability === "ok" || open.availability === "partial"),
    capability,
    meetsMaintainedExecution: meets,
    exactSkillOverlap: overlap,
    openQueueMechanism: {
      basis: purposes.length || modes.length ? "observed" : "unobserved",
      purposeTokens: purposes.map((item) => item.token),
      participationTokens: modes.map((item) => item.token),
    },
    statements,
    inboundUse: "unobserved",
    confirmationWouldRequire: confirmationText(),
    nextAction: {
      ...nextBase,
      id: "repeat_fixed_open_jobs_query",
      falsifier: falsifier({ purposes, overlap, exhausted: Boolean(workload && workload.queryExhausted), stale }),
    },
  };
}

function falsifier({ purposes, overlap, exhausted, stale }) {
  const tokens = purposes.map((item) => item.token);
  const tokenText = tokens.length ? tokens.join(", ") : "the purpose tokens in this projection";
  const exhaustion = exhausted
    ? "meta.hasMore was false on this capture."
    : "This capture did not exhaust the query.";
  const staleText = stale ? " The captured page clock is stale, so a fresh read is required before calling it current." : "";
  return `Falsified if a later GET of the same fixed URL returns a purpose token other than ${tokenText}, or an exact useful-jobs skill match while this overlap is ${overlap}. ${exhaustion} A repeated identical page does not establish inbound use. Marketplace stock, settlement totals, and catalog registrations are different populations.${staleText}`;
}

function confirmationText() {
  return "Inbound use requires a later caller-supplied opaque SameDayDesk operation reference joined to a public job id. This projection does not create that join.";
}

function heldAside(bySource) {
  return [
    {
      sourceId: "moltjobs",
      sourcePresent: bySource.has("moltjobs"),
      reason: "Liquidity agent sets, timing, dispute rate, and completion ratios stay off the four planes.",
    },
    {
      sourceId: "x402stats",
      sourcePresent: bySource.has("x402stats"),
      reason: "Seller counts stay off the four planes. Volume metrics stay on transaction totals and are not listings.",
    },
    {
      sourceId: "moltjobs_open_jobs",
      sourcePresent: bySource.has("moltjobs_open_jobs"),
      reason: "Per-row budgets, titles, identifiers, and descriptions are not exported and are not added into transaction totals.",
    },
    {
      sourceId: "smithery_mcp",
      sourcePresent: bySource.has("smithery_mcp"),
      reason: "Catalog registration count is not active traffic.",
    },
  ];
}
