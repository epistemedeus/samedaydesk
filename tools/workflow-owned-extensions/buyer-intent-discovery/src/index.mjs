export const API_VERSION = "2022-11-28";
export const API_DOCS = "https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests";
export const DEFAULT_QUERY = 'is:issue is:public "extract-batch" "compare" in:title,body';
const issueUrl = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/;

export function searchUrl(query, perPage = 20) {
  if (typeof query !== "string" || !query.trim() || query.length > 512) throw new Error("invalid query");
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new Error("perPage must be 1..100");
  // Scope cannot be broadened by a caller to closed feeds or private repositories.
  if (!query.split(/\s+/).includes("is:public") || !query.split(/\s+/).includes("is:issue") || /(?:^|\s)(?:is:private|is:pr|is:pull-request|OR)(?:\s|$)/.test(query)) {
    throw new Error("query must restrict to public issues without OR or pull requests");
  }
  const url = new URL("https://api.github.com/search/issues");
  url.search = new URLSearchParams({ q: query, per_page: String(perPage), page: "1" }).toString();
  return url.href;
}

function text(value) {
  return typeof value === "string" ? value.replace(/\u2014/g, "-").slice(0, 16000) : "";
}

export function normalizeCandidate(item) {
  if (!item || !issueUrl.test(item.html_url) || typeof item.title !== "string") throw new Error("invalid public issue candidate");
  return {
    id: String(item.id), sourceUrl: item.html_url, title: text(item.title),
    taskDescription: text(item.body).trim() || text(item.title), state: item.state ?? "unknown",
    sourceUpdatedAt: item.updated_at ?? null, isPullRequest: Boolean(item.pull_request),
  };
}

export function classify(candidate) {
  const t = `${candidate.title}\n${candidate.taskDescription}`;
  const reasons = [];
  if (candidate.isPullRequest) reasons.push("pull_request_not_work_request");
  if (candidate.state !== "open") reasons.push("not_open_current_request");
  if (/\b(?:implement|add a|feature|build a|bug|fix|CLI flag|UI|dashboard|visual|screenshot|browser rendering|complete (?:issue|discussion)|all comments)\b/i.test(t)) reasons.push("requires_implementation_or_unsupported_acquisition");
  let capability = null;
  if (/\b(?:two|2)\b/i.test(t) && /\bextract-batch\b/i.test(t) && /\b(?:already[- ]held|already[- ]delivered|supplied)\b/i.test(t) && /\b(?:compare|comparison|diff)\b/i.test(t) && /\bpage[- ]change\b/i.test(t)) capability = "sdd.page_change_offline";
  if (/\b(?:already[- ]produced|already[- ]held)\b/i.test(t) && /\b(?:page-change|extract-batch|record)\b/i.test(t) && /\b(?:export|reuse)\b/i.test(t) && /\btask-memory\b/i.test(t)) capability = "sdd.result_reuse_offline";
  if (!capability) reasons.push("no_explicit_supported_supplied_evidence_task");
  const fitting = reasons.length === 0;
  return {
    ...candidate, fitting, verdict: fitting ? "fit" : "no_fit", capability: fitting ? capability : null,
    reasons: fitting ? ["explicit_supplied_evidence_task_matches_offline_capability"] : reasons,
    buyerIntent: "unverified_public_work_request_not_purchase_or_contact_consent",
    handoff: fitting ? {
      executionReady: false,
      required: capability === "sdd.page_change_offline" ? ["two actual extract-batch snapshots", "selected fields", "caller acceptance review"] : ["recognized result JSON", "task_id", "subject", "sequence", "clock", "explicit opt_in for export"],
      route: capability === "sdd.page_change_offline" ? "tools/offer-routing/README.md" : "tools/workflow-owned-extensions/cli.mjs",
      invocationSchema: "tools/workflow-owned-extensions/schema/tool-invocation.v1.json",
      note: "Issue text is not SDK input. No task identity, evidence, opt-in, or acceptance is invented.",
    } : null,
  };
}

export function buildReport(response, { query = DEFAULT_QUERY, timestamp = new Date().toISOString(), mode = "recorded", perPage = 20 } = {}) {
  if (!response || !Array.isArray(response.items) || response.items.length > 100 || !Number.isInteger(response.total_count) || typeof response.incomplete_results !== "boolean") throw new Error("invalid search response");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("invalid timestamp");
  const requestUrl = searchUrl(query, perPage);
  const candidates = response.items.map(normalizeCandidate).map(classify);
  const fitting = candidates.filter(c => c.fitting).length;
  return {
    schema: "samedaydesk.buyer-intent-discovery.v1", outcomeId: "E07", readOnly: true,
    acquisition: { mode, query, timestamp, timezone: "UTC", apiVersion: API_VERSION, docsUrl: API_DOCS, requestUrl,
      totalCount: response.total_count, incompleteResults: response.incomplete_results, page: 1, perPage,
      retainedSubset: response.retainedSubset === true, sourceCapturedAt: response.capturedAt ?? null,
      coverage: "single search page, issue title and body only; no comments or complete-discussion claim" },
    outcome: fitting ? "fitting_candidates" : "no_fit",
    reason: fitting ? "Capability matches need manual evidence and acceptance review." : "No acquired candidate explicitly qualifies within the supported offline service boundaries.",
    counts: { acquired: candidates.length, fitting, nonFitting: candidates.length - fitting },
    fixtureNote: text(response.fixtureNote) || null, candidates, paidGateway: "paused_at_base_not_live_checked", contacted: false, posted: false,
    directFallback: { queryFile: "tools/workflow-owned-extensions/buyer-intent-discovery/queries.json", requestUrl, method: "GET" },
  };
}

export async function acquire({ query = DEFAULT_QUERY, perPage = 20, token, fetchImpl = fetch } = {}) {
  const url = searchUrl(query, perPage);
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": API_VERSION, "User-Agent": "samedaydesk-e07-read-only" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch { throw new Error("acquisition transport failed; use saved query manually"); }
  if (!response.ok) throw new Error(`acquisition HTTP ${response.status}; no automatic retry; respect Retry-After and rate-limit reset`);
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error("response exceeds 2 MiB");
  try { return JSON.parse(raw); } catch { throw new Error("API returned invalid JSON"); }
}

export function digest(report) {
  const safe = s => String(s).replace(/[\r\n]/g, " ").replace(/[<>&`\[\]\\]/g, "_");
  return ["# E07 buyer-intent discovery", "", `Outcome: ${report.outcome}`, report.reason,
    `Acquisition: ${report.acquisition.mode}; ${report.acquisition.timestamp} UTC; API ${API_VERSION}`,
    `Query: ${safe(report.acquisition.query)}`, `Fit: ${report.counts.fitting}; no-fit: ${report.counts.nonFitting}`,
    "Read-only. No purchase, reply, contact, execution, or accepted delivery is claimed.", "",
    ...report.candidates.slice(0, 20).flatMap(c => [`## ${c.verdict}: ${safe(c.title)}`, c.sourceUrl,
      `Task: ${safe(c.taskDescription).slice(0, 400).trimEnd()}`, `Reasons: ${c.reasons.join(", ")}`, ""]),
  ].join("\n").trimEnd() + "\n";
}
