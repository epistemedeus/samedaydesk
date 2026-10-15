/**
 * Funded-task terms contract constants (F17).
 *
 * S275 DESIGN was not present on this checkout. Names below follow the F17 pin
 * and the S275 reuse list from the assignment (reward amount/asset/network
 * strings, opaque taskId, immutable termsVersion, fundingState, reservation
 * expiry). `services/earned-work/` does not exist here; this pack is the
 * importable schema F01/F04 should depend on.
 */

export const SCHEMA_ID = "neomorphic.funded-task-terms.v1" as const;
export const SCHEMA_VERSION = 1 as const;

/** termsVersion is a content hash, not an integer. See FEATURE-MAP.md. */
export const TERMS_VERSION_KIND = "content-hash" as const;
export const TERMS_VERSION_PREFIX = "sha256:" as const;

export const USDC_DECIMALS = 6 as const;
export const MAX_TOKEN_DECIMALS = 18;
export const MAX_CORRECTIONS = 16;
export const MAX_RESERVATION_SECONDS = 315_360_000; // 10 years
export const MIN_RESERVATION_SECONDS = 1;

export const ID_MAX = 128;
export const TEXT_MAX = 8000;
export const URI_MAX = 2048;
export const ASSET_MAX = 32;
export const NETWORK_MAX = 128;
export const MEDIA_TYPE_MAX = 128;
export const SPDX_MAX = 128;
export const VERIFIER_MAX = 256;

export const PROVENANCES = ["test", "fixture", "production"] as const;
export type Provenance = (typeof PROVENANCES)[number];

/**
 * Snapshot of funding condition on an immutable terms document.
 * Live ledger transitions belong in F04, not by mutating a hashed blob.
 */
export const FUNDING_STATES = [
  "unfunded",
  "reserved",
  "funded",
  "released",
  "expired",
  "cancelled",
  "failed",
] as const;
export type FundingState = (typeof FUNDING_STATES)[number];

export const EFFORT_UNITS = ["minutes", "hours", "days", "weeks"] as const;
export type EffortUnit = (typeof EFFORT_UNITS)[number];

export const OBLIGATION_EVENTS = ["on_requester_accept"] as const;
export type ObligationEvent = (typeof OBLIGATION_EVENTS)[number];

export const RAIL_SETTLEMENT = "outside_this_pack" as const;

export const APPEAL_BIND = "requester_only_accept" as const;

/**
 * Keys that describe launching or inlining untrusted artifact code.
 * Rejected anywhere in the document. The validator never evals, fetches, or
 * spawns against `artifact.ref`.
 */
export const EXECUTABLE_PAYLOAD_KEYS = Object.freeze([
  "executablePayload",
  "executable_payload",
  "executable-payload",
  "executable",
  "inlineCode",
  "inlineCodePayload",
  "sourceCode",
  "bytecode",
  "wasm",
  "entrypoint",
  "command",
  "argv",
  "script",
  "eval",
  "launch",
  "launchCommand",
  "workerScript",
  "untrustedCode",
  "moduleSource",
  "runCommand",
  "childProcess",
  "spawn",
  "shell",
] as const);

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_terms",
  FLOAT_REWARD: "float_reward",
  NUMBER_MONEY: "number_money",
  MISSING_VERIFIER_VERSION: "missing_verifier_version",
  UNBOUNDED_CORRECTIONS: "unbounded_corrections",
  MISSING_RESERVATION_DURATION: "missing_reservation_duration",
  MISSING_APPEAL_ROUTE: "missing_appeal_route",
  ARTIFACT_EXECUTABLE_PAYLOAD: "artifact_executable_payload",
  TERMS_VERSION_MISMATCH: "terms_version_mismatch",
  ATOMIC_MISMATCH: "atomic_amount_mismatch",
});

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
