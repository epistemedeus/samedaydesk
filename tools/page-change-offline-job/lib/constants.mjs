/** Published SDS extract-batch and page-change brief contracts. Not a merchant kernel copy. */

export const REPORT_SCHEMA = "pilot/page-change-brief/v1";
export const EXTRACT_PRODUCT = "samedaydesk-extract-batch";
export const EXTRACT_SCHEMA = "samedaydesk.extract-batch.v0";
export const ENGINE_ID = "samedaydesk.page-change-offline-job";
export const ENGINE_VERSION = "0.1.1";
export const TERMS_SCHEMA = "samedaydesk.page-change-offline-job.terms.v0";
export const TERMS_SCHEMA_VERSION = 1;
export const TERMS_VERSION_PREFIX = "sha256:";

export const SUPPORTED_FIELDS = Object.freeze([
  "title",
  "description",
  "canonical",
  "lang",
  "openGraph",
  "twitter",
  "jsonLd",
  "headings",
  "links",
  "text",
  "aiReadiness",
]);

export const EXTRACT_TOP_FIELDS = Object.freeze([
  "ok",
  "product",
  "schemaVersion",
  "quote",
  "jobId",
  "jobStatus",
  "stopReason",
  "partial",
  "sources",
  "accounting",
  "costInputs",
  "charged",
  "boundary",
]);

export const SOURCE_REQUIRED_KEYS = Object.freeze([
  "id",
  "source",
  "status",
  "data",
  "notes",
  "error",
  "provenance",
]);

export const ROW_STATUSES = Object.freeze([
  "pending",
  "success",
  "partial",
  "failure",
  "unknown",
  "skipped_duplicate",
]);

export const COMPARABLE_STATUSES = Object.freeze(["success", "partial"]);

export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 131_072,
  maxJsonDepth: 16,
  maxJsonNodes: 4_096,
  maxChanges: 64,
  maxExcerptBytes: 200,
  maxStaleMs: null,
  maxSources: 32,
  maxFields: 11,
});

export const CLOCK_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const ERROR_CODES = Object.freeze({
  LIVE_FETCH_URL: "live_fetch_url",
  PAYMENT_RETRY: "payment_retry",
  QUOTE_AS_SUCCESS: "quote_as_success",
  SAMPLE_AS_DELIVERED_WATCH: "sample_as_delivered_watch",
  CLOCK_REQUIRED: "clock_required",
  INTEGER_TERMS_VERSION: "integer_terms_version",
  FIELDS_REQUIRED: "fields_required",
  UNSUPPORTED_FIELD: "unsupported_field",
  INPUT_BOUNDS: "input_bounds",
  UNRECOGNIZED_BATCH: "unrecognized_batch_artifact",
  USAGE: "usage",
});
