/** R2-DISTRIBUTION-08 — Distribution conversion diagnosis constants. */

export const BUNDLE_SCHEMA = "pilot.r2.distribution.conversion_bundle.v1";
export const DIAGNOSIS_SCHEMA = "pilot.r2.distribution.conversion_diagnosis.v1";

/** Acquisition event kinds (DIST-04 shape). */
export const ACQUISITION_KINDS = Object.freeze({
  LINK_PRESENTED: "linkPresented",
  LINK_ACTIVATED: "linkActivated",
});

/** Useful-output event kinds (DIST-05 shape). */
export const OUTPUT_KINDS = Object.freeze({
  DRAFT: "draft",
  LISTED: "listed",
  REVIEWED: "reviewed",
  INSTALL: "install",
  RUN: "run",
  EARNINGS: "earnings",
});

/** Source tags from DIST-04. */
export const SOURCE_TAGS = Object.freeze({
  GREXAL: "grexal",
  AGENSI: "agensi",
  CATALOG: "catalog",
  MANUAL: "manual",
});

/** Marketplace providers (DIST-05). */
export const PROVIDERS = Object.freeze({
  GREXAL: "grexal",
  AGENSI: "agensi",
});

/**
 * Diagnosis / capture outcomes.
 * - available: at least one source-compatible join produced
 * - partial: missing required fields on otherwise parseable input
 * - unavailable: acquisition or useful-output capture failed — do NOT claim zero users
 * - no_users: capture succeeded; zero activations or zero useful outputs
 * unavailable ≠ no_users (hard invariant)
 */
export const DIAGNOSIS_STATUS = Object.freeze({
  AVAILABLE: "available",
  PARTIAL: "partial",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

export const CAPTURE_STATUS = Object.freeze({
  OK: "ok",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
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
  NO_USERS: "no_users",
});

/**
 * Default map: acquisition sourceTag → compatible useful-output providers.
 * catalog/manual can join grexal or agensi when jobRef or sharedEvidenceId also align,
 * or when compatibility.allowCatalogManualCrossProvider is true (default false for
 * provider-only joins — catalog alone needs jobRef/sharedEvidenceId).
 */
export const DEFAULT_PROVIDER_SOURCE_MAP = Object.freeze({
  grexal: ["grexal"],
  agensi: ["agensi"],
  catalog: ["grexal", "agensi"],
  manual: ["grexal", "agensi"],
});

/** Fields that equate click/activation with buyer/conversion intent — always rejected. */
export const FORBIDDEN_INTENT_FIELDS = Object.freeze([
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
]);

/** Invented demand/revenue fields that must never appear. */
export const FORBIDDEN_CLAIM_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "inventedRevenue",
  "forecastRevenue",
  "projectedSales",
  "userCountInvented",
  "fakeEarnings",
  "syntheticRevenue",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
  "liveClicks",
  "realTraffic",
  "conversionCount",
  "conversionRate",
  "attributedRevenue",
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

/** S149 Grexal authoritative pointers (list price ≠ revenue). */
export const GREXAL_S149 = Object.freeze({
  agentId: "j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  deploymentId: "j570f14047dzpkhc0trh3fnp8s8e43sd",
  listingStatus: "PUBLIC_ACTIVE",
  pricingRunCompletedUsd: 0.02,
  estimateReserveUsd: 0.025,
  estimateReserveIsCharge: false,
  customerExecutionRevenuePayout: false,
  receiptRef:
    "/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json",
});
