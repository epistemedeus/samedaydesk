/** R2-CAPABILITIES-01 — Task requirements envelope constants.
 * CHECK_KIND / CRITERION_CLASS / FORBIDDEN_* reused from R2-EXCHANGE-01 semantics.
 */

export const ENVELOPE_SCHEMA = "pilot.r2.capabilities.task_requirements_envelope.v1";

/** Canonical Exchange requirements schema (reuseFrom R2-EXCHANGE-01). */
export const REQUIREMENTS_SCHEMA = "neomorphic.r2.exchange.task_requirements.v1";

/** Optional capabilities alias that maps to the same requirements shape. */
export const REQUIREMENTS_SCHEMA_ALIAS = "pilot.r2.capabilities.task_requirements.v1";

export const ACCEPTED_REQUIREMENTS_SCHEMAS = Object.freeze([
  REQUIREMENTS_SCHEMA,
  REQUIREMENTS_SCHEMA_ALIAS,
]);

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

export const ENVELOPE_STATUS = Object.freeze({
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

/** Same forbidden invented demand/revenue fields as Exchange FORBIDDEN_BRIEF_FIELDS. */
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

export const REQUIREMENTS_REF = Object.freeze({
  schema: REQUIREMENTS_SCHEMA,
  reuseFrom: "R2-EXCHANGE-01",
});
