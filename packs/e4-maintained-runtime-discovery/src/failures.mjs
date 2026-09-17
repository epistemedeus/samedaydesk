/** Explicit failure classes. Empty 2xx is never success. */

export const FAILURES = Object.freeze({
  silent_empty_success: "HTTP 2xx or parseable document without an offer (empty body, {}, ok:true, or empty jobs)",
  empty_body: "Response or file body is empty",
  invalid_json: "Body is not JSON",
  invalid_document: "JSON is not a plain object",
  invalid_schema: "schema is not samedaydesk.for-agents.useful-jobs.v1",
  wrong_package: "package is not useful-jobs",
  missing_archive: "jobs named but archive sha256/bytes/url missing",
  empty_job_id: "jobs array has a blank or non-string id",
  catalog_invalid: "existing catalog document is unusable",
  catalog_job_mismatch: "catalog job ids do not match discovery jobs",
  llms_pointer_missing: "llms.txt does not point at the existing useful-jobs discovery URL",
  http_error: "Non-2xx HTTP status",
  transport_error: "Fetch/read failed before a body was obtained",
  unexpected_response_url: "Redirect or final URL is not the requested surface",
  body_too_large: "Body exceeded the read bound",
  paid_hosted_claim_not_this_offer: "Document claims paid hosted execution; useful-jobs is free offline",
  explicit_document_error: "Document already declared ok:false or error",
  committed_surfaces_unavailable: "Existing committed public files were not found",
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
