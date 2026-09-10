/** NL-DISTRIBUTION-06 — Join Record04 repair feed → DIST-08 conversion diagnosis. */

export const JOIN_SCHEMA = "pilot.nl.distribution.join_record_result.v1";
export const JOIN_INPUT_SCHEMA = "pilot.nl.distribution.join_record_input.v1";
export const FEED_SCHEMA = "pilot.nl.record.dist_repair_feed.v1";
export const BUNDLE_SCHEMA = "pilot.r2.distribution.conversion_bundle.v1";
export const DIAGNOSIS_SCHEMA = "pilot.r2.distribution.conversion_diagnosis.v1";
export const BEFORE_AFTER_SCHEMA = "pilot.nl.record.route_repair_before_after.v1";

export const REUSE_FROM = "NL-DISTRIBUTION-06";

export const PINS = Object.freeze({
  dist08: "ea000772cdbd6d5df7174369dcef9aa2270e5723",
  record04Export: "8b8e44376e9414f540483a526b048beb9e4dc370",
  s172Tip: "ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe",
  merchantRecord05: "a7e2cd7a2223e2aa7e7e09eebf3695aba4731205",
  record04Path: "experiments/scale-r2-20260910/record_jobs/nl-04-dist-feed",
  dist08Path: "experiments/scale-r2-20260910/distribution/08",
  feedArtifact: "artifacts/dist-repair-feed.positive.json",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_INTENT: "forbidden_intent",
  FORBIDDEN_SYNTHETIC_REVENUE: "forbidden_synthetic_revenue",
  FORBIDDEN_SECRET: "forbidden_secret",
  INCOMPATIBLE: "incompatible",
  UNAVAILABLE: "unavailable",
  REJECTED_FEED: "rejected_feed",
});

/** Repair actions that can become useful-output route-repair evidence. */
export const ACTIONABLE_RECOMMENDATIONS = Object.freeze([
  "update_listed_route_or_redirect_target",
  "recommend_distribution_recheck",
  "diagnose_access_or_listing_path",
  "surface_broken_or_removed_route",
  "consider_listing_new_route",
  "confirm_restored_route_in_listing",
  "record_status_change_for_listing",
  "recheck_with_complete_capture",
  "cannot_prove_global_removal",
]);

/** Fields that must never appear (union of Record04 + DIST-08 forbids). */
export const FORBIDDEN_FIELDS = Object.freeze([
  "seoRank",
  "seoScore",
  "seoRanking",
  "rankingScore",
  "rankScore",
  "universalRank",
  "trafficProjection",
  "trafficEstimate",
  "trafficScore",
  "pageViews",
  "organicTraffic",
  "investmentRecommendation",
  "buySellAdvice",
  "investAdvice",
  "siteHealthScore",
  "healthScore",
  "siteHealth",
  "reputation",
  "reputationScore",
  "revenue",
  "revenueProjection",
  "buyerIntent",
  "purchaseIntent",
  "intentToBuy",
  "buyerIntentScore",
  "purchaseIntentScore",
  "clickImpliesIntent",
  "activationImpliesIntent",
  "conversionIntent",
  "qualifiedLead",
  "hotLead",
  "clickIsConversion",
  "activationIsConversion",
  "buyerCount",
  "earnedUsd",
  "earnedUsdc",
  "inventedRevenue",
  "forecastRevenue",
  "projectedSales",
  "userCountInvented",
  "fakeEarnings",
  "syntheticRevenue",
  "escrowBalance",
  "claimAuthority",
  "liveClicks",
  "realTraffic",
  "conversionCount",
  "conversionRate",
  "attributedRevenue",
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

export const SCOPE_NOTE =
  "Joins NL-RECORD-04 route-repair feed into DIST-08 conversion diagnosis. Source-compatible events only. Gaps explicit. Fixture-derived wiring ≠ live traffic/revenue. S172 tip already saved — no overlap.";

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions. No CloudAgent. No paid invoke.";
