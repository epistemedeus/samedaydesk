/** R2-EXCHANGE-01 — Executable acceptance brief constants. */

export const SCHEMA = "neomorphic.r2.exchange.acceptance_brief.v1";
export const REQUIREMENTS_SCHEMA = "neomorphic.r2.exchange.task_requirements.v1";
export const CHECK_RESULT_SCHEMA = "neomorphic.r2.exchange.check_result.v1";

export const CHECK_KIND = Object.freeze({
  JSON_PATH_EXISTS: "json_path_exists",
  JSON_PATH_EQUALS: "json_path_equals",
  JSON_PATH_TYPE: "json_path_type",
  STRING_MAX_LENGTH: "string_max_length",
  ARRAY_MIN_LENGTH: "array_min_length",
  ENUM_IN: "enum_in",
  HTTPS_URL_SHAPE: "https_url_shape",
  SHA256_HEX: "sha256_hex",
  REGEX_MATCH: "regex_match",
});

export const CRITERION_CLASS = Object.freeze({
  OBJECTIVE: "objective",
  SUBJECTIVE: "subjective",
});

export const SUBJECTIVE_STATUS = Object.freeze({
  UNRESOLVED: "unresolved",
});

export const BRIEF_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL_INPUT: "partial_input",
  REJECTED: "rejected",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  UNSUPPORTED_CHECK: "unsupported_check",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

/** Fields that must never appear on a brief (no invented demand/revenue). */
export const FORBIDDEN_BRIEF_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
]);

export const JSON_TYPES = Object.freeze([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
]);
