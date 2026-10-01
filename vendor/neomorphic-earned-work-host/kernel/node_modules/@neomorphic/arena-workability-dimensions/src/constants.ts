export const SCHEMA_ENVELOPE = "arena.a3.workability-dimensions.envelope.v1" as const;
export const SCHEMA_PACKET = "arena.a3.workability-dimensions.packet.v1";
export const SCHEMA_CARD_A3 = "arena.a3.workability-dimensions.job-card.v1";
/** Accepted for cross-judge with the S277/F03 pack when that tree is present. */
export const SCHEMA_CARD_F03 = "s277.bounty-intelligence.job-card.v1";

export const TEST_NOW = "2026-09-11T15:00:00.000Z";
export const S282_OBSERVATION_DATE = "2026-09-11";

export const CAPABILITY_PREFLIGHT_PIN = "45391e02";

export const DEFAULT_CLAIM_AUTHORITY = "none" as const;

export const WARNINGS = Object.freeze([
  "claimAuthority defaults to none. HTTP 200 on a list endpoint is not authority to claim.",
  "eligibility, funding, and effort are three types. mixedScore is displayOnly and never a gate.",
  "winProbability stays unknown. A 1/submissions figure is a labelled guess, not a fact.",
  "An escrow tx hash is not remaining claimable balance. A funded flag without a real hash is not escrowed.",
  "This arena arm never POSTs to claim endpoints and never bids or pays.",
]);
