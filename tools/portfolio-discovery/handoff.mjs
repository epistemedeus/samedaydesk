import {
  collectResponses,
  evaluatePortfolio,
  headerValue,
  result,
} from "./lib.mjs";
import { inspectRedirectAuthority } from "./search-readiness.mjs";

export const HANDOFF_CLAIMS = {
  claim_protection: "not_observed",
  legal_eligibility: "not_observed",
  ranking: "not_observed",
  human_consent: "not_observed",
  payment: "not_observed",
  demand: "not_observed",
};

export const HANDOFF_CHECK_IDS = [
  "handoff_origin",
  "handoff_human_review",
  "handoff_method",
  "handoff_availability",
  "handoff_machine_guide",
  "handoff_required_inputs",
  "handoff_query_secrets",
];

export const FINDING_CODES = [
  "foreign_url",
  "secret_in_query",
  "broken_exact_link",
  "unsupported_method",
  "missing_required_input",
];

const SUPPORTED_REVIEW_METHOD = "GET";
const AVAILABILITY = new Set(["observed", "proposed", "not_advertised"]);

const SECRET_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "api-key",
  "secret",
  "client_secret",
  "password",
  "passwd",
  "authorization",
  "auth",
  "bearer",
  "session",
  "sessionid",
  "session_id",
  "grant",
  "ownertoken",
  "owner_token",
]);

function recount(checks) {
  const counts = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
  for (const check of checks) {
    if (Object.prototype.hasOwnProperty.call(counts, check.status)) counts[check.status] += 1;
  }
  return counts;
}

function responseAt(responses, url) {
  return responses.get(url) || null;
}

function exactOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function isDeclaredHandoff(spec) {
  return Boolean(spec) && typeof spec === "object" && !Array.isArray(spec);
}

export function siteHandoff(site) {
  return isDeclaredHandoff(site?.handoff) ? site.handoff : null;
}

export function fillUrlPlaceholders(urlLike) {
  return String(urlLike || "")
    .replace(/\{[^}]+\}/g, "placeholder")
    .replace(/\/:([A-Za-z][A-Za-z0-9_]*)/g, "/placeholder");
}

function hasUnfilledPlaceholder(urlLike) {
  return /\{[^}]+\}/.test(String(urlLike || "")) || /\/:[A-Za-z][A-Za-z0-9_]*/.test(String(urlLike || ""));
}

export function resolveDeclaredUrl(urlLike, origin) {
  if (urlLike == null || urlLike === "") return { ok: false, detail: "url_absent" };
  const raw = String(urlLike).trim();
  if (!raw) return { ok: false, detail: "url_absent" };
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  try {
    const url = new URL(fillUrlPlaceholders(raw), base);
    if (url.protocol !== "https:") {
      return { ok: false, href: url.href, detail: "insecure_url", url };
    }
    const siteOrigin = exactOrigin(origin);
    if (!siteOrigin) return { ok: false, href: url.href, detail: "origin_unparseable", url };
    if (url.origin !== siteOrigin) {
      return {
        ok: false,
        href: url.href,
        detail: `foreign_url:${url.origin}`,
        finding: "foreign_url",
        url,
      };
    }
    return { ok: true, href: url.href, url, original: raw };
  } catch {
    return { ok: false, detail: "url_unparseable" };
  }
}

export function secretQueryHits(urlLike, origin) {
  const hits = [];
  if (urlLike == null || urlLike === "") return hits;
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  let url;
  try {
    url = new URL(fillUrlPlaceholders(urlLike), base);
  } catch {
    return hits;
  }
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    const normalized = lower.replace(/-/g, "_");
    if (SECRET_QUERY_KEYS.has(lower) || SECRET_QUERY_KEYS.has(normalized)) {
      hits.push(key);
      continue;
    }
    if (typeof value === "string" && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) {
      hits.push(key);
    }
  }
  return hits;
}

function availabilityOf(spec) {
  if (!spec || spec.availability == null || spec.availability === "") return "not_advertised";
  return String(spec.availability);
}

function undeclaredChecks() {
  return HANDOFF_CHECK_IDS.map((id) =>
    result(id, id, "not_applicable", { detail: "handoff_not_advertised" }),
  );
}

function findingRow(check) {
  if (!check?.finding) return null;
  if (!FINDING_CODES.includes(check.finding)) return null;
  const row = {
    code: check.finding,
    checkId: check.id,
    detail: check.detail,
  };
  if (check.url) row.url = check.url;
  if (check.finalUrl) row.finalUrl = check.finalUrl;
  if (check.input) row.input = check.input;
  return row;
}

export function normalizeHandoffOverlay(overlay) {
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    throw new Error("handoff overlay must be an object");
  }
  if (!Array.isArray(overlay.sites)) {
    throw new Error("handoff overlay must contain a sites array");
  }
  const map = new Map();
  for (const row of overlay.sites) {
    if (!row || typeof row !== "object" || !row.id) {
      throw new Error("handoff overlay sites must include id");
    }
    map.set(String(row.id), row.handoff ?? null);
  }
  return map;
}

export function mergeHandoffOverlay(catalog, overlay) {
  if (!catalog || !Array.isArray(catalog.sites)) {
    throw new Error("catalog must contain a sites array");
  }
  const copy = structuredClone(catalog);
  const decls = normalizeHandoffOverlay(overlay);
  const ids = new Set(copy.sites.map((site) => site.id));
  for (const id of decls.keys()) {
    if (!ids.has(id)) throw new Error(`handoff overlay site not in catalog: ${id}`);
  }
  for (const site of copy.sites) {
    if (!decls.has(site.id)) continue;
    const spec = decls.get(site.id);
    if (isDeclaredHandoff(spec)) site.handoff = spec;
    else delete site.handoff;
  }
  return copy;
}

export function handoffProbeUrls(site) {
  const spec = siteHandoff(site);
  if (!spec) return [];
  const urls = [];
  const add = (urlLike) => {
    if (!urlLike || hasUnfilledPlaceholder(urlLike)) return;
    const resolved = resolveDeclaredUrl(urlLike, site.origin);
    if (!resolved.ok || !resolved.href) return;
    urls.push(resolved.href);
  };
  add(spec.machineGuide);
  if (spec.example && spec.example.url) add(spec.example.url);
  return [...new Set(urls)];
}

async function ensureFetched(responses, fetchImpl, urls) {
  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url) || responses.has(url)) continue;
    seen.add(url);
    responses.set(url, await fetchImpl(url));
  }
}

function fetchedSurface(site, url, rec) {
  if (!rec || (rec.error && !rec.status) || rec.status === 0) {
    return {
      status: "missing",
      httpStatus: rec?.status || 0,
      detail: `unreachable:${rec?.error || "no_response"}`,
      finding: "broken_exact_link",
    };
  }
  const authority = inspectRedirectAuthority(site, url, rec);
  if (!authority.ok) {
    const foreign = String(authority.detail || "").startsWith("redirect_foreign_origin");
    return {
      status: "invalid",
      httpStatus: rec.status || 0,
      finalUrl: authority.finalUrl,
      detail: authority.detail,
      finding: foreign ? "foreign_url" : "broken_exact_link",
    };
  }
  if (rec.status === 404 || rec.status === 410) {
    return {
      status: "missing",
      httpStatus: rec.status,
      detail: "broken_exact_link",
      finding: "broken_exact_link",
    };
  }
  if (rec.status < 200 || rec.status >= 300) {
    return {
      status: "invalid",
      httpStatus: rec.status,
      detail: `unexpected_status:${rec.status}`,
      finding: "broken_exact_link",
    };
  }
  return { status: "ok", httpStatus: rec.status, detail: "ok" };
}

function applyAvailability(row, availability) {
  if (availability !== "proposed") return row;
  if (
    row.finding === "foreign_url" ||
    row.finding === "secret_in_query" ||
    row.finding === "unsupported_method" ||
    row.finding === "missing_required_input"
  ) {
    return row;
  }
  if (row.status === "missing" || row.finding === "broken_exact_link") {
    const next = {
      ...row,
      status: "not_applicable",
      detail: `proposed_unobserved:${row.detail}`,
    };
    delete next.finding;
    return next;
  }
  return row;
}

function exampleInputNames(example) {
  if (!example || typeof example !== "object") return [];
  const inputs = example.inputs;
  if (Array.isArray(inputs)) return inputs.map((name) => String(name));
  if (inputs && typeof inputs === "object") return Object.keys(inputs);
  return [];
}

function inspectMachineGuideBody(rec) {
  const body = rec?.body || "";
  const contentType = headerValue(rec?.headers, "content-type").toLowerCase();
  const looksJson = contentType.includes("json") || /^\s*[{[]/.test(body);
  if (!looksJson) return { detail: "machine_guide_ok" };
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: "invalid", detail: "machine_guide_unparseable" };
  }
  if (parsed && typeof parsed === "object" && (parsed.openapi || parsed.swagger)) {
    return { detail: `openapi:${parsed.openapi || parsed.swagger}` };
  }
  return { detail: "machine_guide_json" };
}

function evaluateOrigin(site, spec) {
  const siteOrigin = exactOrigin(site.origin);
  if (!siteOrigin) {
    return result("handoff_origin", "handoff_origin", "invalid", { detail: "origin_unparseable" });
  }
  if (spec.origin == null || spec.origin === "") {
    return result("handoff_origin", "handoff_origin", "ok", {
      origin: siteOrigin,
      detail: "origin_from_catalog",
    });
  }
  const declared = exactOrigin(spec.origin) || String(spec.origin).replace(/\/$/, "");
  if (declared !== siteOrigin) {
    return result("handoff_origin", "handoff_origin", "invalid", {
      origin: siteOrigin,
      declaredOrigin: declared,
      detail: `origin_mismatch:${declared}`,
      finding: "foreign_url",
    });
  }
  return result("handoff_origin", "handoff_origin", "ok", {
    origin: siteOrigin,
    detail: "exact_origin",
  });
}

function evaluateMethod(spec) {
  if (spec.method == null || spec.method === "") {
    return result("handoff_method", "handoff_method", "not_applicable", {
      detail: "method_not_advertised",
    });
  }
  const method = String(spec.method).trim().toUpperCase();
  if (method !== SUPPORTED_REVIEW_METHOD) {
    return result("handoff_method", "handoff_method", "invalid", {
      method,
      detail: `unsupported_method:${method}`,
      finding: "unsupported_method",
    });
  }
  return result("handoff_method", "handoff_method", "ok", {
    method,
    detail: "method_get",
  });
}

function evaluateAvailability(spec, surfaces) {
  const availability = availabilityOf(spec);
  if (!AVAILABILITY.has(availability)) {
    return result("handoff_availability", "handoff_availability", "invalid", {
      availability,
      detail: `availability_unrecognized:${availability}`,
    });
  }
  if (availability === "not_advertised") {
    return result("handoff_availability", "handoff_availability", "not_applicable", {
      availability,
      detail: "handoff_not_advertised",
    });
  }
  if (availability === "proposed") {
    return result("handoff_availability", "handoff_availability", "ok", {
      availability,
      detail: "availability_proposed",
    });
  }
  const broken = surfaces.find((row) => row && row.finding === "broken_exact_link");
  if (broken) {
    return result("handoff_availability", "handoff_availability", broken.status, {
      availability,
      url: broken.url,
      httpStatus: broken.httpStatus,
      detail: "availability_observed_unconfirmed",
    });
  }
  return result("handoff_availability", "handoff_availability", "ok", {
    availability,
    detail: "availability_observed",
  });
}

function evaluateHumanReview(site, spec, responses, availability) {
  if (spec.humanReviewUrlTemplate == null || spec.humanReviewUrlTemplate === "") {
    return result("handoff_human_review", "handoff_human_review", "not_applicable", {
      detail: "human_review_not_advertised",
    });
  }
  const resolved = resolveDeclaredUrl(spec.humanReviewUrlTemplate, site.origin);
  if (!resolved.ok) {
    const row = result("handoff_human_review", "handoff_human_review", "invalid", {
      url: spec.humanReviewUrlTemplate,
      detail: resolved.detail,
      finding: resolved.finding || undefined,
    });
    return applyAvailability(row, availability);
  }
  const exampleUrl = spec.example?.url;
  if (!exampleUrl) {
    if (availability === "observed") {
      return result("handoff_human_review", "handoff_human_review", "missing", {
        url: spec.humanReviewUrlTemplate,
        detail: "example_not_published",
      });
    }
    return result("handoff_human_review", "handoff_human_review", "ok", {
      url: spec.humanReviewUrlTemplate,
      detail: "template_not_fetched",
    });
  }
  const exampleResolved = resolveDeclaredUrl(exampleUrl, site.origin);
  if (!exampleResolved.ok) {
    const row = result("handoff_human_review", "handoff_human_review", "invalid", {
      url: exampleUrl,
      detail: exampleResolved.detail,
      finding: exampleResolved.finding || undefined,
    });
    return applyAvailability(row, availability);
  }
  const rec = responseAt(responses, exampleResolved.href);
  const fetched = fetchedSurface(site, exampleResolved.href, rec);
  const row = result("handoff_human_review", "handoff_human_review", fetched.status, {
    url: exampleResolved.href,
    httpStatus: fetched.httpStatus,
    detail: fetched.status === "ok" ? "human_review_get_ok" : fetched.detail,
    finding: fetched.finding,
    finalUrl: fetched.finalUrl,
  });
  return applyAvailability(row, availability);
}

function evaluateMachineGuide(site, spec, responses, availability) {
  if (spec.machineGuide == null || spec.machineGuide === "") {
    return result("handoff_machine_guide", "handoff_machine_guide", "not_applicable", {
      detail: "machine_guide_not_advertised",
    });
  }
  const resolved = resolveDeclaredUrl(spec.machineGuide, site.origin);
  if (!resolved.ok) {
    const row = result("handoff_machine_guide", "handoff_machine_guide", "invalid", {
      url: spec.machineGuide,
      detail: resolved.detail,
      finding: resolved.finding || undefined,
    });
    return applyAvailability(row, availability);
  }
  if (hasUnfilledPlaceholder(spec.machineGuide)) {
    return result("handoff_machine_guide", "handoff_machine_guide", "invalid", {
      url: spec.machineGuide,
      detail: "machine_guide_unresolved",
    });
  }
  const rec = responseAt(responses, resolved.href);
  const fetched = fetchedSurface(site, resolved.href, rec);
  if (fetched.status !== "ok") {
    const row = result("handoff_machine_guide", "handoff_machine_guide", fetched.status, {
      url: resolved.href,
      httpStatus: fetched.httpStatus,
      detail: fetched.detail,
      finding: fetched.finding,
      finalUrl: fetched.finalUrl,
    });
    return applyAvailability(row, availability);
  }
  const body = inspectMachineGuideBody(rec);
  if (body.status === "invalid") {
    return result("handoff_machine_guide", "handoff_machine_guide", "invalid", {
      url: resolved.href,
      httpStatus: fetched.httpStatus,
      detail: body.detail,
    });
  }
  return result("handoff_machine_guide", "handoff_machine_guide", "ok", {
    url: resolved.href,
    httpStatus: fetched.httpStatus,
    detail: body.detail,
  });
}

function evaluateRequiredInputs(spec, availability) {
  if (!Array.isArray(spec.requiredInputs) || spec.requiredInputs.length === 0) {
    return result("handoff_required_inputs", "handoff_required_inputs", "not_applicable", {
      detail: "required_inputs_not_advertised",
    });
  }
  const required = spec.requiredInputs.map((name) => String(name));
  if (!spec.example) {
    if (availability === "observed") {
      return result("handoff_required_inputs", "handoff_required_inputs", "missing", {
        requiredInputs: required,
        detail: "example_not_published",
      });
    }
    return result("handoff_required_inputs", "handoff_required_inputs", "not_applicable", {
      requiredInputs: required,
      detail: "example_not_published",
    });
  }
  const published = new Set(exampleInputNames(spec.example));
  const missing = required.find((name) => !published.has(name));
  if (missing) {
    return result("handoff_required_inputs", "handoff_required_inputs", "invalid", {
      requiredInputs: required,
      detail: `missing_required_input:${missing}`,
      input: missing,
      finding: "missing_required_input",
    });
  }
  return result("handoff_required_inputs", "handoff_required_inputs", "ok", {
    requiredInputs: required,
    detail: "required_inputs_present",
  });
}

function evaluateQuerySecrets(site, spec) {
  const targets = [];
  if (spec.humanReviewUrlTemplate) {
    targets.push(["humanReviewUrlTemplate", spec.humanReviewUrlTemplate]);
  }
  if (spec.machineGuide) targets.push(["machineGuide", spec.machineGuide]);
  if (spec.example?.url) targets.push(["example.url", spec.example.url]);
  if (targets.length === 0) {
    return result("handoff_query_secrets", "handoff_query_secrets", "not_applicable", {
      detail: "no_handoff_urls",
    });
  }
  for (const [field, urlLike] of targets) {
    const hits = secretQueryHits(urlLike, site.origin);
    if (hits.length) {
      return result("handoff_query_secrets", "handoff_query_secrets", "invalid", {
        url: urlLike,
        field,
        detail: `secret_in_query:${hits[0]}`,
        finding: "secret_in_query",
      });
    }
  }
  return result("handoff_query_secrets", "handoff_query_secrets", "ok", {
    detail: "no_query_secrets",
  });
}

export function evaluateHandoffSite(site, responses) {
  const spec = siteHandoff(site);
  if (!spec) {
    return { checks: undeclaredChecks(), findings: [] };
  }

  const availability = availabilityOf(spec);
  const origin = evaluateOrigin(site, spec);
  const method = evaluateMethod(spec);
  const secrets = evaluateQuerySecrets(site, spec);
  const humanReview = evaluateHumanReview(site, spec, responses, availability);
  const machineGuide = evaluateMachineGuide(site, spec, responses, availability);
  const requiredInputs = evaluateRequiredInputs(spec, availability);
  const availabilityCheck = evaluateAvailability(spec, [humanReview, machineGuide]);

  const checks = [origin, humanReview, method, availabilityCheck, machineGuide, requiredInputs, secrets];
  const findings = [];
  for (const check of checks) {
    const row = findingRow(check);
    if (row) findings.push({ ...row, siteId: site.id });
  }
  return { checks, findings };
}

export async function runAgentHandoff(catalog, fetchImpl) {
  const responses = await collectResponses(catalog, fetchImpl);
  for (const site of catalog.sites) {
    await ensureFetched(responses, fetchImpl, handoffProbeUrls(site));
  }
  const discovery = evaluatePortfolio(catalog, responses);
  const sites = [];
  const findings = [];
  for (const [index, site] of catalog.sites.entries()) {
    const extra = evaluateHandoffSite(site, responses);
    const checks = [...discovery.sites[index].checks, ...extra.checks];
    findings.push(...extra.findings);
    sites.push({
      id: site.id,
      origin: site.origin,
      role: site.role,
      label: site.label,
      advertised: Boolean(siteHandoff(site)),
      checks,
      counts: recount(checks),
      findings: extra.findings,
    });
  }
  const totals = { ok: 0, missing: 0, invalid: 0, not_applicable: 0 };
  for (const site of sites) {
    for (const key of Object.keys(totals)) totals[key] += site.counts[key];
  }
  return {
    ok: totals.missing === 0 && totals.invalid === 0,
    mode: "agent-handoff",
    handoffClaims: { ...HANDOFF_CLAIMS },
    probeCount: responses.size,
    totals,
    findings,
    sites,
  };
}
