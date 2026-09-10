/** R2-DISTRIBUTION-05 — Marketplace readback collector constants (Grexal + Agensi only). */

export const EVENTS_SCHEMA = "pilot.r2.distribution.marketplace_events.v1";
export const SUMMARY_SCHEMA = "pilot.r2.distribution.marketplace_readback_summary.v1";

/** Allowed marketplace providers — reject everything else in validate. */
export const PROVIDERS = Object.freeze({
  GREXAL: "grexal",
  AGENSI: "agensi",
});

/**
 * Observed marketplace event kinds.
 * Earnings may only carry amounts present in cited evidence.
 */
export const EVENT_KINDS = Object.freeze({
  DRAFT: "draft",
  LISTED: "listed",
  REVIEWED: "reviewed",
  INSTALL: "install",
  RUN: "run",
  EARNINGS: "earnings",
});

/**
 * Summary / capture outcomes.
 * - recorded: events collected successfully (may include install/run)
 * - partial: some required fields missing on otherwise parseable input
 * - unavailable: capture failed OR earnings evidence missing — do NOT claim zero
 * - no_users: capture succeeded; install/run counts explicitly zero
 * unavailable ≠ no_users (hard invariant)
 */
export const SUMMARY_STATUS = Object.freeze({
  RECORDED: "recorded",
  PARTIAL: "partial",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

export const EARNINGS_STATUS = Object.freeze({
  OBSERVED: "observed",
  UNAVAILABLE: "unavailable",
  OMITTED: "omitted",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_PROVIDER: "forbidden_provider",
  FORBIDDEN_SYNTHETIC_REVENUE: "forbidden_synthetic_revenue",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_SECRET: "forbidden_secret",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

/** Invented demand/revenue fields that must never appear on events or summaries. */
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
