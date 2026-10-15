// Automatic-mode fit for GET /llms-txt.
// Hooks sit outside the route body so the same patch applies on the f390888b
// generator and on R2D, which already owns robots/sitemap discovery in
// server/lib/agent-readiness/sitemap-discovery.js. When that module is present
// this file does not fetch sitemaps again and does not replace a supplied list.
import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";

export const UPSTREAM = fs.existsSync(new URL("../../lib/agent-readiness/sitemap-discovery.js", import.meta.url));

const LIMITS = Object.freeze({ maxRootSitemaps: 4, maxIndexChildren: 5, maxUrls: 1000, maxRedirects: 3 });
const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi;

export const llmsAls = new AsyncLocalStorage();

const decodeXml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export function parseRobotsSitemaps(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

export function normUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    const s = u.toString();
    if (u.pathname !== "/" && s.endsWith("/")) return s.replace(/\/+$/, "");
    return s;
  } catch {
    return String(raw || "").replace(/\/+$/, "");
  }
}

function depthOf(url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (!path) return 0;
    return path.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}

function sameOrigin(raw, origin) {
  try {
    const u = new URL(raw, origin + "/");
    if (u.origin !== origin || (u.protocol !== "http:" && u.protocol !== "https:")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function originFrom(navLinks, urls) {
  for (const n of navLinks || []) {
    try { return new URL(n.url).origin; } catch { /* next */ }
  }
  for (const u of urls || []) {
    try { return new URL(u).origin; } catch { /* next */ }
  }
  return null;
}

function attr(tag, name) {
  const m = String(tag).match(new RegExp(name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return m ? m[1].trim() : null;
}

function parseLinkHeader(header) {
  const out = [];
  if (!header) return out;
  for (const part of String(header).split(/,(?=\s*<)/)) {
    const href = /<([^>]+)>/.exec(part);
    if (!href) continue;
    const rel = /(?:^|;)\s*rel\s*=\s*"?([^";]+)"?/i.exec(part);
    const type = /(?:^|;)\s*type\s*=\s*"?([^";]+)"?/i.exec(part);
    out.push({ href: href[1], rel: (rel?.[1] || "").toLowerCase(), type: (type?.[1] || "").toLowerCase() });
  }
  return out;
}

// llms.txt v2 (llmstxt.org, 2026-08-10): markdown alternate and describedby.
export function parseV2(html, linkHeader, base) {
  let markdown = null;
  let describedby = null;
  const take = (rel, type, href) => {
    if (!href || !base) return;
    let abs;
    try { abs = new URL(href, base); } catch { return; }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
    let baseOrigin;
    try { baseOrigin = new URL(base).origin; } catch { return; }
    if (abs.origin !== baseOrigin) return;
    const rels = String(rel || "").toLowerCase().split(/\s+/);
    if (rels.includes("alternate") && String(type || "").toLowerCase() === "text/markdown") markdown = abs.toString();
    if (rels.includes("describedby")) describedby = abs.toString();
  };
  for (const tag of String(html || "").match(/<link\b[^>]*>/gi) || []) take(attr(tag, "rel"), attr(tag, "type"), attr(tag, "href"));
  for (const link of parseLinkHeader(linkHeader)) take(link.rel, link.type, link.href);
  return { markdown, describedby };
}

function locsOf(xml) {
  return [...String(xml || "").matchAll(LOC_RE)].map((m) => decodeXml(m[1]));
}

function kindOf(xml) {
  const body = String(xml || "");
  if (/<sitemapindex[\s>]/i.test(body)) return "index";
  if (/<urlset[\s>]/i.test(body)) return "urlset";
  return "not_sitemap";
}

function dedupe(items, key) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const k = item?.[key] ?? JSON.stringify(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function pushLimited(ctx, name) {
  if (!ctx.limited.includes(name)) ctx.limited.push(name);
}

export function installLlmsHooks(req, res, next) {
  const path = req.path || "";
  if (path !== "/llms-txt" && !path.startsWith("/llms-txt/")) return false;
  const suppliedPaths = req.query.paths == null ? null
    : (Array.isArray(req.query.paths) ? req.query.paths : String(req.query.paths).split(",")).map((s) => String(s).trim()).filter(Boolean);
  let originGuess = null;
  try {
    const raw = String(req.query.url || "").trim();
    if (raw) originGuess = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw).origin;
  } catch { /* the route reports a bad url itself */ }
  const ctx = {
    suppliedPaths,
    originGuess,
    mode: suppliedPaths ? "supplied" : "auto",
    pages: new Map(),
    missing: [],
    redirected: [],
    rejected: [],
    sitemaps: [],
    alternates: [],
    limited: [],
    robots: null,
    suppressed: 0,
  };
  const orig = globalThis.fetch;
  const wrapped = (url, opts) => dispatchFetch(orig, url, opts);
  globalThis.fetch = wrapped;
  const restore = () => { if (globalThis.fetch === wrapped) globalThis.fetch = orig; };
  res.on("finish", restore);
  res.on("close", restore);
  const origJson = res.json.bind(res);
  res.json = (body) => origJson(decorateLlmsBody(body));
  llmsAls.run(ctx, () => next());
  return true;
}

async function readText(res) {
  return Buffer.from(await res.arrayBuffer()).toString("utf8");
}

function asResponse(status, body, contentType) {
  return new Response(body, { status, headers: { "content-type": contentType || "text/html; charset=utf-8" } });
}

async function passThrough(orig, url, opts, ctx) {
  const res = await orig(url, opts);
  try {
    const status = res.status;
    const location = res.headers.get("location");
    const link = res.headers.get("link");
    // A 3xx body must stay unread: R2D disposes redirect streams before following Location.
    if (status >= 300 && status < 400) {
      noteDocument(ctx, String(url), { status, finalUrl: res.url || String(url), location, body: "", link, redirected: true });
      return res;
    }
    const body = Buffer.from(await res.clone().arrayBuffer()).toString("utf8");
    noteDocument(ctx, String(url), { status, finalUrl: res.url || String(url), location, body, link, redirected: Boolean(res.redirected) });
  } catch { /* observation is best-effort; the caller still owns the body */ }
  return res;
}

function noteDocument(ctx, requestUrl, rec) {
  let pathname = "";
  try { pathname = new URL(requestUrl).pathname; } catch { return; }
  if (pathname === "/robots.txt") {
    const directives = rec.status === 200 ? parseRobotsSitemaps(rec.body).length : 0;
    ctx.robots = { present: rec.status === 200, sitemapDirectives: directives };
    return;
  }
  if (pathname.endsWith(".xml")) return;
  const v2 = parseV2(rec.body, rec.link, rec.finalUrl || requestUrl);
  ctx.pages.set(normUrl(requestUrl), {
    status: rec.status,
    location: rec.location || null,
    finalUrl: rec.finalUrl || requestUrl,
    redirected: Boolean(rec.redirected) || (rec.status >= 300 && rec.status < 400),
    markdown: v2.markdown,
    describedby: v2.describedby,
  });
}

async function followSameOrigin(orig, startUrl, opts) {
  let current = String(startUrl);
  const startOrigin = new URL(current).origin;
  const hops = [];
  for (let i = 0; i <= LIMITS.maxRedirects; i += 1) {
    const res = await orig(current, { ...opts, redirect: "manual" });
    const location = res.headers.get("location");
    const link = res.headers.get("link");
    const body = await readText(res);
    const contentType = res.headers.get("content-type") || "";
    if (res.status >= 300 && res.status < 400 && location && i < LIMITS.maxRedirects) {
      let next;
      try { next = new URL(location, current); } catch { break; }
      if (next.origin !== startOrigin) {
        return { status: res.status, finalUrl: current, location: next.toString(), body, contentType, link, offOrigin: true, hops };
      }
      hops.push(next.toString());
      current = next.toString();
      continue;
    }
    return { status: res.status, finalUrl: current, location, body, contentType, link, offOrigin: false, hops };
  }
  return { status: 0, finalUrl: current, location: null, body: "", contentType: "", link: null, offOrigin: false, hops };
}

async function loadXml(orig, url, opts, ctx, source) {
  const got = await followSameOrigin(orig, url, opts);
  if (got.hops.length) ctx.redirected.push({ from: String(url), to: got.finalUrl });
  if (got.offOrigin) {
    ctx.rejected.push({ url: String(url), reason: "off_origin_redirect", location: got.location });
    return null;
  }
  if (got.status < 200 || got.status >= 300) {
    ctx.missing.push({ url: got.finalUrl || String(url), status: got.status || 0 });
    return null;
  }
  const kind = kindOf(got.body);
  ctx.sitemaps.push({ url: got.finalUrl || String(url), source, kind, locs: locsOf(got.body).length });
  return { ...got, kind };
}

async function expandFromRobots(orig, origin, opts, ctx) {
  const robotsUrl = origin + "/robots.txt";
  const robots = await followSameOrigin(orig, robotsUrl, opts);
  const directives = robots.status === 200 ? parseRobotsSitemaps(robots.body) : [];
  ctx.robots = { present: robots.status === 200, sitemapDirectives: directives.length };
  if (robots.status !== 200) ctx.missing.push({ url: robotsUrl, status: robots.status || 0 });
  const roots = [];
  for (const raw of directives) {
    const abs = sameOrigin(raw, origin);
    if (!abs) { ctx.rejected.push({ url: raw, reason: "cross_origin_sitemap", via: "robots.txt" }); continue; }
    roots.push(abs);
  }
  return roots.slice(0, LIMITS.maxRootSitemaps);
}

async function collectPages(orig, origin, opts, ctx, roots) {
  const pages = [];
  const seen = new Set();
  let childBudget = LIMITS.maxIndexChildren;
  const addPage = (raw) => {
    const abs = sameOrigin(raw, origin);
    if (!abs) { ctx.rejected.push({ url: String(raw), reason: "cross_origin_sitemap" }); return; }
    if (pages.length >= LIMITS.maxUrls) { pushLimited(ctx, "max_urls"); return; }
    const key = normUrl(abs);
    if (seen.has(key)) return;
    seen.add(key);
    pages.push(abs);
  };
  const read = async (url, source, depth) => {
    const doc = await loadXml(orig, url, opts, ctx, source);
    if (!doc) return;
    if (doc.kind === "urlset") { for (const loc of locsOf(doc.body)) addPage(loc); return; }
    if (doc.kind !== "index") { ctx.rejected.push({ url: doc.finalUrl, reason: "malformed_sitemap" }); return; }
    if (depth >= 1) { ctx.rejected.push({ url: doc.finalUrl, reason: "index_depth_exceeded" }); return; }
    for (const loc of locsOf(doc.body)) {
      const abs = sameOrigin(loc, origin);
      if (!abs) { ctx.rejected.push({ url: loc, reason: "cross_origin_sitemap", via: url }); continue; }
      if (childBudget <= 0) { pushLimited(ctx, "max_index_children"); break; }
      childBudget -= 1;
      const child = await loadXml(orig, abs, opts, ctx, `index:${url}`);
      if (!child) continue;
      if (child.kind === "urlset") { for (const page of locsOf(child.body)) addPage(page); continue; }
      if (child.kind === "index") { ctx.rejected.push({ url: child.finalUrl, reason: "index_depth_exceeded" }); continue; }
      ctx.rejected.push({ url: child.finalUrl, reason: "malformed_sitemap" });
    }
  };
  for (const root of roots) await read(root, root.startsWith(origin + "/sitemap.xml") ? "default" : "robots.txt", 0);
  return pages;
}

function urlsetXml(urls) {
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.replace(/&/g, "&amp;")}</loc></url>`).join("")}</urlset>`;
}

async function sitemapExchange(orig, url, opts, ctx) {
  if (ctx.suppliedPaths) return orig(url, opts);
  const origin = new URL(String(url)).origin;
  const current = await followSameOrigin(orig, url, opts);
  if (current.status >= 200 && current.status < 300 && kindOf(current.body) === "urlset") {
    ctx.sitemaps.push({ url: current.finalUrl || String(url), source: "default", kind: "urlset", locs: locsOf(current.body).length });
    return asResponse(current.status, current.body, current.contentType || "application/xml");
  }
  if (current.status >= 200 && current.status < 300 && kindOf(current.body) === "index") {
    ctx.sitemaps.push({ url: current.finalUrl || String(url), source: "default", kind: "index", locs: locsOf(current.body).length });
    const pages = [];
    // Re-walk children without re-fetching the root: collectPages expects roots to fetch.
    const childRoots = locsOf(current.body).map((loc) => sameOrigin(loc, origin)).filter(Boolean);
    const flat = await flattenChildren(orig, origin, opts, ctx, childRoots);
    pages.push(...flat);
    return asResponse(200, urlsetXml(pages), "application/xml");
  }
  // /sitemap.xml is missing or not a sitemap. Remember that, then use robots Sitemap: lines.
  ctx.missing.push({ url: String(url), status: current.status || 0 });
  const roots = await expandFromRobots(orig, origin, opts, ctx);
  if (!roots.length) return asResponse(current.status || 404, current.body || "", current.contentType || "text/plain");
  const pages = await collectPages(orig, origin, opts, ctx, roots);
  return asResponse(200, urlsetXml(pages), "application/xml");
}

async function flattenChildren(orig, origin, opts, ctx, childRoots) {
  const pages = [];
  const seen = new Set();
  let childBudget = LIMITS.maxIndexChildren;
  const add = (raw) => {
    const abs = sameOrigin(raw, origin);
    if (!abs) { ctx.rejected.push({ url: String(raw), reason: "cross_origin_sitemap" }); return; }
    if (pages.length >= LIMITS.maxUrls) { pushLimited(ctx, "max_urls"); return; }
    const key = normUrl(abs);
    if (seen.has(key)) return;
    seen.add(key);
    pages.push(abs);
  };
  for (const abs of childRoots) {
    if (childBudget <= 0) { pushLimited(ctx, "max_index_children"); break; }
    childBudget -= 1;
    const child = await loadXml(orig, abs, opts, ctx, "index:/sitemap.xml");
    if (!child) continue;
    if (child.kind === "urlset") { for (const loc of locsOf(child.body)) add(loc); continue; }
    if (child.kind === "index") { ctx.rejected.push({ url: child.finalUrl, reason: "index_depth_exceeded" }); continue; }
    ctx.rejected.push({ url: child.finalUrl, reason: "malformed_sitemap" });
  }
  return pages;
}

async function pageExchange(orig, url, opts, ctx) {
  const got = await followSameOrigin(orig, url, opts);
  noteDocument(ctx, String(url), {
    status: got.status,
    finalUrl: got.finalUrl,
    location: got.location,
    body: got.body,
    link: got.link,
    redirected: got.hops.length > 0 || got.offOrigin,
  });
  const rec = ctx.pages.get(normUrl(String(url)));
  if (rec && got.hops.length) rec.finalUrl = got.finalUrl;
  if (got.offOrigin) ctx.rejected.push({ url: String(url), reason: "off_origin_redirect", location: got.location });
  return asResponse(got.status || 502, got.body, got.contentType);
}

async function dispatchFetch(orig, url, opts = {}) {
  const target = String(url);
  if (target.startsWith("http://127.0.0.1") || target.startsWith("http://localhost")) return orig(url, opts);
  const ctx = llmsAls.getStore();
  if (!ctx) return orig(url, opts);
  if (UPSTREAM) return passThrough(orig, url, opts, ctx);
  let pathname = "";
  try { pathname = new URL(target).pathname; } catch { return orig(url, opts); }
  if (pathname === "/" || pathname === "") return passThrough(orig, url, opts, ctx);
  if (pathname === "/sitemap.xml") return sitemapExchange(orig, target, opts, ctx);
  return pageExchange(orig, target, opts, ctx);
}

function classifySupplied(raw, origin) {
  try {
    const u = new URL(raw, origin + "/");
    if (u.protocol !== "http:" && u.protocol !== "https:") return { reason: "non_http_scheme" };
    if (u.username || u.password) return { reason: "credentials_in_url" };
    if (u.origin !== origin) return { reason: "cross_origin_path" };
    u.hash = "";
    return { url: u.toString() };
  } catch {
    return { reason: "invalid_reference" };
  }
}

// Nav stays in site order. Other URLs are stable-sorted by path depth so a
// capped file keeps entry pages. Krabka #132's /docs/quickstart is inside the
// first sitemap child (141 locs) but past slot 50 in document order.
export function orderDiscovered({ navLinks = [], urls = [], cap = 50 } = {}) {
  const ctx = llmsAls.getStore();
  const suppliedList = ctx?.suppliedPaths;
  const localSupplied = Boolean(suppliedList) && !UPSTREAM;
  let nav = navLinks;
  let list = urls;
  if (localSupplied) {
    const origin = originFrom(navLinks, urls) || ctx.originGuess;
    nav = [];
    list = [];
    ctx.mode = "supplied";
    if (!origin) {
      for (const raw of suppliedList) ctx.rejected.push({ url: String(raw), reason: "invalid_reference" });
    } else {
      for (const raw of suppliedList) {
        const got = classifySupplied(raw, origin);
        if (got.reason) ctx.rejected.push({ url: String(raw), reason: got.reason });
        else list.push(got.url);
      }
    }
  } else if (ctx && !suppliedList) ctx.mode = "auto";
  const seen = new Set();
  const all = [];
  let i = 0;
  const push = (url, label, navFlag) => {
    const key = String(url).replace(/\/+$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    all.push({ url, label, nav: navFlag, i: i++ });
  };
  for (const n of nav) push(n.url, n.label, true);
  for (const x of list) push(x, null, false);
  let ordered = all;
  if (!suppliedList) {
    const navItems = all.filter((x) => x.nav);
    const rest = all.filter((x) => !x.nav).sort((a, b) => depthOf(a.url) - depthOf(b.url) || a.i - b.i);
    ordered = [...navItems, ...rest];
  }
  const kept = ordered.slice(0, cap);
  return { items: kept, totalFound: ordered.length, truncated: ordered.length > kept.length, omitted: ordered.length - kept.length };
}

export function emissionUrl(pageUrl) {
  const ctx = llmsAls.getStore();
  if (!ctx) return pageUrl;
  const rec = ctx.pages.get(normUrl(pageUrl));
  if (!rec) return pageUrl;
  if (rec.status >= 400 || rec.status === 0) {
    ctx.missing.push({ url: pageUrl, status: rec.status || 0 });
    ctx.suppressed += 1;
    return null;
  }
  if (rec.status >= 300 && rec.status < 400) {
    let to = rec.finalUrl || pageUrl;
    if (rec.location) {
      try { to = new URL(rec.location, pageUrl).toString(); } catch { /* keep finalUrl */ }
    }
    try {
      if (new URL(to).origin !== new URL(pageUrl).origin) {
        ctx.rejected.push({ url: pageUrl, reason: "off_origin_redirect", location: to });
        ctx.suppressed += 1;
        return null;
      }
    } catch { /* emit nothing we cannot parse */ ctx.suppressed += 1; return null; }
    ctx.redirected.push({ from: pageUrl, to });
    return rec.markdown || to;
  }
  if (rec.redirected && rec.finalUrl && normUrl(rec.finalUrl) !== normUrl(pageUrl)) {
    ctx.redirected.push({ from: pageUrl, to: rec.finalUrl });
  }
  if (rec.markdown || rec.describedby) ctx.alternates.push({ page: pageUrl, markdown: rec.markdown || null, describedby: rec.describedby || null });
  if (rec.markdown) return rec.markdown;
  if (rec.redirected && rec.finalUrl) return rec.finalUrl;
  return pageUrl;
}

export function decorateLlmsBody(body) {
  const ctx = llmsAls.getStore();
  if (!ctx || !body || typeof body !== "object" || typeof body.llmsTxt !== "string") return body;
  const missing = dedupe([...(body.discovery?.missing || []), ...ctx.missing], "url");
  const redirected = dedupe([...(body.discovery?.redirected || []), ...ctx.redirected], "from");
  const rejected = dedupe([...(body.discovery?.rejected || []), ...ctx.rejected], "url");
  let count = body.count;
  if (ctx.suppressed) count = (body.llmsTxt.match(/^- \[/gm) || []).length;
  const discovery = body.discovery
    ? { ...body.discovery, missing, redirected, rejected }
    : {
      mode: ctx.mode || "auto",
      source: ctx.mode === "supplied" ? "supplied" : (ctx.sitemaps.length ? "sitemap" : "homepage-links"),
      sitemaps: ctx.sitemaps,
      missing,
      redirected,
      rejected,
      limited: ctx.limited,
    };
  if (ctx.robots && !discovery.robots) discovery.robots = ctx.robots;
  if (ctx.alternates.length) discovery.alternates = ctx.alternates;
  if (!body.discovery?.coverage) {
    const emitted = count;
    discovery.coverage = ctx.mode === "supplied"
      ? {
        mode: "requester-supplied",
        emitted,
        supplied: (ctx.suppliedPaths || []).length,
        label: `requester-supplied: ${emitted} of ${(ctx.suppliedPaths || []).length} supplied references emitted; same-origin paths only; qualifies the supplied list only, not automatic full coverage`,
      }
      : {
        mode: "automatic",
        emitted,
        discovered: body.totalFound,
        cap: 50,
        omitted: body.omitted,
        label: `automatic: ${emitted} of ${body.totalFound} discovered pages emitted (cap 50); ${body.omitted} omitted`,
      };
  }
  return { ...body, count, discovery };
}
