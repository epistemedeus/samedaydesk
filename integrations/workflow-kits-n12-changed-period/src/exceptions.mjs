/**
 * Useful exception output. Every exception the kit returns has the same shape:
 *   { code, source, message, recordKey, fieldPath, fields, retryable, sameIdempotencyKey, suggestedAction }
 * source is "journey" for codes produced by the Useful Commerce journey (passed
 * through unchanged from period.exception), "mapping" for schema_changed found by
 * the declared mapping before the journey runs, "ledger" for terms_changed found
 * against an earlier apply receipt (checked with the journey's assertTermsUnchanged),
 * and "kit" for codes this kit adds.
 * retryable for journey codes is period.retry.retryable from the journey, never
 * recomputed here. Kit codes are never retryable.
 */
export const KIT_CODES = Object.freeze([
  "mapping_invalid",
  "mapping_version_unknown",
  "request_invalid",
  "record_already_applied",
  "record_key_duplicate",
  "apply_without_evaluation",
]);

const SUGGESTED = Object.freeze({
  schema_changed: "The record does not match the declared mapping for this period. Add a new mappingVersion that declares the changed fields (the kit never guesses a rename), set period.mappingVersion to it, and rerun the period. Accepted records are not applied twice.",
  terms_changed: "Old accepted terms stay attached to their records. Changed terms apply only to a new period or follow-up task with the exchange-supplied termsVersion; do not rerun an accepted period under new terms or send a locally hashed termsVersion.",
  capture_stale: "Nothing was applied for this record. Rerun the period with a fresh capture inside the horizon.",
  ingestion_missing: "Nothing was applied for this record. Rerun the period once the capture is available.",
  ingestion_incomplete: "Nothing was applied for this record. Rerun the period with a capture that has captureId, subject, capturedAt and a payload.",
  uncommitted: "The first request was not committed, so nothing was fabricated. Replay with the same idempotency key.",
  ingestion_not_permitted: "The record is not permitted for capture. Do not retry; obtain permission or drop the record.",
  token_used_as_task_ref: "A token-shaped value was sent as a task reference. Send the Work Exchange task id; tokens never authorize.",
  follow_up_not_new_task: "A later period must use a new follow-up task id in the same contextId.",
  context_mismatch: "A later period must stay in the same contextId as the accepted earlier period.",
  continuation_file_missing: "The Agent Entry continuation file is missing. Not retryable; restore the continuation file and start a new attempt.",
  prior_not_accepted: "The earlier period was not accepted for this record, so there is nothing to replay. Run it as a new record.",
  terms_invalid: "The caller terms input is malformed. Correct termsInput; the termsVersion must come from the exchange preview or readAccepted result.",
  mapping_invalid: "Correct the mapping registry at fieldPath. No record was evaluated.",
  mapping_version_unknown: "period.mappingVersion names no declared mapping. Declare it in the registry or choose an existing version.",
  request_invalid: "Correct the request at fieldPath and send it again.",
  record_already_applied: "This record was already applied in this period under a different idempotency key. It was not applied again. Start a new period or follow-up task for new work.",
  record_key_duplicate: "Two records in one request share a recordKey. Make record keys unique within a period.",
  apply_without_evaluation: "Apply only records that the evaluate step returned as ready.",
});

const OWED_SUGGESTION = "The owed reference was refused and nothing was applied. Present a corrected synthetic reference bound to this journey's correlationId.";

export function suggestedActionFor(code) {
  if (typeof code === "string" && (code.startsWith("owed_reference_") || code === "integrity_mismatch")) return OWED_SUGGESTION;
  return SUGGESTED[code] ?? "Review the record and its delivery. A rejected record is not applied; decide whether to correct and rerun it.";
}

export function kitException(code, { message, recordKey = null, fieldPath = null, fields = [], source = null } = {}) {
  return {
    code,
    source: source ?? (KIT_CODES.includes(code) ? "kit" : "journey"),
    message,
    recordKey,
    fieldPath,
    fields,
    retryable: false,
    sameIdempotencyKey: null,
    suggestedAction: suggestedActionFor(code),
  };
}

/** Wrap a journey period.exception with record context. retryable comes from the journey. */
export function journeyException(period, { recordKey, fieldPath = null, fields = [] } = {}) {
  return {
    code: period.exception.code,
    source: "journey",
    message: period.exception.message,
    recordKey,
    fieldPath,
    fields,
    retryable: period.retry.retryable === true,
    sameIdempotencyKey: period.retry.retryable === true ? period.retry.sameIdempotencyKey : null,
    suggestedAction: suggestedActionFor(period.exception.code),
  };
}
