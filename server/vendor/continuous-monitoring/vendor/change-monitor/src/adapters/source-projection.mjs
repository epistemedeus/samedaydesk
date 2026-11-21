import { SCHEMA_VERSION, SOURCE_IDS } from "../../vendor/s12-observatory/contract.js";
import { observationById, parseSnapshot } from "../../vendor/s12-observatory/envelope.js";
import { PROJECTION_ID, PROJECTION_SCHEMA, rejectSeededFailure } from "../../vendor/s12-observatory/projection.js";

import { rejectSumClaim } from "../consumers/source-projection.mjs";
import { isPlain, observation } from "./shape.mjs";

export { SCHEMA_VERSION, SOURCE_IDS, PROJECTION_SCHEMA, PROJECTION_ID };

export const MATERIAL_FIELDS = Object.freeze([
  "sourceId",
  "sourceKind",
  "availability",
  "methodologyVersion",
  "providerTimestampState",
  "metrics",
  "activityLabel",
  "populations",
]);

export const NON_SEMANTIC = Object.freeze([
  {
    field: "fetchedAt",
    reason: "Fetch clock on the published observatory envelope. It is not a source capability field.",
  },
  {
    field: "providerTimestamp",
    reason: "Provider clock value. providerTimestampState is the task field. Stale state is evidence class stale, not a zero.",
  },
  {
    field: "httpStatus",
    reason: "Transport detail. availability is the task field.",
  },
  {
    field: "title",
    reason: "Presentation copy from the named-source catalog.",
  },
  {
    field: "capture",
    reason: "Label that separates a live public read, a seeded mutation, a supplied fixture, and a caller-supplied document. It is not a capability field.",
  },
]);

const MISSING = new Set(["unavailable", "error", "missing", "missing_from_snapshot", "source_error", "unprojected"]);
const REFUSED_METRIC_KEYS = new Set([
  "marketWideTraffic",
  "globalAgentTraffic",
  "totalAgentEconomy",
  "crossSourceSum",
  "mixedPopulationSum",
  "agentTraffic",
]);

function metricMaterial(metrics) {
  if (!Array.isArray(metrics)) return null;
  const rows = [];
  for (const metric of metrics) {
    if (!isPlain(metric) || typeof metric.key !== "string" || !metric.key) return null;
    rows.push({
      key: metric.key,
      value: metric.value ?? null,
      unit: metric.unit ?? null,
      state: metric.state ?? null,
      population: metric.population ?? null,
      window: metric.window ?? null,
    });
  }
  return rows.sort((left, right) => left.key.localeCompare(right.key));
}

function captureOf(document) {
  const value = document && typeof document.capture === "string" ? document.capture : null;
  if (value === "live" || value === "seeded" || value === "fixture" || value === "injected" || value === "caller-supplied") {
    return value;
  }
  return "caller-supplied";
}

function finish(subscription, fields, capture) {
  const nonSemantic = { ...(fields.nonSemantic || {}) };
  if (nonSemantic.capture == null) nonSemantic.capture = capture;
  return observation(subscription, {
    adapterId: "source-projection",
    schemaId: fields.schemaId ?? SCHEMA_VERSION,
    sourceVersion: fields.sourceVersion ?? SCHEMA_VERSION,
    ...fields,
    nonSemantic,
  });
}

function isProjection(value) {
  return isPlain(value) && value.projectionId === PROJECTION_ID && Array.isArray(value.sources);
}

function projectionOf(document) {
  if (isProjection(document)) return document;
  if (isProjection(document?.projection)) return document.projection;
  if (isProjection(document?.document)) return document.document;
  return null;
}

function isSumClaim(document) {
  if (!isPlain(document) || document.projectionId === PROJECTION_ID) return false;
  if (document.schemaVersion === SCHEMA_VERSION && (Array.isArray(document.observations) || document.sourceId)) return false;
  if (document.seeded === true && (document.mixedPopulationSum != null || document.marketWideTraffic != null)) return true;
  if (document.mixedPopulationSum != null && document.schemaVersion !== SCHEMA_VERSION && document.schemaVersion !== PROJECTION_SCHEMA) {
    return true;
  }
  return false;
}

function sumRefusal(subscription, document, capture) {
  const verdict = rejectSumClaim(document);
  const refused = rejectSeededFailure(document);
  return finish(subscription, {
    evidenceClass: "incomparable",
    failureCode: "mixed_population_sum",
    coverage: null,
    nonSemantic: {
      capture: document.capture === "seeded" || document.seeded === true ? "seeded" : capture,
      refused: verdict.refused === true && refused.refused === true,
      total: null,
      marketWideTraffic: null,
      combinedActivity: null,
      summedWithPrior: false,
      maintainedMarketplaceCompleted: verdict.maintainedMarketplaceCompleted ?? null,
      code: verdict.code || null,
    },
  }, capture);
}

function normalizeProjection(subscription, document, projection, ctx) {
  const capture = captureOf(document);
  const sourceId = subscription.source.scope.slice("source-projection:".length);
  const shared = { correctsEvidenceId: ctx.correctsEvidenceId ?? null, schemaId: PROJECTION_SCHEMA };
  if (document.fetchFailure || (document.projection == null && document.status === "source_failure" && !projection)) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "source_failure",
      failureCode: document.failureCode || document.fetchFailure?.code || "source_unreachable",
      coverage: null,
      nonSemantic: {
        capture,
        message: document.reason || document.fetchFailure?.message || null,
        httpStatus: document.fetch?.httpStatus ?? document.fetchFailure?.httpStatus ?? null,
      },
    }, capture);
  }
  if (!projection || !Array.isArray(projection.sources)) {
    return finish(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "projection_unreadable" }, capture);
  }
  if (projection.marketWideTraffic != null || projection.combinedActivity != null || projection.crossSourceSum?.total != null) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "incomparable",
      failureCode: "market_wide_traffic",
      nonSemantic: { capture, marketWideTraffic: null, combinedActivity: null, total: null },
    }, capture);
  }
  const slot = projection.sources.find((entry) => entry && entry.sourceId === sourceId);
  if (!slot) {
    return finish(subscription, { ...shared, evidenceClass: "missing", failureCode: "source_absent" }, capture);
  }
  const observedAt = typeof slot.freshness?.fetchedAt === "string" ? slot.freshness.fetchedAt : null;
  const nonSemantic = {
    capture,
    fetchedAt: slot.freshness?.fetchedAt ?? null,
    providerTimestamp: slot.freshness?.providerTimestamp ?? null,
    publicSourceChanged: document.publicSourceChanged === true,
    summedWithPrior: false,
    marketWideTraffic: null,
    mutation: document.mutation || null,
  };
  if (slot.lastAttempt?.keptPrior === true) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "source_failure",
      failureCode: "kept_prior",
      observedAt,
      coverage: { state: slot.coverage?.state ?? null, keptPrior: true },
      nonSemantic: { ...nonSemantic, keptPrior: true, attemptedAvailability: slot.lastAttempt.availability ?? null },
    }, capture);
  }
  const availability = typeof slot.availability === "string" ? slot.availability : "unavailable";
  if (MISSING.has(availability) || availability === "") {
    const evidenceClass = availability === "error" || availability === "source_error" ? "source_failure" : "missing";
    return finish(subscription, {
      ...shared,
      evidenceClass,
      failureCode: availability || "missing",
      observedAt,
      coverage: { state: slot.coverage?.state ?? "unavailable" },
      nonSemantic,
    }, capture);
  }
  const freshness = slot.freshness?.state || "clock_missing";
  if (freshness === "stale") {
    return finish(subscription, {
      ...shared,
      evidenceClass: "stale",
      failureCode: "stale",
      observedAt,
      coverage: { state: slot.coverage?.state ?? null },
      nonSemantic,
    }, capture);
  }
  if (freshness !== "fresh") {
    return finish(subscription, {
      ...shared,
      evidenceClass: "incomparable",
      failureCode: `freshness_${freshness}`,
      observedAt,
      coverage: { state: slot.coverage?.state ?? null },
      nonSemantic,
    }, capture);
  }
  const coverageState = slot.coverage?.state || "uncovered";
  const missingPopulations = Array.isArray(slot.coverage?.missingPopulations) ? slot.coverage.missingPopulations : [];
  if (coverageState !== "covered" || missingPopulations.length > 0) {
    return finish(subscription, {
      ...shared,
      evidenceClass: coverageState === "unavailable" ? "missing" : "incomparable",
      failureCode: missingPopulations.length > 0 || coverageState === "partial" ? "coverage_population" : "coverage_not_comparable",
      observedAt,
      coverage: {
        state: coverageState,
        missingPopulations: missingPopulations.slice(),
        presentPopulations: Array.isArray(slot.coverage?.presentPopulations) ? slot.coverage.presentPopulations.slice() : [],
      },
      nonSemantic,
    }, capture);
  }
  const metrics = metricMaterial(slot.metrics);
  if (!metrics) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "incomparable",
      failureCode: "metrics_unreadable",
      observedAt,
      coverage: { state: coverageState },
      nonSemantic,
    }, capture);
  }
  if (metrics.some((metric) => REFUSED_METRIC_KEYS.has(metric.key))) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "incomparable",
      failureCode: "market_wide_traffic",
      observedAt,
      coverage: { state: coverageState },
      nonSemantic: { ...nonSemantic, total: null },
    }, capture);
  }
  if (metrics.some((metric) => metric.state !== "ok" || metric.value == null)) {
    return finish(subscription, {
      ...shared,
      evidenceClass: "incomparable",
      failureCode: "partial_metrics",
      observedAt,
      coverage: { state: coverageState, missingPopulations: missingPopulations.slice() },
      nonSemantic,
    }, capture);
  }
  const populations = Array.isArray(slot.coverage?.presentPopulations) ? slot.coverage.presentPopulations.slice().sort() : [];
  return finish(subscription, {
    ...shared,
    evidenceClass: "comparable",
    sourceVersion: PROJECTION_SCHEMA,
    observedAt,
    coverage: {
      state: "covered",
      presentPopulations: populations,
      missingPopulations: [],
      extraPopulations: Array.isArray(slot.coverage?.extraPopulations) ? slot.coverage.extraPopulations.slice().sort() : [],
    },
    nonSemantic,
    material: {
      sourceId,
      sourceKind: slot.activityLabel ?? null,
      availability,
      methodologyVersion: PROJECTION_SCHEMA,
      providerTimestampState: slot.freshness?.providerTimestampState ?? null,
      activityLabel: slot.activityLabel ?? null,
      populations,
      metrics,
    },
  }, capture);
}

export const sourceProjectionAdapter = {
  id: "source-projection",
  schemaId: SCHEMA_VERSION,
  MATERIAL_FIELDS,
  NON_SEMANTIC,
  normalize(subscription, document, ctx = {}) {
    const capture = captureOf(document);
    const shared = { correctsEvidenceId: ctx.correctsEvidenceId ?? null };
    if (!isPlain(document)) {
      return finish(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "document_not_object" }, "caller-supplied");
    }
    if (document.integration === "pending" || document.status === "pending") {
      return finish(subscription, {
        ...shared,
        evidenceClass: "missing",
        failureCode: "projection_pending",
        coverage: null,
        nonSemantic: { reason: document.reason ?? null },
      }, capture);
    }
    if (isSumClaim(document)) return sumRefusal(subscription, document, capture);
    const projection = projectionOf(document);
    if (projection || document.schemaVersion === PROJECTION_SCHEMA || document.fetchFailure || document.status === "source_failure") {
      return normalizeProjection(subscription, document, projection, ctx);
    }
    if (document.schemaVersion !== undefined && document.schemaVersion !== SCHEMA_VERSION) {
      return finish(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "schema_mismatch",
        nonSemantic: { schemaVersion: document.schemaVersion },
      }, capture);
    }
    const sourceId = subscription.source.scope.slice("source-projection:".length);
    let row = null;
    if (typeof document.sourceId === "string" && !Array.isArray(document.observations) && !isPlain(document.observations)) {
      row = document;
    } else {
      const snapshot = parseSnapshot(document, { fetchedAt: null });
      if (snapshot.schemaVersion && snapshot.schemaVersion !== SCHEMA_VERSION) {
        return finish(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "schema_mismatch" }, capture);
      }
      row = observationById(snapshot, sourceId);
    }
    if (!row || row.sourceId !== sourceId) {
      return finish(subscription, { ...shared, evidenceClass: "missing", failureCode: "source_absent" }, capture);
    }
    if (!SOURCE_IDS.includes(sourceId)) {
      return finish(subscription, { ...shared, evidenceClass: "incomparable", failureCode: "scope_mismatch" }, capture);
    }
    const observedAt = typeof row.fetchedAt === "string" ? row.fetchedAt : null;
    const nonSemantic = {
      fetchedAt: row.fetchedAt ?? null,
      providerTimestamp: row.providerTimestamp ?? null,
      httpStatus: row.httpStatus ?? null,
    };
    const availability = typeof row.availability === "string" ? row.availability : "unavailable";
    if (MISSING.has(availability) || availability === "") {
      const evidenceClass = availability === "error" || availability === "source_error" ? "source_failure" : "missing";
      return finish(subscription, {
        ...shared,
        evidenceClass,
        failureCode: availability || "missing",
        observedAt,
        coverage: row.coverage ?? null,
        nonSemantic,
      }, capture);
    }
    if (availability === "stale" || row.providerTimestampState === "stale") {
      return finish(subscription, {
        ...shared,
        evidenceClass: "stale",
        failureCode: "stale",
        observedAt,
        coverage: row.coverage ?? null,
        nonSemantic,
      }, capture);
    }
    if (availability === "partial") {
      return finish(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "partial_coverage",
        observedAt,
        coverage: row.coverage ?? null,
        nonSemantic,
      }, capture);
    }
    const coverage = row.coverage;
    if (!isPlain(coverage) || coverage.comparable !== true || coverage.status !== "complete") {
      return finish(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "coverage_not_comparable",
        observedAt,
        coverage: coverage ?? null,
        nonSemantic,
      }, capture);
    }
    const metrics = metricMaterial(row.metrics);
    if (!metrics) {
      return finish(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: "metrics_unreadable",
        observedAt,
        coverage,
        nonSemantic,
      }, capture);
    }
    if (metrics.some((metric) => REFUSED_METRIC_KEYS.has(metric.key) || metric.state !== "ok")) {
      return finish(subscription, {
        ...shared,
        evidenceClass: "incomparable",
        failureCode: metrics.some((metric) => REFUSED_METRIC_KEYS.has(metric.key)) ? "market_wide_traffic" : "partial_metrics",
        observedAt,
        coverage,
        nonSemantic: { ...nonSemantic, total: null },
      }, capture);
    }
    const methodologyVersion = typeof row.methodologyVersion === "string" ? row.methodologyVersion : null;
    return finish(subscription, {
      ...shared,
      schemaId: SCHEMA_VERSION,
      evidenceClass: "comparable",
      sourceVersion: methodologyVersion || SCHEMA_VERSION,
      observedAt,
      coverage,
      nonSemantic,
      material: {
        sourceId,
        sourceKind: row.sourceKind ?? null,
        availability,
        methodologyVersion,
        providerTimestampState: row.providerTimestampState ?? null,
        metrics,
      },
    }, capture);
  },
};
