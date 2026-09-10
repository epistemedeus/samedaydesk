/** R2-DISTRIBUTION-03 — Portable package catalog constants. */

export const INVENTORY_SCHEMA = "pilot.r2.distribution.portable_catalog_inventory.v1";
export const CATALOG_SCHEMA = "pilot.r2.distribution.portable_package_catalog.v1";

/**
 * Package availability statuses.
 * - available_local: package tree present locally; offline install/validate runnable
 * - draft_private: provider draft exists; visibility private; public listing not observed
 * - active_public: provider PUBLIC_ACTIVE (authoritative receipt); public deployment + pricing observed
 * - pending_review: provider review pending; Root owns next event
 * - unavailable: capture/provider read could not be obtained (do NOT claim zero users)
 * - no_users: capture succeeded; users/installs/runs are zero
 * unavailable ≠ no_users (hard invariant)
 */
export const AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE_LOCAL: "available_local",
  DRAFT_PRIVATE: "draft_private",
  ACTIVE_PUBLIC: "active_public",
  PENDING_REVIEW: "pending_review",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
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
  "userCountInvented",
  "publicListingUrl",
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

export const PACKAGE_KINDS = Object.freeze([
  "grexal_agent_package",
  "agensi_free_skill",
  "other",
]);
