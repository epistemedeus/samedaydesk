/** R2-DISTRIBUTION-04 — Agent acquisition intent links constants. */

export const ENTRIES_SCHEMA = "pilot.r2.distribution.acquisition_entries.v1";
export const TAGGED_SCHEMA = "pilot.r2.distribution.acquisition_tagged_links.v1";
export const SIGNAL_SCHEMA = "pilot.r2.distribution.acquisition_signal.v1";
export const EVENTS_SCHEMA = "pilot.r2.distribution.acquisition_result_events.v1";

/**
 * Allowed source tags for product entry links.
 * Opaque campaign/ref ids may accompany these as additional tags.
 */
export const SOURCE_TAGS = Object.freeze({
  GREXAL: "grexal",
  AGENSI: "agensi",
  CATALOG: "catalog",
  MANUAL: "manual",
});

/**
 * Allowed privacy-bounded event kinds.
 * Never equate activation with buyer/purchase intent.
 */
export const EVENT_KINDS = Object.freeze({
  LINK_PRESENTED: "linkPresented",
  LINK_ACTIVATED: "linkActivated",
});

/**
 * Capture / event batch outcomes.
 * - recorded: events captured successfully (may include activations)
 * - unavailable: capture failed — do NOT claim zero activations
 * - no_users: capture succeeded; zero activations observed
 * unavailable ≠ no_users (hard invariant)
 */
export const CAPTURE_OUTCOME = Object.freeze({
  RECORDED: "recorded",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_SECRET: "forbidden_secret",
  FORBIDDEN_INTENT: "forbidden_intent",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

/**
 * Field names that equate click/activation with buyer intent — always rejected.
 */
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
]);

export const FORBIDDEN_CLAIM_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
  "projectedSales",
  "forecastRevenue",
  "userCountInvented",
  "publicListingUrl",
  "liveClicks",
  "realTraffic",
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

/** Opaque tag key pattern: campaign / ref ids (alphanumeric + _-) */
export const OPAQUE_TAG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
export const OPAQUE_TAG_VALUE_RE = /^[A-Za-z0-9._:-]{1,128}$/;
