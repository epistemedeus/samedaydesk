/** R2-DISTRIBUTION-01 — Grexal Root publish-readiness staging constants. */

export const INVENTORY_SCHEMA = "pilot.r2.distribution.grexal_staging_inventory.v1";
export const PACKET_SCHEMA = "pilot.r2.distribution.root_action_packet.v1";

/** Top-level packet / stage outcomes. unavailable ≠ no_users. */
export const PACKET_STATUS = Object.freeze({
  READY_FOR_ROOT: "ready_for_root",
  BLOCKED_MISSING_INPUT: "blocked_missing_input",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
});

/**
 * Audience / discovery capture layer — kept DISTINCT from packet blocked states.
 * - unavailable: provider or capture could not be read
 * - no_users: capture succeeded; users/installs/runs are zero
 * - captured: capture succeeded with counts (may still be zero only via no_users)
 */
export const CAPTURE_STATUS = Object.freeze({
  CAPTURED: "captured",
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

/** Invented demand/revenue fields — never accept or emit. */
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

/** Must never appear in redistributable fixtures / packets. */
export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
]);

/** Worksheet-aligned intentional small flat recommendation (not applied here). */
export const RECOMMENDED_PRICE = Object.freeze({
  unit: "run_completed",
  amountUsd: 0.1,
  amountMicros: 100000,
  paidModelCalls: 0,
  note: "Intentional small flat after Root push; paidModelCalls=0 — do not copy Claude $0.18 example",
  setViaRecommendationOnly:
    "npx grexal agent price add run_completed 0.10  # Root only; not executed by this kit",
});

export const DRAFT_VISIBILITY_NOTES = Object.freeze({
  currentExpected: { status: "draft", visibility: "private", pricing: "unset" },
  publicDiscovery:
    "Root may set visibility public only after intentional price + review; kit never mutates provider.",
  selfRuns: "Self-runs against own agent are free (no-charge owner readback).",
});
