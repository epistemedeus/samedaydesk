export const ACQUISITION_SCHEMA = "samedaydesk.managed-order-acquisition.v1";
export const FROZEN_REQUEST_HASH_VERSION = "samedaydesk.acquisition-frozen-request.v1";
export const HTTP_FROZEN_REQUEST_HASH_VERSION = "samedaydesk.http-frozen-request.v1";
export const MATERIALIZED_INPUT_SCHEMA = "samedaydesk.acquisition-materialized-input.v1";
export const PUBLICATION_IDENTITY_SCHEMA = "samedaydesk.acquisition-publication-identity.v1";
export const MANAGED_ORDER_TERMS_SCHEMA = "samedaydesk.useful-jobs-order-terms.v1";
export const REQUEST_HASH_ALGORITHM = "sha256";
export const EXECUTION_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";

export const MAX_FILE_BYTES = 1_048_576;
export const MAX_TOTAL_BYTES = 2_097_152;
export const MAX_OUTPUT_FILES = 2;
export const MAX_METADATA_BYTES = 64 * 1024;
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
export const DEFAULT_MAX_ADMISSIONS = 1024;
export const DEFAULT_MAX_CONCURRENT_READS = 4;
export const DEFAULT_OPEN_TIMEOUT_MS = 30_000;

export const HA1_JOB_IDS = Object.freeze(["lockfile-pin-delta", "vendor-budget-impact"]);

export const PROMISED_OUTPUTS = Object.freeze({
  "lockfile-pin-delta": Object.freeze(["pin-delta.json", "pin-delta.md"]),
  "vendor-budget-impact": Object.freeze(["budget-impact.json", "budget-impact.md"]),
});

export const EXECUTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const PRINCIPAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;
export const SHA256_RE = /^[a-f0-9]{64}$/;
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
export const ARTIFACT_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
