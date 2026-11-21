// Bounded page discovery for generators (llms.txt).
// AUTOMATIC discovery (robots.txt Sitemap: lines, /sitemap.xml, one index level)
// is strictly same-origin: nothing it finds can make it fetch another origin.
// EXPLICIT supplied references (?paths=) may be same-origin paths or absolute
// public http(s) URLs on other origins (llmstxt.org allows external links, e.g.
// GitHub). Each supplied reference is fetched on its own: shared pinned-address
// guard (./ssrf.js), anonymous headers, redirects scoped to that reference's own
// origin, shared total budget and size bounds. Private addresses, credentials in
// the URL and non-http(s) schemes are refused. Supplied references are never
// crawled further, so there is no automatic offsite traversal.
import { PublicHostError } from "./ssrf.js";
import { fetchPublicBounded, BoundedFetchError, FETCH_FAILURE } from "./bounded-fetch.js";

export const DISCOVERY_FAILURE = Object.freeze({
  CROSS_ORIGIN_SITEMAP: "cross_origin_sitemap",
  CROSS_ORIGIN_PATH: "cross_origin_path", // legacy; supplied external refs are now admitted
  NON_HTTP_SCHEME: "non_http_scheme",
  CREDENTIALS_IN_URL: "credentials_in_url",
  INVALID_REFERENCE: "invalid_reference",
  EXTERNAL_LIMIT: "external_limit",
  OFF_ORIGIN_REDIRECT: FETCH_FAILURE.OFF_ORIGIN_REDIRECT,
  TOO_MANY_REDIRECTS: FETCH_FAILURE.TOO_MANY_REDIRECTS,
  BUDGET_EXHAUSTED: FETCH_FAILURE.BUDGET_EXHAUSTED,
  OVERSIZE_XML: "oversize_xml",
  MALFORMED_INDEX: "malformed_index",
  MALFORMED_SITEMAP: "malformed_sitemap",
  CYCLIC_INDEX: "cyclic_index",
  INDEX_DEPTH: "index_depth_exceeded",
  INDEX_LIMIT: "index_child_limit",
  NOT_PUBLIC: "not_public",
  FETCH_FAILED: "fetch_failed",
});

export const DISCOVERY_LIMITS = Object.freeze({
  maxRootSitemaps: 4,     // robots Sitemap: lines + /sitemap.xml considered
  maxIndexChildren: 5,    // child sitemaps fetched across all indexes
  maxUrls: 1000,          // locs collected before stopping
  maxXmlBytes: 2_000_000, // per sitemap document
  maxRobotsBytes: 256_000,
  maxRedirects: 3,
  maxSuppliedPaths: 50,      // total supplied references per request (same-origin + external)
  maxExternalReferences: 10, // supplied-external references fetched per request; the rest are skipped with reason external_limit
  timeoutMs: 10_000,
});

const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
const key = (u) => String(u).replace(/\/+$/, "");
const decodeXml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function parseRobotsSitemaps(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

export function classifySitemap(xml) {
  const body = String(xml || "");
  const locs = [...body.matchAll(LOC_RE)].map((m) => decodeXml(m[1]));
  if (/<sitemapindex[\s>]/i.test(body)) {
    const wellFormed = /<\/sitemapindex>/i.test(body)
      && (body.match(/<sitemap[\s>]/gi) || []).length === (body.match(/<\/sitemap>/gi) || []).length
      && locs.length > 0;
    return { kind: wellFormed ? "index" : "malformed_index", locs };
  }
  if (/<urlset[\s>]/i.test(body)) return { kind: "urlset", locs };
  return { kind: "not_sitemap", locs };
}

function sameOriginUrl(raw, origin) {
  try {
    const u = new URL(raw, origin + "/");
    if (u.origin !== origin) return null;
    u.hash = "";
    return u.toString();
  } catch { return null; }
}

export const PROVENANCE = Object.freeze({
  SUPPLIED_SAME_ORIGIN: "supplied-same-origin",
  SUPPLIED_EXTERNAL: "supplied-external",
});

// Headers for an off-origin supplied reference: an ALLOWLIST of public request
// headers only. Anything else (cookies, auth, x-custom-secret, ...) is dropped.
export const PUBLIC_REQUEST_HEADERS = Object.freeze(["user-agent", "accept", "accept-language"]);
export function publicRequestHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) if (PUBLIC_REQUEST_HEADERS.includes(k.toLowerCase())) out[k] = v;
  return out;
}

/** Classify one supplied reference without network: {url, origin, external} or {reason}. */
export function classifySuppliedReference(raw, origin) {
  const text = String(raw || "").trim();
  if (!text) return { reason: DISCOVERY_FAILURE.INVALID_REFERENCE };
  let u;
  try { u = new URL(text, origin + "/"); } catch { return { reason: DISCOVERY_FAILURE.INVALID_REFERENCE }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { reason: DISCOVERY_FAILURE.NON_HTTP_SCHEME };
  if (u.username || u.password) return { reason: DISCOVERY_FAILURE.CREDENTIALS_IN_URL };
  u.hash = "";
  return { url: u.toString(), origin: u.origin, external: u.origin !== origin };
}

/**
 * discoverSiteUrls({ origin, suppliedPaths?, headers?, limits? })
 * => { urls, provenance: {url: source}, mode, sitemaps, missing, redirected, rejected, limited }
 * provenance values: "supplied-same-origin" | "supplied-external" | "sitemap:<url>" 
 */
export async function discoverSiteUrls({ origin, suppliedPaths = null, headers = {}, limits = {}, budget = null, lookup }) {
  const L = { ...DISCOVERY_LIMITS, ...limits };
  const report = { mode: "auto", sitemaps: [], missing: [], redirected: [], rejected: [], limited: [], skipped: [] };
  const budgetOut = (url) => {
    if (!report.limited.includes("budget_exhausted")) report.limited.push("budget_exhausted");
    report.skipped.push(url);
  };
  const urls = [];
  const provenance = {};
  const seen = new Set();
  const addUrl = (u, source) => {
    if (urls.length >= L.maxUrls) { if (!report.limited.includes("max_urls")) report.limited.push("max_urls"); return; }
    const k = key(u);
    if (seen.has(k)) return;
    seen.add(k); urls.push(u); provenance[u] = source;
  };

  const get = async (url, maxBytes, scope = { allowedOrigin: origin, headers }) => {
    if (budget?.exhausted) { budgetOut(url); return null; }
    try {
      const r = await fetchPublicBounded(url, { allowedOrigin: scope.allowedOrigin, maxRedirects: L.maxRedirects, maxBytes, timeoutMs: L.timeoutMs, headers: scope.headers, budget, ...(lookup ? { lookup } : {}) });
      if (r.redirects.length) report.redirected.push({ from: url, to: r.finalUrl });
      return r;
    } catch (e) {
      if (e?.code === FETCH_FAILURE.BUDGET_EXHAUSTED) { budgetOut(url); return null; }
      const reason = e instanceof BoundedFetchError ? e.code
        : e instanceof PublicHostError ? DISCOVERY_FAILURE.NOT_PUBLIC : DISCOVERY_FAILURE.FETCH_FAILED;
      report.rejected.push({ url, reason, ...(e.location ? { location: e.location } : {}) });
      return null;
    }
  };

  // ---- supplied list: explicit references, each existence-checked in its own origin scope ----
  if (Array.isArray(suppliedPaths) && suppliedPaths.length) {
    report.mode = "supplied";
    const list = suppliedPaths.slice(0, L.maxSuppliedPaths);
    if (suppliedPaths.length > list.length) report.limited.push("max_supplied_paths");
    // One declared outcome per supplied reference: nothing is silently omitted.
    report.references = [];
    let externalUsed = 0;
    for (const raw of list) {
      const ref = classifySuppliedReference(raw, origin);
      const entry = { input: String(raw), url: ref.url || null, provenance: ref.reason ? null : (ref.external ? PROVENANCE.SUPPLIED_EXTERNAL : PROVENANCE.SUPPLIED_SAME_ORIGIN) };
      report.references.push(entry);
      if (ref.reason) { Object.assign(entry, { status: "rejected", reason: ref.reason }); report.rejected.push({ url: String(raw), reason: ref.reason, supplied: true }); continue; }
      if (ref.external && externalUsed >= L.maxExternalReferences) {
        Object.assign(entry, { status: "skipped", reason: DISCOVERY_FAILURE.EXTERNAL_LIMIT, limit: L.maxExternalReferences });
        if (!report.limited.includes("max_external_references")) report.limited.push("max_external_references");
        continue;
      }
      if (ref.external) externalUsed += 1;
      const scope = ref.external
        ? { allowedOrigin: ref.origin, headers: publicRequestHeaders(headers) }
        : { allowedOrigin: origin, headers };
      const nRej = report.rejected.length, nSkip = report.skipped.length;
      const r = await get(ref.url, 512_000, scope);
      if (!r) {
        const rej = report.rejected.slice(nRej).find((x) => x.url === ref.url);
        Object.assign(entry, report.skipped.length > nSkip ? { status: "skipped", reason: "budget_exhausted" } : { status: "rejected", reason: rej?.reason || DISCOVERY_FAILURE.FETCH_FAILED });
        continue;
      }
      if (!r.ok) { Object.assign(entry, { status: "missing", httpStatus: r.status }); report.missing.push({ url: ref.url, status: r.status }); continue; }
      Object.assign(entry, { status: "admitted", finalUrl: r.finalUrl });
      addUrl(r.finalUrl, entry.provenance);
    }
    for (const raw of suppliedPaths.slice(list.length)) report.references.push({ input: String(raw), status: "skipped", reason: "max_supplied_paths" });
    return { urls, provenance, ...report };
  }

  // ---- robots.txt Sitemap: lines ----
  const roots = [];
  const robots = await get(origin + "/robots.txt", L.maxRobotsBytes);
  if (robots && robots.ok) {
    for (const raw of parseRobotsSitemaps(robots.body)) {
      const abs = sameOriginUrl(raw, origin);
      if (!abs) { report.rejected.push({ url: raw, reason: DISCOVERY_FAILURE.CROSS_ORIGIN_SITEMAP, via: "robots.txt" }); continue; }
      roots.push({ url: abs, source: "robots.txt" });
    }
  } else if (robots) {
    report.missing.push({ url: origin + "/robots.txt", status: robots.status });
  }
  if (!roots.some((r) => key(r.url) === key(origin + "/sitemap.xml"))) roots.push({ url: origin + "/sitemap.xml", source: "default" });

  const visited = new Set();
  let childBudget = L.maxIndexChildren;
  const readSitemap = async (url, source, depth) => {
    if (visited.has(key(url))) { report.rejected.push({ url, reason: DISCOVERY_FAILURE.CYCLIC_INDEX }); return; }
    visited.add(key(url));
    const r = await get(url, L.maxXmlBytes);
    if (!r) return;
    if (!r.ok) { report.missing.push({ url, status: r.status }); return; }
    if (r.oversize) { report.rejected.push({ url, reason: DISCOVERY_FAILURE.OVERSIZE_XML, limit: L.maxXmlBytes }); return; }
    visited.add(key(r.finalUrl));
    const c = classifySitemap(r.body);
    const entry = { url, source, kind: c.kind, locs: c.locs.length };
    report.sitemaps.push(entry);
    if (c.kind === "malformed_index") { report.rejected.push({ url, reason: DISCOVERY_FAILURE.MALFORMED_INDEX }); return; }
    if (c.kind === "not_sitemap") { report.rejected.push({ url, reason: DISCOVERY_FAILURE.MALFORMED_SITEMAP }); return; }
    if (c.kind === "urlset") {
      for (const loc of c.locs) {
        const abs = sameOriginUrl(loc, origin);
        if (abs) addUrl(abs, `sitemap:${url}`);
      }
      return;
    }
    // index
    if (depth >= 1) {
      const back = c.locs.map((l) => sameOriginUrl(l, origin)).find((a) => a && visited.has(key(a)));
      if (back) { report.rejected.push({ url, reason: DISCOVERY_FAILURE.CYCLIC_INDEX, location: back }); return; }
      report.rejected.push({ url, reason: DISCOVERY_FAILURE.INDEX_DEPTH }); return; }
    for (const loc of c.locs) {
      const abs = sameOriginUrl(loc, origin);
      if (!abs) { report.rejected.push({ url: loc, reason: DISCOVERY_FAILURE.CROSS_ORIGIN_SITEMAP, via: url }); continue; }
      if (visited.has(key(abs))) { report.rejected.push({ url: abs, reason: DISCOVERY_FAILURE.CYCLIC_INDEX, via: url }); continue; }
      if (childBudget <= 0) { if (!report.limited.includes("max_index_children")) report.limited.push("max_index_children"); break; }
      childBudget -= 1;
      await readSitemap(abs, `index:${url}`, depth + 1);
    }
  };
  for (const root of roots.slice(0, L.maxRootSitemaps)) await readSitemap(root.url, root.source, 0);
  if (roots.length > L.maxRootSitemaps) report.limited.push("max_root_sitemaps");
  return { urls, provenance, ...report };
}
