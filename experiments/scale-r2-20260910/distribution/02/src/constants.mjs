/** R2-DISTRIBUTION-02 — Agensi Free skill Root handoff staging constants. */

export const INVENTORY_SCHEMA = "pilot.r2.distribution.agensi_staging_inventory.v1";
export const PACKET_SCHEMA = "pilot.r2.distribution.agensi_root_handoff_packet.v1";

export const PACKET_STATUS = Object.freeze({
  READY_FOR_ROOT: "ready_for_root",
  BLOCKED_MISSING_INPUT: "blocked_missing_input",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
  PENDING_REVIEW_HANDOFF: "pending_review_handoff",
});

export const CAPTURE_STATUS = Object.freeze({
  CAPTURED: "captured",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

export const PROVIDER_REVIEW = Object.freeze({
  PENDING_REVIEW: "PendingReview",
  NOT_SUBMITTED: "NotSubmitted",
  UNKNOWN: "Unknown",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_SECRET: "forbidden_secret",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

export const FORBIDDEN_INVENTORY_FIELDS = Object.freeze([
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
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);
