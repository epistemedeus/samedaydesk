/**
 * NL-DISTRIBUTION-06 — Join Record04 route-repair feed into DIST-08 diagnosis.
 *
 * Source-compatible only. Gaps explicit. No revenue / live-traffic invention.
 * Fixture-derived acquisition wiring is labeled; click ≠ conversion.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ACTIONABLE_RECOMMENDATIONS,
  BUNDLE_SCHEMA,
  ERROR_CODES,
  JOIN_INPUT_SCHEMA,
  JOIN_SCHEMA,
  MUTATION_BOUNDARY,
  PINS,
  REUSE_FROM,
  SCOPE_NOTE,
} from "./constants.mjs";
import { isPlainObject, joinError, rejectForbidden, validateFeed } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(__dirname, "..");

export function defaultDist08Root() {
  if (process.env.DIST08_ROOT) return resolve(process.env.DIST08_ROOT);
  // Sibling distribution/08 inside same samedaydesk worktree
  return resolve(PKG_ROOT, "..", "08");
}

async function loadDiagnose(dist08Root = defaultDist08Root()) {
  const diagnosePath = join(dist08Root, "src", "diagnose.mjs");
  if (!existsSync(diagnosePath)) {
    throw joinError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `DIST-08 diagnose.mjs missing at ${diagnosePath}`,
      { dist08Root, pin: PINS.dist08 },
    );
  }
  return import(pathToFileURL(diagnosePath).href);
}

function defaultClock() {
  return Date.now();
}

function jobRefFor(feed, repair) {
  return `nl-record-04:${feed.feedId || "feed"}:${repair.routeKey}`;
}

function evidenceRefFor(feed) {
  return (
    feed.evidenceRef ||
    `experiments/scale-r2-20260910/record_jobs/nl-04-dist-feed/${PINS.feedArtifact}`
  );
}

/**
 * Pick repairs that can become useful-output evidence.
 * Skips no_action_unchanged and skip_rejected_input.
 */
export function selectJoinableRepairs(feed) {
  const recs = Array.isArray(feed.repairRecommendations)
    ? feed.repairRecommendations
    : [];
  return recs.filter(
    (r) =>
      r &&
      typeof r.routeKey === "string" &&
      ACTIONABLE_RECOMMENDATIONS.includes(r.recommendation),
  );
}

/**
 * Build a DIST-08 conversion_bundle.v1 from a Record04 feed.
 *
 * Acquisition events are fixture-derived for source-compatible join wiring
 * (catalog linkPresented + linkActivated per joinable repair). They are NOT
 * live traffic evidence — gaps[] and claims.denies make that explicit.
 */
export function buildBundleFromFeed(feed, options = {}) {
  const validated = validateFeed(feed);
  const at = validated.generatedAt || "2026-09-10T12:00:00.000Z";
  const joinable = selectJoinableRepairs(validated);
  const includeActivation = options.includeActivation !== false;
  const acquisitionEvidence = [];
  const usefulOutputEvidence = [];
  const gaps = [];

  if (joinable.length === 0) {
    gaps.push({
      code: "no_joinable_repairs",
      message:
        "No actionable repairRecommendations to join; diagnosis may be no_users or empty joined[]",
    });
  }

  if (validated.currentCaptureIncomplete === true) {
    gaps.push({
      code: "current_capture_incomplete",
      message:
        "Feed currentCaptureIncomplete=true — honor cannot_prove_global_removal; do not claim global route removal",
    });
  }

  if (validated.status === "partial_input") {
    gaps.push({
      code: "partial_input",
      message: `Feed status partial_input; partialReasons=${JSON.stringify(validated.partialReasons || [])}`,
    });
  }

  for (const repair of joinable) {
    const jobRef = jobRefFor(validated, repair);
    const evRef = evidenceRefFor(validated);

    if (repair.recommendation === "cannot_prove_global_removal") {
      gaps.push({
        code: "cannot_prove_global_removal",
        routeKey: repair.routeKey,
        message:
          "Absence under incomplete current capture cannot prove global removal",
      });
    }
    if (repair.coveragePreserved === false && validated.currentCaptureIncomplete) {
      gaps.push({
        code: "coverage_not_preserved_under_incomplete",
        routeKey: repair.routeKey,
        message:
          "coveragePreserved=false under incomplete capture — treat removal as unproven",
      });
    }

    acquisitionEvidence.push({
      id: `acq-nl06-presented:${repair.routeKey}`,
      kind: "linkPresented",
      sourceTag: "catalog",
      linkId: `route:${repair.routeKey}`,
      jobRef,
      sharedEvidenceId: jobRef,
      at,
      evidenceRef: evRef,
      fixtureDerived: true,
      note: "Fixture-derived catalog presentation for source-compatible join wiring; not live traffic",
    });

    if (includeActivation) {
      acquisitionEvidence.push({
        id: `acq-nl06-activated:${repair.routeKey}`,
        kind: "linkActivated",
        sourceTag: "catalog",
        linkId: `route:${repair.routeKey}`,
        jobRef,
        sharedEvidenceId: jobRef,
        at,
        evidenceRef: evRef,
        impliesBuyerIntent: false,
        fixtureDerived: true,
        note: "Fixture-derived activation for join wiring only; click ≠ conversion; not live traffic",
      });
    }

    usefulOutputEvidence.push({
      id: `out-nl06-route-repair:${repair.routeKey}`,
      kind: "run",
      provider: "grexal",
      jobRef,
      sharedEvidenceId: jobRef,
      at,
      evidenceRef: evRef,
      note: `NL-04 repair: ${repair.recommendation} for ${repair.routeKey}`,
      routeRepair: {
        routeKey: repair.routeKey,
        delta: repair.delta,
        recommendation: repair.recommendation,
        confidence: repair.confidence,
        coveragePreserved: repair.coveragePreserved === true,
      },
    });
  }

  gaps.push({
    code: "fixture_derived_acquisition",
    message:
      "Acquisition events are fixture-derived from Record04 repair feed for DIST-08 join wiring — not observed live clicks/traffic",
  });
  gaps.push({
    code: "causation_independence_default_unknown",
    message:
      "DIST-08 will mark causation/customerIndependence unknown unless sharedEvidenceId / independentCustomerRef prove otherwise; sharedEvidenceId here is fixture join key only",
  });
  gaps.push({
    code: "no_revenue_from_feed",
    message:
      "Route repair feed carries no customer earnings/payout — do not invent revenue from recommendations or list price",
  });

  const bundle = {
    schema: BUNDLE_SCHEMA,
    cite: `NL-DISTRIBUTION-06 join: Record04@${PINS.record04Export} → DIST-08@${PINS.dist08}; S172@${PINS.s172Tip} already done (no overlap)`,
    captureStatus: "ok",
    reason: `Joined ${joinable.length} Record04 repair recommendation(s) into DIST-08 conversion bundle`,
    acquisitionEvidence,
    usefulOutputEvidence,
    compatibility: {
      // sharedEvidenceId + jobRef align per route; catalog+grexal with shared ids is compatible
      allowCatalogManualCrossProvider: false,
    },
    sourceFeed: {
      schema: validated.schema,
      feedId: validated.feedId ?? null,
      status: validated.status,
      currentCaptureIncomplete: validated.currentCaptureIncomplete === true,
      pin: PINS.record04Export,
    },
  };

  rejectForbidden(bundle);
  return { bundle, gaps, joinable };
}

/**
 * Optional: build before/after fixture for the highest-confidence actionable repair.
 */
export function buildBeforeAfterFromFeed(feed, repair) {
  const summary = feed.routeReportSummary || {};
  return {
    schema: "pilot.nl.record.route_repair_before_after.v1",
    sourceFeed: {
      schema: feed.schema,
      feedId: feed.feedId,
      status: feed.status,
      merchantPin: PINS.merchantRecord05,
      dist08Cite: PINS.dist08,
      record04ExportPin: PINS.record04Export,
    },
    routeKey: repair.routeKey,
    before: {
      deltaObserved: repair.delta,
      notes: [...(repair.notes || [])],
      listingImplication:
        repair.delta === "redirected"
          ? "listed_path_may_point_at_stale_target"
          : repair.delta === "removed"
            ? "listed_path_may_be_gone_within_supplied_pair"
            : "listed_path_may_be_inaccessible",
    },
    after: {
      recommendation: repair.recommendation,
      confidence: repair.confidence,
      coveragePreserved: repair.coveragePreserved === true,
      actionableStep:
        repair.recommendation === "update_listed_route_or_redirect_target"
          ? "Update distribution listing URL/redirect to match current finalUrl from supplied pair."
          : repair.recommendation === "recommend_distribution_recheck"
            ? "Recheck distribution listing against current supplied capture before claiming removal."
            : "Diagnose access or listing path using supplied pair only.",
    },
    scopeNote:
      "Fixture derived from NL-RECORD-04 supplied-pair feed only. Not a crawl; not traffic/ranking/revenue.",
    routeReportSummary: {
      status: summary.status,
      baselineMeta: summary.baselineMeta,
      currentMeta: summary.currentMeta,
      deltaCounts: summary.summary?.deltaCounts ?? summary.deltaCounts,
    },
  };
}

function normalizeInput(feedOrInput) {
  if (!isPlainObject(feedOrInput)) {
    throw joinError(ERROR_CODES.INVALID_INPUT, "input must be an object");
  }
  rejectForbidden(feedOrInput);

  // Unavailable wrapper
  if (
    feedOrInput.schema === JOIN_INPUT_SCHEMA ||
    feedOrInput.captureStatus === "unavailable" ||
    feedOrInput.captureStatus === "failed"
  ) {
    return {
      kind: "unavailable",
      reason:
        feedOrInput.reason ||
        "Record04 feed capture unavailable — do not claim zero users",
      feed: feedOrInput.feed || null,
    };
  }

  // Bare feed
  if (feedOrInput.schema === "pilot.nl.record.dist_repair_feed.v1") {
    return { kind: "feed", feed: feedOrInput };
  }

  // Wrapped { feed }
  if (isPlainObject(feedOrInput.feed)) {
    return { kind: "feed", feed: feedOrInput.feed };
  }

  throw joinError(
    ERROR_CODES.INVALID_INPUT,
    "expected dist_repair_feed.v1 or join_record_input with captureStatus",
  );
}

/**
 * Main entry: join Record04 feed → DIST-08 diagnosis bundle + explicit gaps.
 */
export async function joinRecordToDiagnosis(feedOrInput, options = {}) {
  const clock = options.clock || defaultClock;
  const dist08Root = options.dist08Root || defaultDist08Root();
  const generatedAt = new Date(clock()).toISOString();
  const normalized = normalizeInput(feedOrInput);

  if (normalized.kind === "unavailable") {
    const { diagnoseConversion } = await loadDiagnose(dist08Root);
    const emptyBundle = {
      schema: BUNDLE_SCHEMA,
      cite: `NL-DISTRIBUTION-06 unavailable path; DIST-08@${PINS.dist08}`,
      captureStatus: "unavailable",
      reason: normalized.reason,
      acquisitionEvidence: [],
      usefulOutputEvidence: [],
    };
    const diagnosis = diagnoseConversion(emptyBundle, { clock });
    const gaps = [
      {
        code: "capture_unavailable",
        message: normalized.reason,
      },
      {
        code: "unavailable_ne_no_users",
        message:
          "unavailable ≠ no_users — do not report activationCount/usefulOutputActionableCount",
      },
    ];
    return {
      schema: JOIN_SCHEMA,
      status: "unavailable",
      generatedAt,
      reuseFrom: REUSE_FROM,
      pins: { ...PINS },
      scopeNote: SCOPE_NOTE,
      mutationBoundary: MUTATION_BOUNDARY,
      gaps,
      bundle: emptyBundle,
      diagnosis,
      beforeAfter: null,
      joinableCount: 0,
      claims: {
        conversionFromClick: false,
        revenueFromListPrice: false,
        buyerIntentFromActivation: false,
        fixtureDerivedJoin: true,
        denies: ["invented_revenue", "live_traffic", "seo_ranking"],
      },
    };
  }

  const { bundle, gaps, joinable } = buildBundleFromFeed(normalized.feed, options);
  const { diagnoseConversion, assertNoInventedConversion, assertUnknownsDefault } =
    await loadDiagnose(dist08Root);

  const diagnosis = diagnoseConversion(bundle, { clock });

  // Harden: never allow invented conversion/revenue claims through
  if (Array.isArray(diagnosis.joined) && diagnosis.joined.length > 0) {
    assertNoInventedConversion(diagnosis);
    assertUnknownsDefault(diagnosis);
  }

  // Prefer high-confidence redirected/removed for before/after sample
  const sample =
    joinable.find(
      (r) =>
        r.confidence === "high" &&
        (r.delta === "redirected" || r.delta === "removed"),
    ) ||
    joinable.find((r) => r.confidence === "high") ||
    joinable[0] ||
    null;

  const beforeAfter = sample
    ? buildBeforeAfterFromFeed(normalized.feed, sample)
    : null;

  // Enrich diagnosis with route-repair index (non-revenue)
  const routeRepairIndex = joinable.map((r) => ({
    routeKey: r.routeKey,
    delta: r.delta,
    recommendation: r.recommendation,
    confidence: r.confidence,
    coveragePreserved: r.coveragePreserved === true,
    jobRef: jobRefFor(normalized.feed, r),
  }));

  const result = {
    schema: JOIN_SCHEMA,
    status:
      diagnosis.status === "unavailable"
        ? "unavailable"
        : diagnosis.status === "partial"
          ? "partial"
          : joinable.length === 0
            ? "no_joinable"
            : "joined",
    generatedAt,
    reuseFrom: REUSE_FROM,
    pins: { ...PINS },
    scopeNote: SCOPE_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    gaps,
    bundle,
    diagnosis: {
      ...diagnosis,
      routeRepairIndex,
      nl06: {
        record04ExportPin: PINS.record04Export,
        dist08Pin: PINS.dist08,
        s172TipDone: PINS.s172Tip,
        feedId: normalized.feed.feedId ?? null,
        feedStatus: normalized.feed.status,
        currentCaptureIncomplete:
          normalized.feed.currentCaptureIncomplete === true,
      },
    },
    beforeAfter,
    joinableCount: joinable.length,
    claims: {
      conversionFromClick: false,
      revenueFromListPrice: false,
      buyerIntentFromActivation: false,
      fixtureDerivedJoin: true,
      denies: ["invented_revenue", "live_traffic", "seo_ranking"],
    },
  };

  rejectForbidden(result);
  return result;
}

export { validateFeed, rejectForbidden, joinError };
