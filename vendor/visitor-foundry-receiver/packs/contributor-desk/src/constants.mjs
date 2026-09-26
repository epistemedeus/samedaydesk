/** W0-R3-05 walletless public contributor desk — pins and honesty vocabulary. */

export const PACK_ID = "contributor-desk";
export const PACK_VERSION = "0.1.0";
export const WAVE_ID = "W0-R3-05";
export const FAMILY = "earned-work";
export const SCHEMA = "neomorphic.contributor_desk.v1";
export const SESSION_SCHEMA = "neomorphic.contributor_desk.session.v1";
export const PUBLIC_TASK_SCHEMA = "neomorphic.contributor_desk.public_task.v1";
export const OWED_VERSUS_PAID_SCHEMA = "neomorphic.contributor_desk.owed_versus_paid.v1";
export const APPEAL_SCHEMA = "neomorphic.contributor_desk.appeal.v1";

export const CLOCK_ISO = "2026-09-17T15:00:00.000Z";

/** I01 / PR54 content-hash terms. Integer F01 keys are not a start-work key. */
export const I01_TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;

export const I01_PIN = Object.freeze({
  repo: "epistemedeus/neomorphic-io",
  ref: "fable/integration-earned-work",
  pr: 54,
  sha: "346bbd3cbe6943a83b2077c455174d74b7a493ad",
  termsVersion: "sha256:<64-hex>",
  note: "I01/E01 owns earned-work hash terms. This pack does not copy F01 or services/earned-work.",
});

export const F01_CITE = Object.freeze({
  pr: 39,
  ref: "fable/f01-s275-kernel",
  note: "S275 kernel is not on main. This pack adapts the public/contributor HTTP shape only.",
});

export const F04_CITE = Object.freeze({
  pr: 45,
  note: "Walletless late address is an allowlisted destination string, never a payout key.",
});

/** R3-09 owns settlement receipts. This desk does not render them. */
export const SETTLEMENT_RECEIPT_VIEW = Object.freeze({
  owner: "R3-09",
  relation: "disjoint",
  rendersSettlementReceipt: false,
  note: "Owed-versus-paid is an IOU comparison. It is not a settlement receipt view.",
});

export const NULL_PAYOUT_ADAPTER = "null_nonpaying_v0";
export const EARNED_WORK = "nonpaying prototype; do not display IOU as settled";
export const PAYMENT_AUTHORITY = "none";
export const CLAIM_AUTHORITY = "contributor_session";
export const DESK_ROLE = "public_contributor";

export const REWARD_HYPOTHESIS = Object.freeze({
  amount: "0.10",
  asset: "USDC",
  network: "base",
  note: "Disclosed hypothesis. Not escrow, not a chain transfer, not profit.",
});

export const ALLOWED_PAYOUT_DESTINATION_RE = /^(?:usdc:base:)?0x[0-9a-fA-F]{40}$/;

export const CODE = Object.freeze({
  DESK_HOLDS_EARNED_WORK_SECRET: "desk_holds_earned_work_secret",
  CONTRIBUTOR_HOLDS_PAYOUT_KEY: "contributor_holds_payout_key",
  NOT_WALLETLESS: "not_walletless",
  INTEGER_TERMS_VERSION_REJECTED: "integer_terms_version_rejected",
  INVALID_TERMS_VERSION: "invalid_terms_version",
  TERMS_CHANGED: "terms_changed",
  UNFUNDED: "unfunded",
  RESERVED_ELSEWHERE: "reserved_elsewhere",
  NOT_CLAIMABLE: "not_claimable",
  NOT_FOUND: "not_found",
  APPEAL_NOT_AVAILABLE: "appeal_not_available",
  APPEAL_UNSUPPORTED_ON_ORIGIN: "appeal_unsupported_on_origin",
  OWNER_ROUTE_REFUSED: "owner_route_refused",
  SECRET_IN_FIELD: "secret_in_field",
  USAGE: "usage",
  INVALID_INPUT: "invalid_input",
  ADAPTER_REFUSED: "adapter_refused",
  FORGED_SETTLEMENT_EVIDENCE: "forged_settlement_evidence",
});

export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  DESK_HOLDS_SECRET: 3,
  CONTRIBUTOR_HOLDS_PAYOUT_KEY: 4,
});

export const HONESTY_NOTES = Object.freeze([
  "Walletless: browse, claim, and status do not require a wallet, seed, or chain signature.",
  "The desk process must not hold an EARNED_WORK secret (owner token, payout key, or sibling credential).",
  "A contributor session must not hold a payout key. Late address is an allowlisted destination string only.",
  "payoutState=owed is an IOU. paid stays false. settled stays false. transfer stays null.",
  "This pack does not render R3-09 settlement receipts and never emits actual_completion.",
  "Integer F01 termsVersion is rejected as a start-work key. I01 uses sha256: + 64 hex.",
  "Fixture provenance is labelled. Local journey success is not hosted settlement.",
  "Owner routes (accept, reserve, obligation, payout-as-owner) are out of this desk.",
]);

export const OWNER_ROUTES = Object.freeze([
  "POST /v1/tasks",
  "POST /v1/tasks/:taskId/terms",
  "POST /v1/tasks/:taskId/funding/reserve",
  "POST /v1/contributor-tokens",
  "POST /v1/tasks/:taskId/verdicts",
  "POST /v1/tasks/:taskId/accept",
  "POST /v1/tasks/:taskId/reject",
  "GET /v1/tasks/:taskId/obligation",
  "GET /v1/tasks/:taskId/payout",
]);

export const CONTRIBUTOR_ROUTES = Object.freeze([
  "GET /v1/tasks",
  "GET /v1/tasks/:taskId",
  "POST /v1/tasks/:taskId/claims",
  "POST /v1/tasks/:taskId/submissions",
]);
