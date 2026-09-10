/** R2-DISTRIBUTION-06 — After-delivery continuation recipe constants. */

export const JOB_SCHEMA = "pilot.r2.distribution.continuation_job.v1";
export const RECIPE_SCHEMA = "pilot.r2.distribution.continuation_recipe.v1";

/**
 * Concrete useful job kinds tied to Pilot evidence.
 * Generic kinds like "version_alert" are rejected.
 */
export const USEFUL_JOB_KINDS = Object.freeze({
  SOURCE_CHANGE_EVIDENCE_PACK: "source_change_evidence_pack",
  AGENSI_PROVENANCE_COMPARE: "agensi_provenance_compare",
});

/** Generic / non-useful job kinds that must be rejected. */
export const FORBIDDEN_JOB_KINDS = Object.freeze([
  "version_alert",
  "version-alert",
  "generic_alert",
  "newsletter",
  "broadcast_blast",
  "unsolicited_ping",
]);

/**
 * Recipe / capture outcomes.
 * - available: prior delivery context captured; recipe ready for opt-in reuse
 * - blocked_missing_input: required fields missing (opt-in / jobRef)
 * - unavailable: prior delivery context capture failed — do NOT claim no_users
 * - no_users: capture succeeded; zero prior deliveries / installs / runs observed
 * unavailable ≠ no_users (hard invariant)
 */
export const RECIPE_STATUS = Object.freeze({
  AVAILABLE: "available",
  BLOCKED_MISSING_INPUT: "blocked_missing_input",
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
  FORBIDDEN_BROADCAST: "forbidden_broadcast",
  FORBIDDEN_OPT_IN: "forbidden_opt_in",
  FORBIDDEN_JOB_KIND: "forbidden_job_kind",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_SECRET: "forbidden_secret",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
  BLOCKED_MISSING_INPUT: "blocked_missing_input",
});

/** Fields that imply unsolicited broadcast — reject anywhere on job/recipe. */
export const FORBIDDEN_BROADCAST_FIELDS = Object.freeze([
  "broadcastAudience",
  "unsolicitedSend",
  "blastList",
  "autoNotifyAll",
  "massEmail",
  "pushAllUsers",
  "fanoutWithoutOptIn",
  "broadcastMessage",
]);

/** Invented demand/revenue fields that must never appear. */
export const FORBIDDEN_CLAIM_FIELDS = Object.freeze([
  "buyerCount",
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
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

/** Hard reuse policy invariants for every accepted recipe. */
export const REQUIRED_REUSE_POLICY = Object.freeze({
  optInRequired: true,
  broadcast: false,
});
