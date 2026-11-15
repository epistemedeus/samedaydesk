export const RESULT_SCHEMA = "samedaydesk.recurring-decision-consumer-result.v1";
export const INTENT_SCHEMA = "samedaydesk.recurring-decision-intent.v1";
export const CAPTURE_SCHEMA = "samedaydesk.recurring-decision-permitted-capture.v1";
export const PORTABLE_CAPTURE_SCHEMA = "samedaydesk.portable-decision-capture.v1";
export const RECURRING_RESULT_SCHEMA = "samedaydesk.customer-recurring-result.v1";
export const SCHEDULE_SCHEMA = "samedaydesk.recurring-schedule.v1";
export const INTENTS_SCHEMA = "samedaydesk.recurring-decision-intents.v1";
export const PRIORS_SCHEMA = "samedaydesk.recurring-decision-priors.v1";
export const REFERENCES_SCHEMA = "samedaydesk.recurring-decision-references.v1";
export const EFFORT_SCHEMA = "samedaydesk.recurring-whole-effort.v1";
export const RECEIPT_SCHEMA = "samedaydesk.recurring-result-receipt.v1";
/** AGL R06 portable decision (decision object, not a capture). Consume via agl-bridge. */
export const AGL_PORTABLE_DECISION_SCHEMA = "samedaydesk.portable-decision.v1";
export const STATE_SCHEMA = "samedaydesk.recurring-decision-state.v1";

export const OUTCOMES = Object.freeze({
  usefulChange: "useful_change",
  usefulNoChange: "useful_no_change",
  stale: "stale",
  unavailable: "unavailable",
  unsupported: "unsupported",
  unknown: "unknown",
});

export const REASONS = Object.freeze({
  fieldsDiffer: "fields_differ",
  fieldsMatch: "fields_match",
  fieldsAbsent: "fields_absent",
  digestsDiffer: "digests_differ",
  digestsMatch: "digests_match",
  priorStale: "prior_outside_horizon",
  captureStale: "capture_outside_horizon",
  captureMissing: "capture_missing",
  priorMissing: "prior_missing",
  notPermitted: "capture_not_permitted",
  subjectMismatch: "subject_mismatch",
  intentUnsupported: "intent_unsupported",
  captureUnsupported: "capture_schema_unsupported",
  invalidInput: "invalid_input",
  referenceFalseChange: "reference_false_change_control",
  referenceMissedChange: "reference_missed_change_control",
  aglModulesMissing: "agl_result_reuse_modules_missing",
  aglReuse: "agl_decide_or_reuse",
  aglPortableImport: "agl_portable_import",
  executionIdentityMismatch: "execution_identity_mismatch",
  executionIdentityIncomplete: "execution_identity_incomplete",
  executionStatusRejected: "execution_status_rejected",
  executionAmbiguous: "execution_wrapper_ambiguous",
  executionNodeMissing: "execution_node_missing",
  executionDataMissing: "execution_data_missing",
  executionItemsMissing: "execution_items_missing",
  executionCaptureTimeMissing: "execution_capture_time_missing",
  executionCaptureTimeInvalid: "execution_capture_time_invalid",
  scheduleCancelled: "schedule_cancelled",
  oneCaptureManyDecisions: "one_capture_many_decisions",
});

export const BUNDLE_OUTCOMES = Object.freeze({
  compared: "compared",
  cancelled: "cancelled",
});

export const RECURRING_CANNOT_ESTABLISH = Object.freeze([
  "This run-once consumer does not claim live recurrence.",
  "It does not establish that later callers accepted the same decision.",
  "Voluntary paid choice remains an outside experiment, not a fixture assertion.",
  "This result does not install a watcher, add an n8n charge, or request a new execution.",
]);

export const SUPPORTED_CAPTURE_SCHEMAS = Object.freeze([
  CAPTURE_SCHEMA,
  PORTABLE_CAPTURE_SCHEMA,
]);
