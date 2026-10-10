/**
 * Public open-job page adapter.
 *
 * Official contract: GET /v1/jobs is public and accepts status, limit,
 * and includeExpired (OpenAPI on api.moltjobs.io, docs at
 * https://moltjobs.io/docs/api). This adapter calls one fixed URL:
 * status=OPEN, limit=20, includeExpired=false. It does not follow
 * nextCursor, does not call /v1/jobs/:id/public, and does not call
 * /v1/activity (that feed carries agentName and jobTitle).
 *
 * The page is a job-listing query. It is not marketplace.jobs, not
 * task completion, and not a transaction total. Row identifiers,
 * titles, descriptions, budgets, and payment addresses are dropped.
 */

import { MAINTAINED_JOB_IDS } from "../maintained-capability.js";
import {
  WITHHELD_CONCLUSIONS,
  captureErrorRecord,
  classifyFetchAvailability,
  createEnvelope,
  createMetric,
  defaultCoverage,
  hasOwn,
  isPlainObject,
  specsToUnavailableMetrics,
} from "../contract.js";

export const sourceId = "moltjobs_open_jobs";
export const sourceKind = "work_market";
export const upstreamUrl = "https://api.moltjobs.io/v1/jobs?status=OPEN&limit=20&includeExpired=false";
export const evidenceClass = "public_open_job_page";

const POPULATION = "moltjobs_public_open_nonexpired_page";
const WINDOW = "status_OPEN_limit_20_includeExpired_false";
const MAX_ROWS = 100;
const PURPOSE_TOKEN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MODE_TOKEN = PURPOSE_TOKEN;
const SLUG_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PLATFORM_PURPOSES = new Set(["PLATFORM_MARKETING", "PLATFORM_REFERRAL"]);
const DETAIL_ROUTE = "/v1/jobs/:id/public";

const DEFINITIONS = Object.freeze({
  returned_rows: "Rows in data[] on this fixed public OPEN page, after the documented 100-row cap. Not marketplace.jobs and not a census of agents.",
  classified_rows: "Returned rows whose purpose token is PLATFORM_MARKETING or PLATFORM_REFERRAL. Not a customer count.",
  platform_program_rows: "Returned rows whose purpose token is PLATFORM_MARKETING or PLATFORM_REFERRAL. The stats reference excludes platform marketing and referral from ordinary marketplace aggregates.",
  ordinary_rows: "Returned rows whose purpose token is named as ordinary marketplace work. The jobs listing schema does not define that complement, so this count stays zero unless a later contract names those tokens.",
  unclassified_rows: "Returned rows with a missing purpose, a purpose that is not a closed token, or a closed token the stats contract does not classify.",
  status_mismatch_rows: "Returned rows whose status token is present and is not OPEN. The query asked for OPEN.",
  funded_true_rows: "Returned rows with funded strictly true. Not a transaction total and not a payer count.",
  page_has_more: "Provider meta.hasMore for this page. 1 means the query result continues. 0 means the provider flagged this page as exhausted. Not full real-time coverage.",
  capability_skill_matches: "Returned rows whose requiredSkills or preferredSkills contain an exact useful-jobs id. Titles are not scanned.",
});

export const metricSpecs = Object.freeze([
  spec("returned_rows", "count"),
  spec("classified_rows", "count"),
  spec("platform_program_rows", "count"),
  spec("ordinary_rows", "count"),
  spec("unclassified_rows", "count"),
  spec("status_mismatch_rows", "count"),
  spec("funded_true_rows", "count"),
  spec("page_has_more", "flag"),
  spec("capability_skill_matches", "count"),
]);

const SOURCE_WITHHELD = Object.freeze([
  ...WITHHELD_CONCLUSIONS,
  "inbound_use",
  "open_queue_equals_marketplace_stock",
]);

export const descriptor = Object.freeze({
  sourceId,
  sourceKind,
  upstreamUrl,
  evidenceClass,
  establishes: "One public non-expired OPEN job page: purpose, participation, template slug, funded flag, and exact useful-jobs skill overlap.",
  doesNotEstablish: Object.freeze([
    "unique customers",
    "inbound SameDayDesk use",
    "marketplace.jobs",
    "task completion",
    "transaction totals",
    "full real-time coverage",
  ]),
  withheldConclusions: SOURCE_WITHHELD,
  notes: "Fixed URL only. No cursor follow, no per-job detail, no activity feed. Identifiers and titles are dropped.",
  metricKeys: Object.freeze(metricSpecs.map((item) => item.key)),
});

export function observe(capture, _ctx = {}) {
  const fetchedAt = capture && capture.fetchedAt ? capture.fetchedAt : null;
  const fetchAvailability = classifyFetchAvailability(capture);
  const errors = [];
  const capturedError = captureErrorRecord(capture);
  if (capturedError) errors.push(capturedError);

  if (fetchAvailability) {
    return finish({
      fetchedAt,
      capture,
      availability: fetchAvailability,
      metrics: specsToUnavailableMetrics(metricSpecs, fetchAvailability === "unavailable" ? "unavailable" : "error"),
      errors,
      warnings: [],
      workload: null,
    });
  }

  const body = capture.body;
  if (!isPlainObject(body) || !Array.isArray(body.data)) {
    errors.push({ code: "schema_error", message: "open jobs body has no data array" });
    return finish({
      fetchedAt,
      capture,
      availability: "error",
      metrics: specsToUnavailableMetrics(metricSpecs, "error"),
      errors,
      warnings: [],
      workload: null,
    });
  }

  if (body.data.length > MAX_ROWS) {
    return finish({
      fetchedAt,
      capture,
      availability: "partial",
      metrics: metricSpecs.map((item) => createMetric({
        key: item.key,
        value: null,
        unit: item.unit,
        state: "overflow",
        definition: item.definition,
        population: POPULATION,
        window: WINDOW,
        evidenceClass,
      })),
      errors,
      warnings: [{
        code: "page_over_documented_maximum",
        message: "data.length exceeds the documented limit maximum of 100. Counts are withheld.",
      }],
      workload: null,
    });
  }

  const warnings = [];
  const tally = {
    returned: body.data.length,
    classified: 0,
    platform: 0,
    ordinary: 0,
    unclassified: 0,
    statusMismatch: 0,
    fundedTrue: 0,
    skillMatches: 0,
  };
  const purposes = new Map();
  const modes = new Map();
  const templates = new Map();
  const matched = new Set();

  for (const row of body.data) {
    if (!isPlainObject(row)) {
      tally.unclassified += 1;
      continue;
    }
    const purpose = own(row, "purpose");
    const purposeClass = classifyPurpose(purpose);
    if (purposeClass === "platform_program") {
      tally.platform += 1;
      tally.classified += 1;
      bump(purposes, purpose, "platform_program");
    } else if (purposeClass === "unclassified") {
      tally.unclassified += 1;
      bump(purposes, purpose, "unclassified");
    } else {
      tally.unclassified += 1;
    }

    const status = own(row, "status");
    if (typeof status === "string" && MODE_TOKEN.test(status) && status !== "OPEN") {
      tally.statusMismatch += 1;
    }

    if (own(row, "funded") === true) tally.fundedTrue += 1;

    const mode = own(row, "participationMode");
    if (typeof mode === "string" && MODE_TOKEN.test(mode)) bump(modes, mode, "participation");

    const templateId = own(row, "templateId");
    if (typeof templateId === "string" && SLUG_TOKEN.test(templateId)) {
      bump(templates, templateId, "template");
    }

    if (rowMatchesCapability(row)) {
      tally.skillMatches += 1;
      for (const id of skillIds(row)) matched.add(id);
    }
  }

  const meta = isPlainObject(body.meta) ? body.meta : null;
  if (!meta) {
    warnings.push({ code: "missing_meta", message: "open jobs payload has no meta object" });
  }
  const hasMore = meta && typeof meta.hasMore === "boolean" ? meta.hasMore : null;
  if (hasMore === null) {
    warnings.push({ code: "has_more_missing", message: "meta.hasMore was absent. Query exhaustion is missing, not false." });
  }
  if (hasMore === true) {
    warnings.push({
      code: "page_truncated",
      message: "meta.hasMore is true. This page is not the rest of the query.",
    });
  }
  if (tally.statusMismatch > 0) {
    warnings.push({
      code: "status_mismatch",
      message: "At least one returned row was not OPEN.",
    });
  }

  const metrics = [
    countMetric("returned_rows", tally.returned),
    countMetric("classified_rows", tally.classified),
    countMetric("platform_program_rows", tally.platform),
    countMetric("ordinary_rows", tally.ordinary),
    countMetric("unclassified_rows", tally.unclassified),
    countMetric("status_mismatch_rows", tally.statusMismatch),
    countMetric("funded_true_rows", tally.fundedTrue),
    hasMore === null
      ? createMetric({
        key: "page_has_more",
        value: null,
        unit: "flag",
        state: "missing",
        definition: DEFINITIONS.page_has_more,
        population: POPULATION,
        window: WINDOW,
        evidenceClass,
      })
      : countMetric("page_has_more", hasMore ? 1 : 0, "flag"),
    countMetric("capability_skill_matches", tally.skillMatches),
  ];

  const detailRoute = meta && meta.publicDetailRoute === DETAIL_ROUTE ? DETAIL_ROUTE : null;
  const workload = {
    schemaVersion: "pilot.external-observatory.open-jobs-page.v1",
    query: {
      status: "OPEN",
      limit: 20,
      includeExpired: false,
    },
    queryExhausted: hasMore === false,
    purposes: histogram(purposes),
    participationModes: histogram(modes),
    templateSlugs: histogram(templates),
    matchedJobIds: [...matched].sort(),
    detailRouteCalled: false,
    documentedDetailRoute: detailRoute,
    identifierValuesExcluded: true,
  };

  const availability = warnings.some((item) => item.code === "missing_meta" || item.code === "has_more_missing" || item.code === "status_mismatch")
    ? "partial"
    : "ok";

  return finish({
    fetchedAt,
    capture,
    availability,
    metrics,
    errors,
    warnings,
    workload,
  });
}

function finish({ fetchedAt, capture, availability, metrics, errors, warnings, workload }) {
  return createEnvelope({
    sourceId,
    sourceKind,
    upstreamUrl,
    fetchedAt,
    providerTimestamp: null,
    providerTimestampState: "missing",
    availability,
    httpStatus: capture && Number.isInteger(capture.httpStatus) ? capture.httpStatus : null,
    cache: capture && capture.cache,
    metrics,
    coverage: defaultCoverage({
      kind: "provider_filtered_page",
      population: POPULATION,
      window: WINDOW,
      notes: "One fixed public OPEN page. Not additive with marketplace stock, completion counts, settlement totals, or catalog registrations. coverage.complete stays false.",
    }),
    errors,
    warnings,
    evidenceClass,
    rawSourceLink: upstreamUrl,
    withheldConclusions: SOURCE_WITHHELD,
    paidActivity: {
      sourceId,
      available: false,
      reason: "An open-job page is a listing query. funded=true is not a transaction total, a completion, or a payer.",
      populations: [{
        id: POPULATION,
        rawPath: "data[]",
        window: WINDOW,
        notes: "Page rows only. Identifiers are not retained.",
        metricKeys: descriptor.metricKeys,
      }],
      ratios: [],
      refusedRatios: [{
        key: "open_page_over_marketplace_jobs",
        numeratorKey: "returned_rows",
        denominatorKey: "marketplaceJobs",
        reason: "The OPEN page and data.marketplace.jobs are different populations. The page includes platform programs the marketplace block excludes.",
      }],
      establishes: "Listing-page composition for one fixed query.",
      doesNotEstablish: ["paid customers", "task completion", "inbound use"],
    },
    workload,
  });
}

function spec(key, unit) {
  return Object.freeze({
    key,
    unit,
    definition: DEFINITIONS[key],
    population: POPULATION,
    window: WINDOW,
    evidenceClass,
  });
}

function countMetric(key, value, unit = "count") {
  return createMetric({
    key,
    value,
    unit,
    state: "ok",
    definition: DEFINITIONS[key],
    population: POPULATION,
    window: WINDOW,
    evidenceClass,
  });
}

function classifyPurpose(purpose) {
  if (typeof purpose !== "string" || !PURPOSE_TOKEN.test(purpose)) return "invalid";
  if (PLATFORM_PURPOSES.has(purpose)) return "platform_program";
  return "unclassified";
}

function rowMatchesCapability(row) {
  return skillIds(row).length > 0;
}

function skillIds(row) {
  const ids = [];
  for (const key of ["requiredSkills", "preferredSkills"]) {
    const list = own(row, key);
    if (!Array.isArray(list) || list.length > 20) continue;
    for (const item of list) {
      if (typeof item === "string" && MAINTAINED_JOB_IDS.has(item)) ids.push(item);
    }
  }
  return ids;
}

function own(row, key) {
  if (!hasOwn(row, key)) return undefined;
  return row[key];
}

function bump(map, token, kind) {
  const current = map.get(token) || { token, class: kind, count: 0 };
  current.count += 1;
  map.set(token, current);
}

function histogram(map) {
  return [...map.values()].sort((a, b) => (b.count - a.count) || (a.token < b.token ? -1 : 1));
}
