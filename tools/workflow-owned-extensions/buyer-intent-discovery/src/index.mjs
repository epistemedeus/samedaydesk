export const API_VERSION = "2022-11-28";
export const API_DOCS = "https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests";
export const DEFAULT_QUERY = 'is:issue is:public "extract-batch" "compare" in:title,body';
export const PROBLEM_FIRST_QUERY = 'is:issue is:public "page" "snapshot" "json" "changed" in:title,body';
const issueUrl = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/;
const loginName = /^[A-Za-z0-9_.-]+$/;

const INJECTION = /\b(?:ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:the |all )?(?:previous|prior) (?:instructions|rules)|you are now (?:a |the )?system)\b|<\s*script\b/i;
const VISUAL = /\b(?:visual diff|screenshot|before\/after slider|pixel[- ]diff|every current screen|visual baseline)\b/i;
const BROWSER = /\b(?:browser rendering|javascript rendering|headless browser|render the page)\b/i;
const INVENTORY = /\b(?:kubernetes|\bk8s\b|kboms?|inventory diff|arbitrary json diff)\b/i;
const IMPL = /\b(?:implement(?: a|ation\b)|dashboard|add a feature|build a (?:ui|dashboard|feature|cli)|fix the bug|browser rendering)\b/i;
const WITHDRAWN = /\b(?:this request is withdrawn|request withdrawn|withdrawing this request)\b/i;
const EXPLICIT_PAID = /\b(?:this is a paid request|paid request|i will pay|we will pay|willing to pay|bounty of|bounty:)\b/i;
const OTHER_PAID = /\b(?:other|another) project(?:'s)? payment\b/i;
const PAID_NEGATED = /\b(?:not a paid request|unpaid request|will not pay|will not be paid)\b/i;

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

function readOwner(item) {
  const user = item && item.user;
  if (!user || typeof user !== "object") return null;
  const login = user.login;
  const url = user.html_url;
  if (typeof login !== "string" || !loginName.test(login)) return null;
  if (typeof url !== "string" || url !== `https://github.com/${login}`) return null;
  return { login, url };
}

function excerpts(source, patterns, limit = 3) {
  const out = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const found = new RegExp(pattern.source, flags).exec(source);
    if (!found || !found[0]) continue;
    const slice = found[0].replace(/\s+/g, " ").trim().slice(0, 160);
    if (slice && source.includes(slice) && !out.includes(slice)) out.push(slice);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeCandidate(item) {
  if (!item || !issueUrl.test(item.html_url) || typeof item.title !== "string") throw new Error("invalid public issue candidate");
  const sourceUrl = item.html_url;
  return {
    id: String(item.id),
    sourceUrl,
    title: text(item.title),
    taskDescription: text(item.body).trim() || text(item.title),
    state: typeof item.state === "string" && item.state ? item.state : "unknown",
    sourceCreatedAt: typeof item.created_at === "string" ? item.created_at : null,
    sourceUpdatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
    isPullRequest: Boolean(item.pull_request),
    owner: readOwner(item),
    fixtureOnly: /\/fixture-only\//.test(sourceUrl),
  };
}

function pageChangeSignals(source) {
  const pair = /\b(?:two|2|pair of)\b/i.test(source) && /\b(?:snapshots?|extracts?|captures?)\b/i.test(source);
  const page = /\bpages?\b/i.test(source) || /\bselected fields?\b/i.test(source);
  const change = /\b(?:compar(?:e|ing|ison)|what changed|which fields|fields changed|field changes?)\b/i.test(source);
  return pair && page && change;
}

function reuseSignals(source) {
  const produced = /\b(?:already[- ]produced|already[- ]have|I already have|we already have)\b/i.test(source);
  const reuse = /\b(?:reuse|re-use|carry forward)\b/i.test(source);
  const kind = /\b(?:page comparison result|page-change result|extract-batch result|record result|task-memory)\b/i.test(source);
  return produced && reuse && kind;
}

function paidFrom(source, malicious) {
  if (malicious) {
    return {
      sourceStated: "not_accepted_from_task_instructions",
      observedPayment: "not_observed",
      evidence: excerpts(source, [INJECTION]).slice(0, 1),
    };
  }
  const explicit = EXPLICIT_PAID.test(source);
  const other = OTHER_PAID.test(source);
  const negated = PAID_NEGATED.test(source);
  let sourceStated = "not_stated";
  if ((explicit && other) || (explicit && negated)) sourceStated = "unknown";
  else if (explicit) sourceStated = "explicit_open_paid_request";
  else if (other) sourceStated = "other_project_payment";
  const evidence = excerpts(source, [EXPLICIT_PAID, OTHER_PAID, PAID_NEGATED]);
  return { sourceStated, observedPayment: "not_observed", evidence };
}

function adaptationFor(capability, source) {
  if (capability === "sdd.page_change_offline") {
    const named = /\bextract-batch\b/i.test(source);
    return {
      required: !named,
      transformation: named
        ? "The request already names extract-batch snapshots. No format rename is claimed. Issue prose is still not the snapshot files."
        : "Saved page JSON must be transformed into two already-delivered extract-batch snapshots before the offline compare can run. This consumer does not fetch, render, or perform that transformation. Absent selected fields are coverage unknown, not deletion.",
      cost: "not_estimated",
    };
  }
  if (capability === "sdd.result_reuse_offline") {
    return {
      required: true,
      transformation: "The already-produced file must be a supported extract-batch, page-change, or record result. Caller task id, subject, sequence, clock, and explicit opt-in stay required. This consumer does not invent them or run the SDK.",
      cost: "not_estimated",
    };
  }
  return null;
}

function executionFor(capability) {
  if (capability === "sdd.page_change_offline") {
    return ["two actual extract-batch snapshots", "selected fields", "caller acceptance review"];
  }
  if (capability === "sdd.result_reuse_offline") {
    return ["recognized result JSON", "task_id", "subject", "sequence", "clock", "explicit opt_in for export"];
  }
  return ["a supported problem is not established"];
}

export function classify(candidate) {
  const source = `${candidate.title}\n${candidate.taskDescription}`;
  const malicious = INJECTION.test(source);
  const withdrawn = WITHDRAWN.test(source);
  const paidIntent = paidFrom(source, malicious);
  const extraUnsupported = IMPL.test(source);
  let status = "no_fit";
  let capability = null;
  let boundary = "No supported offline problem is established in the source text.";
  const evidence = [];

  if (malicious) {
    boundary = "Task text is untrusted data. Instruction text does not grant fit, contact, execution, or a private route.";
    evidence.push(...excerpts(source, [INJECTION]));
  } else if (candidate.isPullRequest) {
    boundary = "A pull request is not a work request for this service.";
  } else if (VISUAL.test(source)) {
    boundary = "Visual diff, screenshots, and screen baselines are not offline page-change comparison.";
    evidence.push(...excerpts(source, [VISUAL]));
  } else if (BROWSER.test(source)) {
    boundary = "Browser rendering is not a supported capability.";
    evidence.push(...excerpts(source, [BROWSER]));
  } else if (INVENTORY.test(source)) {
    boundary = "Arbitrary JSON or inventory diff is not page-change comparison of extract-batch snapshots.";
    evidence.push(...excerpts(source, [INVENTORY]));
  } else if (pageChangeSignals(source)) {
    status = "fit";
    capability = "sdd.page_change_offline";
    boundary = extraUnsupported
      ? "The page-snapshot field problem fits. An extra UI, dashboard, bug, or build ask is not part of that fit and is not performed."
      : "Offline page-change compare of two already-delivered extract-batch snapshots. Issue prose does not supply those snapshots.";
    evidence.push(...excerpts(source, [/\b(?:two|2|pair of)\b/i, /\b(?:snapshots?|extracts?)\b/i, /\bpages?\b|\bselected fields?\b/i, /\b(?:compar(?:e|ing|ison)|what changed|which fields|fields changed)\b/i]));
  } else if (reuseSignals(source)) {
    status = "fit";
    capability = "sdd.result_reuse_offline";
    boundary = "Opt-in export of an already-produced supported result. Issue prose is not the result file, identity, clock, or opt-in.";
    evidence.push(...excerpts(source, [/already[- ](?:produced|have)|I already have|we already have/i, /reuse|re-use|carry forward/i, /page comparison result|page-change result|extract-batch result|record result|task-memory/i]));
  } else if (/\b(?:compar(?:e|ing|ison)|what changed|which fields)\b/i.test(source) && /\b(?:json snapshots?|two json|two snapshots?|pair of snapshots?)\b/i.test(source)) {
    status = "needs_scope";
    boundary = "Comparison language is present, but the source does not establish a page-extract field compare or supported result reuse. Ambiguity is needs_scope, not a fit.";
    evidence.push(...excerpts(source, [/\b(?:compar(?:e|ing|ison)|what changed|which fields)\b/i, /\b(?:json snapshots?|two json|two snapshots?|pair of snapshots?)\b/i]));
  } else if (IMPL.test(source)) {
    boundary = "Implementation-only UI, dashboard, browser, or bug-fix work is outside the supported offline services.";
    evidence.push(...excerpts(source, [IMPL]));
  }

  const problemFit = {
    status, capability, evidence, boundary, adaptation: adaptationFor(capability, source),
  };
  const missing = status === "needs_scope"
    ? ["whether the records are page extracts", "selected fields", "the artifact files"]
    : executionFor(status === "fit" ? capability : null);
  const executionReadiness = {
    status: "not_ready",
    inputsSupplied: false,
    proseIsNotInput: true,
    missing,
    evidence: excerpts(source, [/not attached|no files|already[- ]held|already[- ]produced|I saved|I have/i]),
  };
  const open = candidate.state === "open" && !withdrawn && !candidate.isPullRequest;
  let contactStatus = "not_ready";
  let contactReason = "no_explicit_paid_request";
  const problemAllowsInquiry = status === "fit" || status === "needs_scope";
  const paid = paidIntent.sourceStated === "explicit_open_paid_request";
  if (malicious) contactReason = "malicious_task_text";
  else if (candidate.isPullRequest) contactReason = "pull_request";
  else if (withdrawn || candidate.state === "closed") {
    contactStatus = "closed_or_withdrawn";
    contactReason = withdrawn ? "withdrawn" : "not_open";
  } else if (candidate.state !== "open") contactReason = "state_unknown";
  else if (paid && problemAllowsInquiry && !candidate.owner) {
    contactStatus = "missing_owner";
    contactReason = "owner_not_in_source";
  } else if (paid && problemAllowsInquiry && candidate.owner) {
    contactStatus = "scope_inquiry";
    contactReason = "explicit_open_paid_request_and_owner_route";
  } else if (!problemAllowsInquiry) contactReason = "problem_outside_service";
  else contactReason = "no_explicit_paid_request";

  const contactReadiness = {
    status: contactStatus,
    justifiesScopeInquiry: contactStatus === "scope_inquiry",
    commission: false,
    buyingEvent: false,
    executionPermitted: false,
    ownerRoute: contactStatus === "scope_inquiry" ? candidate.owner.url : null,
    missing: contactStatus === "scope_inquiry"
      ? ["supplied inputs", "current scope confirmation", "final budget"]
      : contactStatus === "missing_owner" ? ["declared owner route"] : [],
    evidence: contactStatus === "scope_inquiry" || contactStatus === "missing_owner"
      ? excerpts(source, [EXPLICIT_PAID])
      : excerpts(source, [WITHDRAWN]),
    reason: contactReason,
  };
  const fitting = status === "fit" && open && !malicious;
  const reasons = [];
  if (malicious) reasons.push("malicious_task_text_not_executed");
  if (candidate.isPullRequest) reasons.push("pull_request_not_work_request");
  if (withdrawn) reasons.push("withdrawn_request");
  else if (candidate.state === "closed") reasons.push("not_open_current_request");
  else if (candidate.state !== "open") reasons.push("request_state_unknown");
  reasons.push(status === "fit" ? `problem_fit:${capability}` : `problem_${status}`);
  if (status === "fit" && (extraUnsupported || /\b(?:fix|bug|build)\b/i.test(source))) reasons.push("generic_or_extra_implementation_terms_do_not_veto");
  reasons.push("execution_not_ready_issue_prose_is_not_input");
  reasons.push(`contact_${contactStatus}`);
  reasons.push(`paid_source_${paidIntent.sourceStated}`);
  reasons.push("observed_payment_not_observed");
  const verdict = status === "fit" ? "problem_fit" : status === "needs_scope" ? "needs_scope" : "no_fit";
  return {
    ...candidate,
    maliciousTaskText: malicious,
    withdrawn,
    problemFit,
    contactReadiness,
    executionReadiness,
    paidIntent,
    fitting,
    verdict,
    capability: status === "fit" ? capability : null,
    reasons,
    buyerIntent: "source_text_only_not_purchase_contact_or_execution",
    handoff: status === "fit" ? {
      executionReady: false,
      required: missing,
      route: capability === "sdd.page_change_offline" ? "tools/offer-routing/README.md" : "tools/workflow-owned-extensions/cli.mjs",
      invocationSchema: "tools/workflow-owned-extensions/schema/tool-invocation.v1.json",
      adaptation: problemFit.adaptation,
      note: "Issue text is not SDK input. No task identity, evidence, opt-in, acceptance, owner, budget, or payment is invented. A scope inquiry is not a commission or permission to execute.",
    } : null,
  };
}

function queryRoleFor(query, explicit) {
  if (explicit) return explicit;
  if (query === PROBLEM_FIRST_QUERY) return "problem-first";
  if (query === DEFAULT_QUERY) return "vocabulary";
  return "explicit";
}

export function buildReport(response, { query = DEFAULT_QUERY, timestamp = new Date().toISOString(), mode = "recorded", perPage = 20, queryRole = null } = {}) {
  if (!response || !Array.isArray(response.items) || response.items.length > 100 || !Number.isInteger(response.total_count) || typeof response.incomplete_results !== "boolean") throw new Error("invalid search response");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("invalid timestamp");
  const requestUrl = searchUrl(query, perPage);
  const candidates = response.items.map(normalizeCandidate).map(classify);
  const fitting = candidates.filter(c => c.fitting).length;
  const needsScope = candidates.filter(c => c.problemFit.status === "needs_scope").length;
  const outcome = fitting ? "fitting_candidates" : needsScope ? "needs_scope" : "no_fit";
  const reason = fitting
    ? "At least one open issue describes a supported problem. Issue prose is not executable input. No contact, commission, or payment was made."
    : needsScope
      ? "At least one candidate is needs_scope. Ambiguity is not a fit, a commission, or absent demand."
      : "No open candidate describes a supported problem within the offline service boundaries. This page is not a demand census.";
  return {
    schema: "samedaydesk.buyer-intent-discovery.v2",
    outcomeId: "E07",
    readOnly: true,
    decisions: "problemFit, contactReadiness, executionReadiness, and paidIntent are separate. fitting counts only an open current problem fit.",
    acquisition: {
      mode, query, queryRole: queryRoleFor(query, queryRole), timestamp, timezone: "UTC", apiVersion: API_VERSION, docsUrl: API_DOCS, requestUrl,
      totalCount: response.total_count, incompleteResults: response.incomplete_results, page: 1, perPage,
      retainedSubset: response.retainedSubset === true, sourceCapturedAt: response.capturedAt ?? null,
      coverage: "single search page, issue title and body only; no comments, profile enrichment, or complete-discussion claim",
    },
    outcome,
    reason,
    counts: {
      acquired: candidates.length,
      fitting,
      nonFitting: candidates.length - fitting,
      problemTextFit: candidates.filter(c => c.problemFit.status === "fit").length,
      needsScope,
      scopeInquiry: candidates.filter(c => c.contactReadiness.justifiesScopeInquiry).length,
      executionReady: candidates.filter(c => c.executionReadiness.status === "ready").length,
      explicitPaid: candidates.filter(c => c.paidIntent.sourceStated === "explicit_open_paid_request").length,
    },
    fixtureNote: text(response.fixtureNote) || null,
    candidates,
    paidGateway: "paused_at_base_not_live_checked",
    contacted: false,
    posted: false,
    executed: false,
    commission: false,
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
  const safe = s => String(s ?? "").replace(/[\r\n]/g, " ").replace(/[<>&`\[\]\\]/g, "_");
  const lines = ["# E07 buyer-intent discovery", "", `Outcome: ${report.outcome}`, report.reason,
    `Acquisition: ${report.acquisition.mode}; ${report.acquisition.queryRole}; ${report.acquisition.timestamp} UTC; API ${API_VERSION}`,
    `Query: ${safe(report.acquisition.query)}`,
    `Open problem fits: ${report.counts.fitting}; needs_scope: ${report.counts.needsScope}; scope inquiries: ${report.counts.scopeInquiry}; execution ready: ${report.counts.executionReady}`,
    "Read-only. Problem fit, contact readiness, execution readiness, and paid intent are separate.",
    "No purchase, reply, contact, execution, commission, or observed payment is claimed.", ""];
  for (const c of report.candidates.slice(0, 20)) {
    lines.push(`## ${c.verdict}: ${safe(c.title)}`, c.sourceUrl,
      c.fixtureOnly ? "Label: fixture_only_not_observed_demand" : "Label: source_record",
      `State: ${c.state}; created: ${c.sourceCreatedAt ?? "unknown"}; updated: ${c.sourceUpdatedAt ?? "unknown"}`,
      `Owner route: ${c.owner ? c.owner.url : "missing"}`,
      `Problem: ${c.problemFit.status}; capability: ${c.problemFit.capability ?? "none"}; adaptation: ${c.problemFit.adaptation ? c.problemFit.adaptation.required : "n/a"}`,
      `Contact: ${c.contactReadiness.status}; scope inquiry: ${c.contactReadiness.justifiesScopeInquiry}; commission: false`,
      `Execution: ${c.executionReadiness.status}; inputs supplied: false`,
      `Paid source: ${c.paidIntent.sourceStated}; observed payment: ${c.paidIntent.observedPayment}`,
      `Task: ${safe(c.taskDescription).slice(0, 400).trimEnd()}`,
      `Boundary: ${safe(c.problemFit.boundary)}`, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}
