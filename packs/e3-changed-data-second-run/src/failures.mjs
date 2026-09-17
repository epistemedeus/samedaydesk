/** Explicit failure classes. Same fixture twice is never repeat demand. */

export const FAILURES = Object.freeze({
  same_fixture_labelled_repeat_demand:
    "The same held fixture was run twice and labelled repeat demand. That is replay, not demand.",
  same_fixture_not_changed_input:
    "Both runs use the same held before/after bytes. A second run requires changed input.",
  owner_qa_labelled_repeat_demand:
    "Owner QA (or an owner identity) cannot be labelled repeat demand.",
  unproven_repeat_demand:
    "This pack does not certify organic or independent repeat demand.",
  owner_identity_labelled_independent:
    "An owner/operator identity cannot be labelled independent.",
  missing_evidence_class: "Each run must declare evidenceClass owner_qa or independent.",
  unknown_evidence_class: "evidenceClass is not owner_qa, independent, recruited, or unknown.",
  needs_two_runs: "A second-run pair must contain exactly two runs.",
  invalid_pair: "Pair document is missing or not samedaydesk.e3-changed-data-second-run.v1.",
  invalid_job_document: "Held job document is unusable.",
  job_not_page_change: "This caller only invokes page-change-offline-job.",
  caller_job_failed: "The useful-jobs page-change CLI exited nonzero or did not write outputs.",
  missing_promised_outputs: "Catalog-promised page-change.json / page-change.md were not written.",
  kit_unavailable: "Committed useful-jobs 1.4.7 archive was not found or did not verify.",
  usage: "CLI usage error",
});

export function fail(failureClass, message, extra = {}) {
  if (!FAILURES[failureClass]) {
    return {
      ok: false,
      failure: {
        class: "unexpected_failure_class",
        message: String(message || failureClass),
        ...extra,
      },
    };
  }
  return {
    ok: false,
    failure: {
      class: failureClass,
      message: String(message || FAILURES[failureClass]),
      ...extra,
    },
  };
}

export function isFailure(result) {
  return Boolean(result && result.ok === false && result.failure && result.failure.class);
}
