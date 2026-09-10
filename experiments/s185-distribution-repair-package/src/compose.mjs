/**
 * S185 thin composition: Record04 feed → identity-bound DIST08 diagnosis + NL06 repair.
 * No second parser. Grexal is never a universal adapter.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDistRepairFeed } from "../vendor/record04/src/index.mjs";
import {
  buildBeforeAfterFromFeed,
  buildBundleFromFeed,
  selectJoinableRepairs,
  validateFeed,
} from "../vendor/nl06/src/index.mjs";
import {
  assertNoInventedConversion,
  assertUnknownsDefault,
  diagnoseConversion,
} from "../vendor/dist08/src/index.mjs";
import {
  FEED_SCHEMA,
  INPUT_SCHEMA,
  MUTATION_BOUNDARY,
  NEXT_RUN_SCHEMA,
  PINS,
  RESULT_SCHEMA,
  SCOPE_NOTE,
  STATUS,
} from "./constants.mjs";
import {
  identitiesCompatible,
  isPlainObject,
  namespacedRef,
  readIdentity,
  splitIdentities,
} from "./identity.mjs";
import {
  claims,
  freeVsPriced,
  malformedResult,
  productError,
  rejectForbidden,
} from "./validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(HERE, "..");
export const DIST08_ROOT = join(PKG_ROOT, "vendor/dist08");

function defaultClock() {
  return Date.now();
}

function clockFrom(input, options) {
  if (typeof options?.clock === "function") return options.clock;
  if (typeof input?.clock === "string" && input.clock) {
    const ms = Date.parse(input.clock);
    if (!Number.isNaN(ms)) return () => ms;
  }
  return defaultClock;
}

function extractRecord(input) {
  if (!isPlainObject(input)) return { kind: "missing" };
  const rec = isPlainObject(input.record) ? input.record : null;
  if (rec?.feed && isPlainObject(rec.feed)) return { kind: "feed", feed: rec.feed };
  if (rec?.routeRegressionInput && isPlainObject(rec.routeRegressionInput)) {
    return { kind: "pair", pair: rec.routeRegressionInput };
  }
  if (rec?.baseline != null && rec?.current != null) return { kind: "pair", pair: rec };
  if (input.feed && input.schema === FEED_SCHEMA) return { kind: "feed", feed: input };
  if (input.routeRegressionInput) return { kind: "pair", pair: input.routeRegressionInput };
  if (input.baseline != null && input.current != null) return { kind: "pair", pair: input };
  return { kind: "missing" };
}

function catalogIncomplete(discovery) {
  if (!isPlainObject(discovery)) return false;
  if (discovery.catalogComplete === false) return true;
  if (discovery.incomplete === true) return true;
  if (discovery.captureStatus === "partial") return true;
  return false;
}

function scrubValue(value) {
  if (typeof value === "string") return value.replace(/^\/workspace\//, "");
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v);
  return out;
}

function summarizeFeed(feed) {
  if (!feed) return null;
  return {
    schema: feed.schema,
    status: feed.status,
    feedId: feed.feedId ?? null,
    currentCaptureIncomplete: feed.currentCaptureIncomplete === true,
    partialReasons: feed.partialReasons || [],
    repairRecommendations: feed.repairRecommendations || [],
    recommendationSummary: feed.recommendationSummary || null,
    routeReportSummary: feed.routeReportSummary || null,
    error: feed.error || null,
  };
}

function nextChecksFrom(feed, gaps) {
  const checks = [];
  const recs = feed?.repairRecommendations || [];
  for (const r of recs) {
    if (r.secondaryRecommendation && !checks.includes(r.secondaryRecommendation)) {
      checks.push(r.secondaryRecommendation);
    }
    if (
      r.recommendation === "cannot_prove_global_removal" &&
      !checks.includes("recheck_with_complete_capture")
    ) {
      checks.push("recheck_with_complete_capture");
    }
  }
  if (gaps.some((g) => g.code === "incomplete_catalog")) {
    if (!checks.includes("complete_catalog_capture")) checks.push("complete_catalog_capture");
  }
  if (gaps.some((g) => g.code === "missing_record_feed")) {
    checks.push("supply_baseline_and_current_route_snapshots");
  }
  if (gaps.some((g) => g.code === "missing_identity")) {
    checks.push("supply_provider_and_jobRef_or_sharedEvidenceId");
  }
  if (gaps.some((g) => g.code === "identity_mismatch")) {
    checks.push("join_only_matching_provider_jobRef_sharedEvidenceId");
  }
  return checks;
}

function deriveAcquisition(identity, joinable, at, evidenceRef) {
  const events = [];
  if (!identity.complete) return events;
  for (const repair of joinable) {
    const jobRef = namespacedRef(identity, repair.routeKey, null);
    events.push({
      id: `acq-presented:${repair.routeKey}`,
      kind: "linkPresented",
      sourceTag: "catalog",
      linkId: `route:${repair.routeKey}`,
      jobRef,
      at,
      evidenceRef,
      fixtureDerived: true,
      note: "Caller-identity catalog presentation for source-compatible join wiring; not live traffic; provider is not inferred",
    });
    events.push({
      id: `acq-activated:${repair.routeKey}`,
      kind: "linkActivated",
      sourceTag: "catalog",
      linkId: `route:${repair.routeKey}`,
      jobRef,
      at,
      evidenceRef,
      impliesBuyerIntent: false,
      fixtureDerived: true,
      note: "Caller-identity activation for join wiring only; click ≠ conversion; not live traffic; provider is not inferred",
    });
  }
  return events;
}

function rebindOutputs(useful, identity, at) {
  return useful.map((out) => {
    const routeKey = out.routeRepair?.routeKey;
    const jobRef = namespacedRef(identity, routeKey, out.jobRef);
    const rebound = { ...out, jobRef, at: out.at || at };
    delete rebound.sharedEvidenceId;
    if (identity.provider) rebound.provider = identity.provider;
    else delete rebound.provider;
    rebound.callerRebound = true;
    rebound.note = `${out.note || "route repair"} (provider bound from caller identity, not a Grexal-universal default)`;
    return rebound;
  });
}

function matchingFromDiagnosis(diagnosis, compatible) {
  const joined = diagnosis?.joined || [];
  const unjoined = diagnosis?.unjoined || [];
  const keys = [...new Set(joined.flatMap((j) => j.compatibilityKeys || []))];
  return {
    compatible: compatible && joined.length > 0,
    joinedCount: joined.length,
    unjoinedCount: unjoined.length,
    keys,
    reason: compatible
      ? joined.length
        ? "source_compatible_join"
        : "no_compatible_pairs"
      : "nonmatching_source_identity",
  };
}

export function buildNextRunManifest(result, inputPath = null) {
  return {
    schema: NEXT_RUN_SCHEMA,
    packageId: "distribution-repair",
    identity: result.identity || null,
    inputs: inputPath ? { input: inputPath } : {},
    last: {
      status: result.status,
      generatedAt: result.generatedAt,
      feedId: result.feed?.feedId ?? null,
      matching: result.matching,
    },
    paidValueClaim: false,
    productionAcquisition: false,
    freeOffline: true,
  };
}

/**
 * @param {object} input
 * @param {{ clock?: () => number, dist08Root?: string }} [options]
 */
export async function diagnoseDistributionRepair(input, options = {}) {
  const clock = clockFrom(input, options);
  const generatedAt = new Date(clock()).toISOString();
  const dist08Root = options.dist08Root || DIST08_ROOT;

  if (!isPlainObject(input)) {
    return malformedResult("input must be an object", { code: "invalid_input" }, generatedAt);
  }

  try {
    rejectForbidden(input);
  } catch (err) {
    const result = malformedResult(err.message, { code: err.code, details: err.details }, generatedAt);
    result.pins = { ...PINS };
    result.scopeNote = SCOPE_NOTE;
    result.mutationBoundary = MUTATION_BOUNDARY;
    return result;
  }

  if (input.schema && input.schema !== INPUT_SCHEMA && input.schema !== FEED_SCHEMA) {
    if (
      input.schema !== "x402.r2.record.route_regression_input.v1" &&
      input.schema !== "pilot.nl.distribution.join_record_input.v1"
    ) {
      const result = malformedResult(
        `unsupported schema ${input.schema}`,
        { code: "invalid_input", got: input.schema },
        generatedAt,
      );
      result.pins = { ...PINS };
      return result;
    }
  }

  const ids = splitIdentities(input);
  const recordPart = extractRecord(input);
  const discovery = isPlainObject(input.discovery) ? input.discovery : null;
  const gaps = [];

  if (recordPart.kind === "missing") {
    gaps.push({
      code: "missing_record_feed",
      message:
        "No caller-supplied baseline+current route pair or dist_repair_feed — cannot diagnose route repair",
    });
    if (!ids.top.complete) {
      gaps.push({
        code: "missing_identity",
        message:
          "Missing required identity (provider + jobRef or sharedEvidenceId) — unknown/partial; Grexal not inferred",
      });
    }
    return {
      schema: RESULT_SCHEMA,
      status: STATUS.MISSING_RECORD,
      ok: true,
      generatedAt,
      inputId: input.inputId ?? null,
      identity: ids.top,
      matching: {
        compatible: false,
        joinedCount: 0,
        unjoinedCount: 0,
        keys: [],
        reason: "missing_record_feed",
      },
      diagnosis: null,
      feed: null,
      repair: {
        recommendations: [],
        beforeAfter: null,
        nextChecks: nextChecksFrom(null, gaps),
        ownerGuidance: true,
        causalProofOfLostCustomers: false,
      },
      gaps,
      claims: claims(),
      freeVsPriced: freeVsPriced(),
      pins: { ...PINS },
      scopeNote: SCOPE_NOTE,
      mutationBoundary: MUTATION_BOUNDARY,
      productionAcquisition: false,
    };
  }

  let feed;
  try {
    if (recordPart.kind === "feed") {
      feed = validateFeed(recordPart.feed);
    } else {
      feed = buildDistRepairFeed(recordPart.pair, { clock });
    }
  } catch (err) {
    const result = malformedResult(err.message, { code: err.code || "invalid_input", details: err.details }, generatedAt);
    result.pins = { ...PINS };
    return result;
  }

  if (feed.status === "rejected") {
    const result = malformedResult(
      feed.error?.message || "record feed rejected",
      { code: feed.error?.code || "rejected_feed", details: feed.error },
      generatedAt,
    );
    result.feed = summarizeFeed(feed);
    result.pins = { ...PINS };
    result.scopeNote = SCOPE_NOTE;
    result.mutationBoundary = MUTATION_BOUNDARY;
    return result;
  }

  if (!ids.top.complete && !ids.record.complete && !ids.discovery.complete) {
    gaps.push({
      code: "missing_identity",
      message:
        "Missing required identity (provider + jobRef or sharedEvidenceId) — unknown/partial; Grexal is not used as a universal adapter",
    });
  }

  const incompleteCat = catalogIncomplete(discovery);
  if (incompleteCat) {
    gaps.push({
      code: "incomplete_catalog",
      message:
        "Caller catalog/listing capture is incomplete — cannot prove the listed tool is globally removed or unlisted",
    });
  }

  if (feed.currentCaptureIncomplete === true) {
    gaps.push({
      code: "current_capture_incomplete",
      message:
        "Current route capture is incomplete — absence cannot prove global removal",
    });
  }
  if (feed.status === "partial_input") {
    gaps.push({
      code: "partial_input",
      message: `Feed status partial_input; partialReasons=${JSON.stringify(feed.partialReasons || [])}`,
    });
  }

  const compatible = identitiesCompatible(ids.discovery, ids.record);
  if (ids.discovery.complete && ids.record.complete && !compatible) {
    gaps.push({
      code: "identity_mismatch",
      message:
        "Discovery/listing identity and record identity do not share provider/jobRef/sharedEvidenceId — unrelated sources must not join",
    });
  }

  gaps.push({
    code: "no_revenue_from_feed",
    message: "Route repair is owner guidance — not invented revenue or lost-customer proof",
  });

  const joinable = selectJoinableRepairs(feed);
  const { bundle: rawBundle } = buildBundleFromFeed(feed, { includeActivation: true });
  const at = feed.generatedAt || generatedAt;
  const evidenceRef = feed.evidenceRef || `s185:${feed.feedId || "feed"}`;

  const useful = ids.record.complete
    ? rebindOutputs(rawBundle.usefulOutputEvidence, ids.record, at)
    : [];

  let acquisition = [];
  if (Array.isArray(discovery?.acquisitionEvidence) && discovery.acquisitionEvidence.length) {
    acquisition = discovery.acquisitionEvidence;
  } else if (ids.discovery.complete) {
    acquisition = deriveAcquisition(ids.discovery, joinable, at, evidenceRef);
    gaps.push({
      code: "fixture_derived_acquisition",
      message:
        "Acquisition events are identity-bound join wiring from the caller identity + repair feed, not observed live clicks",
    });
  }

  let diagnosis = null;
  if (ids.record.complete && useful.length) {
    const bundle = {
      schema: "pilot.r2.distribution.conversion_bundle.v1",
      cite: `S185 composition Record04@${PINS.record04} + DIST08@${PINS.dist08} + NL06@${PINS.nl06}; caller identity bound`,
      captureStatus: discovery?.captureStatus === "unavailable" || discovery?.captureStatus === "failed"
        ? "unavailable"
        : "ok",
      reason: "Identity-bound join of caller discovery and Record04 route-repair useful output",
      acquisitionEvidence: acquisition,
      usefulOutputEvidence: useful,
      compatibility: { allowCatalogManualCrossProvider: false },
    };
    try {
      rejectForbidden(bundle);
      diagnosis = diagnoseConversion(bundle, { clock });
      if (Array.isArray(diagnosis.joined) && diagnosis.joined.length > 0) {
        assertNoInventedConversion(diagnosis);
        assertUnknownsDefault(diagnosis);
      }
      diagnosis = scrubValue(diagnosis);
    } catch (err) {
      const result = malformedResult(err.message, { code: err.code || "invalid_input", details: err.details }, generatedAt);
      result.feed = summarizeFeed(feed);
      result.pins = { ...PINS };
      return result;
    }
  } else if (discovery?.captureStatus === "unavailable" || discovery?.captureStatus === "failed") {
    diagnosis = diagnoseConversion(
      {
        schema: "pilot.r2.distribution.conversion_bundle.v1",
        cite: `S185 unavailable discovery; DIST08@${PINS.dist08}`,
        captureStatus: "unavailable",
        reason: "Discovery/listing capture unavailable — do not claim zero users",
        acquisitionEvidence: [],
        usefulOutputEvidence: [],
      },
      { clock },
    );
    diagnosis = scrubValue(diagnosis);
    gaps.push({
      code: "unavailable_ne_no_users",
      message: "unavailable ≠ no_users — do not report activationCount as proof of zero users",
    });
  }

  const sample =
    joinable.find(
      (r) =>
        r.confidence === "high" &&
        (r.delta === "redirected" || r.delta === "removed"),
    ) ||
    joinable.find((r) => r.confidence === "high") ||
    joinable[0] ||
    null;
  const beforeAfter = sample ? buildBeforeAfterFromFeed(feed, sample) : null;

  const matching = diagnosis
    ? matchingFromDiagnosis(diagnosis, compatible || (ids.discovery.complete && identitiesCompatible(ids.discovery, ids.record)))
    : {
        compatible: false,
        joinedCount: 0,
        unjoinedCount: 0,
        keys: [],
        reason: ids.top.complete ? "no_diagnosis" : "missing_identity",
      };

  if (ids.discovery.complete && ids.record.complete && !compatible) {
    matching.compatible = false;
    matching.reason = "nonmatching_source_identity";
  }

  let status = STATUS.DIAGNOSED;
  if (!ids.top.complete && !ids.record.complete && !ids.discovery.complete) {
    status = STATUS.UNKNOWN;
  } else if (ids.discovery.complete && ids.record.complete && !compatible) {
    status = STATUS.MISMATCH;
  } else if (incompleteCat) {
    status = STATUS.INCOMPLETE_CATALOG;
  } else if (feed.status === "partial_input" || feed.currentCaptureIncomplete === true) {
    status = STATUS.PARTIAL;
  } else if (diagnosis?.status === "unavailable") {
    status = STATUS.PARTIAL;
  } else if (diagnosis?.status === "partial") {
    status = STATUS.PARTIAL;
  }

  const result = {
    schema: RESULT_SCHEMA,
    status,
    ok: true,
    generatedAt,
    inputId: input.inputId ?? feed.feedId ?? null,
    identity: {
      discovery: ids.discovery,
      record: ids.record,
      complete: ids.discovery.complete && ids.record.complete,
    },
    matching,
    diagnosis,
    feed: summarizeFeed(feed),
    repair: {
      recommendations: feed.repairRecommendations || [],
      beforeAfter,
      nextChecks: nextChecksFrom(feed, gaps),
      ownerGuidance: true,
      causalProofOfLostCustomers: false,
    },
    gaps,
    claims: claims(),
    freeVsPriced: freeVsPriced(),
    pins: { ...PINS },
    dist08Root,
    scopeNote: SCOPE_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    productionAcquisition: false,
  };
  return result;
}

export { extractRecord, catalogIncomplete, readIdentity };
export { productError };
