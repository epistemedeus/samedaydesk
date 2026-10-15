// Bounded same-origin page discovery for generators (llms.txt).
// Sources: caller-supplied paths, robots.txt Sitemap: lines, /sitemap.xml;
// sitemap indexes are followed exactly one level. Every fetch goes through the
// shared public-host guard in ./ssrf.js; nothing a user supplies can name
// another origin or a private address.
import { fetchPublicBounded, BoundedFetchError, PublicHostError, FETCH_FAILURE } from "./ssrf.js";

export const DISCOVERY_FAILURE = Object.freeze({
  CROSS_ORIGIN_SITEMAP: "cross_origin_sitemap",
  CROSS_ORIGIN_PATH: "cross_origin_path",
  OFF_ORIGIN_REDIRECT: FETCH_FAILURE.OFF_ORIGIN_REDIRECT,
  TOO_MANY_REDIRECTS: FETCH_FAILURE.TOO_MANY_REDIRECTS,
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
  maxSuppliedPaths: 50,
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

/**
 * discoverSiteUrls({ origin, suppliedPaths?, headers?, limits? })
 * => { urls, provenance: {url: source}, mode, sitemaps, missing, redirected, rejected, limited }
 */
export async function discoverSiteUrls({ origin, suppliedPaths = null, headers = {}, limits = {} }) {
  const L = { ...DISCOVERY_LIMITS, ...limits };
  const report = { mode: "auto", sitemaps: [], missing: [], redirected: [], rejected: [], limited: [] };
  const urls = [];
  const provenance = {};
  const seen = new Set();
  const addUrl = (u, source) => {
    if (urls.length >= L.maxUrls) { if (!report.limited.includes("max_urls")) report.limited.push("max_urls"); return; }
    const k = key(u);
    if (seen.has(k)) return;
    seen.add(k); urls.push(u); provenance[u] = source;
  };

  const get = async (url, maxBytes) => {
    try {
      const r = await fetchPublicBounded(url, { allowedOrigin: origin, maxRedirects: L.maxRedirects, maxBytes, timeoutMs: L.timeoutMs, headers });
      if (r.redirects.length) report.redirected.push({ from: url, to: r.finalUrl });
      return r;
    } catch (e) {
      const reason = e instanceof BoundedFetchError ? e.code
        : e instanceof PublicHostError ? DISCOVERY_FAILURE.NOT_PUBLIC : DISCOVERY_FAILURE.FETCH_FAILED;
      report.rejected.push({ url, reason, ...(e.location ? { location: e.location } : {}) });
      return null;
    }
  };

  // ---- supplied list: explicit paths, same origin only, existence checked ----
  if (Array.isArray(suppliedPaths) && suppliedPaths.length) {
    report.mode = "supplied";
    const list = suppliedPaths.slice(0, L.maxSuppliedPaths);
    if (suppliedPaths.length > list.length) report.limited.push("max_supplied_paths");
    for (const raw of list) {
      const abs = sameOriginUrl(String(raw).trim(), origin);
      if (!abs) { report.rejected.push({ url: String(raw), reason: DISCOVERY_FAILURE.CROSS_ORIGIN_PATH }); continue; }
      const r = await get(abs, 512_000);
      if (!r) continue;
      if (!r.ok) { report.missing.push({ url: abs, status: r.status }); continue; }
      addUrl(r.finalUrl, "supplied");
    }
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
