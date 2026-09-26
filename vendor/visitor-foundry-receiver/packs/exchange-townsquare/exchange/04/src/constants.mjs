/** R2-EXCHANGE-04 — Artifact submission admission constants. */

export const SCHEMA = "neomorphic.r2.exchange.artifact_admission.v1";
export const CONTRACT_SCHEMA = "neomorphic.r2.exchange.file_set_contract.v1";
export const SUBMISSION_SCHEMA = "neomorphic.r2.exchange.file_set_submission.v1";

export const ADMISSION_STATUS = Object.freeze({
  ADMITTED: "admitted",
  REJECTED: "rejected",
  PARTIAL: "partial",
});

export const ISSUE_KIND = Object.freeze({
  MISSING_FILE: "missing_file",
  UNSAFE_PATH: "unsafe_path",
  UNSUPPORTED_FORMAT: "unsupported_format",
  OVERSIZE_FILE: "oversize_file",
  OVERSIZE_TOTAL: "oversize_total",
  UNEXPECTED_FILE: "unexpected_file",
  MALFORMED: "malformed",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

export const DEFAULT_ALLOWED_FORMATS = Object.freeze([
  "json",
  "md",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "pdf",
]);

export const FORBIDDEN_FIELDS = Object.freeze([
  "revenue",
  "buyerCount",
  "reputation",
  "rankingScore",
  "earnedUsdc",
  "claimAuthority",
]);
