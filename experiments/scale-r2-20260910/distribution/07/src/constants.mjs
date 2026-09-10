/** R2-DISTRIBUTION-07 — Counterparty delivery packet constants. */

export const REQUEST_SCHEMA = "pilot.r2.distribution.verified_request.v1";
export const PACKET_SCHEMA = "pilot.r2.distribution.counterparty_handoff.v1";

/**
 * Packet outcomes.
 * - ready_handoff: unresolved verified request without requester fix → executable packet
 * - killed_requester_has_fix: requesterAlreadyHasFix or resolved-with-fixEvidence → kill
 * - blocked_missing_input: required fields missing
 * - unavailable: verified-request capture failed — do NOT claim no_users
 * - no_users: capture succeeded; zero verified requesters observed
 * unavailable ≠ no_users (hard invariant)
 */
export const PACKET_STATUS = Object.freeze({
  READY_HANDOFF: "ready_handoff",
  KILLED_REQUESTER_HAS_FIX: "killed_requester_has_fix",
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
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_SECRET: "forbidden_secret",
  KILLED_REQUESTER_HAS_FIX: "killed_requester_has_fix",
  UNAVAILABLE: "unavailable",
  NO_USERS: "no_users",
  BLOCKED_MISSING_INPUT: "blocked_missing_input",
});

/** Fields that imply unsolicited broadcast — reject anywhere. */
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
  "customerRevenue",
  "earnedPayout",
]);

export const FORBIDDEN_SECRET_FIELDS = Object.freeze([
  "credentials",
  "apiKey",
  "token",
  "password",
  "privateKey",
  "sessionCookie",
]);

/** Authoritative Grexal S149 surface (list price ≠ revenue). */
export const GREXAL_S149 = Object.freeze({
  surface: "grexal",
  listingStatus: "PUBLIC_ACTIVE",
  agentId: "j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  deploymentVersion: "v1",
  productSlug: "samedaydesk-source-change-evidence",
  artifactType: "source_change_evidence_pack",
  pricingRunCompletedUsd: 0.02,
  estimateReserveUsd: 0.025,
  estimateReserveIsCharge: false,
  customerExecutionRevenuePayout: false,
  receiptRef:
    "/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json",
  packagePath: "/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package",
  packageReadme:
    "/workspace/pilot/tmp/s124-root-0910.dYRsYW/grexal/package/README.md",
});
