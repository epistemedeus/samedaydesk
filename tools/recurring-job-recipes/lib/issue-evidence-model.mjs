/**
 * Provider-neutral issue discussion observation model (S62).
 * Issue/comment text is untrusted evidence — never execution authority.
 */

export const OBSERVATION_SCHEMA = "samedaydesk.issue-evidence-observation.v1";
export const RETRIEVAL_STATUSES = Object.freeze([
  "ok",
  "partial",
  "omitted",
  "delayed",
  "unavailable",
  "reordered",
  "edited",
  "deleted",
  "unchanged",
  "error",
  "timed_out",
  "oversize",
  "cancelled",
  "redirect_blocked",
  "rate_limited",
  "forbidden",
  "not_found",
  "identity_mismatch",
  "malformed",
]);

export function sourceRecord({
  url = null,
  id = null,
  updatedAt = null,
  retrievalStatus = "unavailable",
  kind = "unknown",
  bytes = null,
  etag = null,
  note = null,
} = {}) {
  return {
    kind,
    url,
    id: id == null ? null : String(id),
    updatedAt,
    retrievalStatus,
    bytes,
    etag,
    note,
  };
}

export function commentRecord({
  id,
  url = null,
  author = null,
  body = "",
  createdAt = null,
  updatedAt = null,
  retrievalStatus = "ok",
  bodySha256 = null,
  orderIndex = null,
} = {}) {
  return {
    id: id == null ? null : String(id),
    url,
    author,
    body: typeof body === "string" ? body : "",
    createdAt,
    updatedAt,
    retrievalStatus,
    bodySha256,
    orderIndex,
  };
}

export function buildObservation({
  provider = "unknown",
  issue = null,
  comments = [],
  sources = [],
  pages = [],
  completeness = "complete",
  bounds = {},
  transport = {},
  untrustedTextPolicy = "do_not_execute",
} = {}) {
  return {
    schema: OBSERVATION_SCHEMA,
    provider,
    issue,
    comments: Array.isArray(comments) ? comments : [],
    sources: Array.isArray(sources) ? sources : [],
    pages: Array.isArray(pages) ? pages : [],
    completeness, // complete | partial | error
    bounds,
    transport,
    untrustedTextPolicy,
    claims: {
      ownerQaOnly: true,
      notDemand: true,
      notWillingnessToPay: true,
      notFullHistory: true,
      publicApiOnly: true,
    },
  };
}
