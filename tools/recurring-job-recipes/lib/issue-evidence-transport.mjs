/**
 * Classify HTTP/transport outcomes for issue-evidence fetches.
 * Never sleeps on Retry-After. Never auto-retries.
 */

export function classifyHttpStatus(status, headers = {}) {
  const retryAfter = readRetryAfter(headers);
  if (status === 304) return { retrievalStatus: "unavailable", retryAfter, retryable: false, code: "not_modified_without_snapshot" };
  if (status === 200) {
    return { retrievalStatus: "ok", retryAfter, retryable: false };
  }
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    return { retrievalStatus: "redirect_blocked", retryAfter, retryable: false, code: "redirect_blocked" };
  }
  if (status === 403) {
    return { retrievalStatus: "forbidden", retryAfter, retryable: false, code: "forbidden" };
  }
  if (status === 404) {
    return { retrievalStatus: "not_found", retryAfter, retryable: false, code: "not_found" };
  }
  if (status === 429) {
    return { retrievalStatus: "rate_limited", retryAfter, retryable: false, code: "rate_limited", honorRetryAfterWithoutWait: true };
  }
  if (status >= 500 && status <= 599) {
    return { retrievalStatus: "unavailable", retryAfter, retryable: false, code: "upstream_5xx" };
  }
  if (status === 408) {
    return { retrievalStatus: "timed_out", retryAfter, retryable: false, code: "timed_out" };
  }
  return { retrievalStatus: "error", retryAfter, retryable: false, code: "http_error", status };
}

export function readRetryAfter(headers) {
  if (!headers) return null;
  const get = typeof headers.get === "function" ? headers.get.bind(headers) : (k) => headers[k] ?? headers[String(k).toLowerCase()];
  const raw = get("retry-after") ?? get("Retry-After");
  if (raw == null || raw === "") return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return { seconds: asNumber, raw: String(raw) };
  return { httpDate: String(raw), raw: String(raw) };
}

export function parseLinkNext(linkHeader) {
  if (!linkHeader || typeof linkHeader !== "string") return null;
  for (const part of linkHeader.split(",")) {
    const m = part.trim().match(/^<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}
