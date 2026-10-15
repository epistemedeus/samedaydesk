import { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";

// Free "AI Readiness Checker" — a zero-marginal-cost lead magnet. Given a URL it fetches
// the page + robots.txt and checks whether AI search engines (ChatGPT/Claude/Perplexity/
// Gemini) can crawl + understand the site, then returns a score + concrete fixes. The deep
// version (real citation testing vs competitors) is the paid AI-Search Visibility Audit.
// runCheck() is exported so the server-rendered /scan proof page can reuse it.
import { assertPublicUrl } from "../lib/agent-readiness/ssrf.js";
import { fetchPublicBounded, createRequestBudget } from "../lib/agent-readiness/bounded-fetch.js";

// One total budget per /llms-txt request: DNS (4s bound each) + redirects + bodies.
export const LLMS_TOTAL_BUDGET_MS = 25_000;
const isHtml = (ct) => !ct || /text\/html|application\/xhtml\+xml/i.test(ct);
import { discoverSiteUrls, anonymousHeaders, PROVENANCE } from "../lib/agent-readiness/sitemap-discovery.js";

const router = Router();

// Public, read-only tool APIs: allow cross-origin calls (our github.io study page,
// third-party embeds). No credentials; they only read public sites.
router.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const AI_CRAWLERS = [
  { ua: "GPTBot", who: "ChatGPT (OpenAI index/training)" },
  { ua: "OAI-SearchBot", who: "ChatGPT Search" },
  { ua: "ClaudeBot", who: "Claude" },
  { ua: "PerplexityBot", who: "Perplexity" },
  { ua: "Google-Extended", who: "Google Gemini & AI Overviews" },
  { ua: "CCBot", who: "Common Crawl (feeds many LLMs)" },
  { ua: "Bingbot", who: "Bing (powers ChatGPT Search results)" },
];

const UA = "SameDayDeskBot/1.0 (+https://samedaydesk.com/tools/ai-readiness; free AI-readiness checker)";
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 2_500_000;

// ---- SSRF guard: only public http(s) hosts (no localhost / private / link-local IPs) ----
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local incl. cloud metadata 169.254.169.254
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  return true; // unknown format → treat as unsafe
}

function normalizeUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) throw httpErr(400, "Enter a website URL");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw httpErr(400, "That doesn't look like a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw httpErr(400, "Only http(s) URLs are supported");
  if (!u.hostname.includes(".")) throw httpErr(400, "Enter a full domain, e.g. example.com");
  return u;
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw httpErr(400, "That address isn't reachable for a public check");
    return;
  }
  let addrs;
  try { addrs = await dns.lookup(hostname, { all: true }); } catch { throw httpErr(400, "Could not resolve that domain"); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw httpErr(400, "That host isn't a public website");
}

function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

async function fetchText(url, { acceptHtml = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: acceptHtml ? "text/html,*/*" : "text/plain,*/*" },
    });
    const buf = Buffer.from((await res.arrayBuffer()).slice(0, MAX_BYTES));
    return { ok: res.ok, status: res.status, finalUrl: res.url, body: buf.toString("utf8"), headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

// ---- robots.txt: does any group block "/" for a given crawler (or "*") ----
function robotsBlocks(robotsTxt, uaName) {
  if (!robotsTxt) return false; // no robots.txt → everything allowed by default
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  const groups = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === "user-agent") {
      if (cur && cur.rules.length) { groups.push(cur); cur = null; }
      if (!cur) cur = { agents: [], rules: [] };
      cur.agents.push(val.toLowerCase());
    } else if (cur) {
      cur.rules.push({ type: field, path: val });
    }
  }
  if (cur) groups.push(cur);
  const want = uaName.toLowerCase();
  const match = groups.find((g) => g.agents.includes(want)) || groups.find((g) => g.agents.includes("*"));
  if (!match) return false;
  const disallowAll = match.rules.some((r) => r.type === "disallow" && (r.path === "/" || r.path === "/*"));
  const allowAll = match.rules.some((r) => r.type === "allow" && (r.path === "/" || r.path === ""));
  return disallowAll && !allowAll;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', "i"));
  return m ? m[1].trim() : null;
}

function analyzeHtml(html) {
  const out = { title: null, description: null, canonical: null, lang: null, h1: null, og: 0, jsonldTypes: [], words: 0 };
  if (!html) return out;
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) out.title = titleM[1].replace(/\s+/g, " ").trim();
  const langM = html.match(/<html[^>]*\slang\s*=\s*["']([^"']+)["']/i);
  if (langM) out.lang = langM[1];
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1M) out.h1 = h1M[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
  for (const tag of html.match(/<meta[^>]+>/gi) || []) {
    const name = (attr(tag, "name") || "").toLowerCase();
    const prop = (attr(tag, "property") || "").toLowerCase();
    if (name === "description") out.description = attr(tag, "content");
    if (prop.startsWith("og:")) out.og++;
  }
  for (const tag of html.match(/<link[^>]+>/gi) || []) {
    if ((attr(tag, "rel") || "").toLowerCase() === "canonical") out.canonical = attr(tag, "href");
  }
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []) {
    const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const data = JSON.parse(json);
      const arr = Array.isArray(data) ? data : data["@graph"] && Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      for (const node of arr) { if (node && node["@type"]) out.jsonldTypes.push([].concat(node["@type"]).join("/")); }
    } catch { out.jsonldTypes.push("(unparseable)"); }
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  out.words = (text.match(/\b[\p{L}\p{N}]{2,}\b/gu) || []).length;
  return out;
}

// Core check, shared by the JSON API and the server-rendered /scan proof page.
// Throws an Error with .status (400/502) on bad input / unreachable site.
export async function runCheck(rawUrl) {
  const u = normalizeUrl(rawUrl);
  await assertPublicHost(u.hostname);

  let page;
  try {
    page = await fetchText(u.toString(), { acceptHtml: true });
  } catch (e) {
    throw httpErr(502, e.name === "AbortError" ? "The site took too long to respond" : "Could not reach that site");
  }
  let robots = null, hasSitemap = false, hasLlms = false;
  const origin = (() => { try { return new URL(page.finalUrl || u.toString()).origin; } catch { return u.origin; } })();
  await Promise.all([
    fetchText(origin + "/robots.txt").then((r) => { if (r.ok) robots = r.body; }).catch(() => {}),
    fetchText(origin + "/sitemap.xml").then((r) => { hasSitemap = r.ok && /<urlset|<sitemapindex/i.test(r.body); }).catch(() => {}),
    fetchText(origin + "/llms.txt").then((r) => { hasLlms = r.ok && r.body.trim().length > 0; }).catch(() => {}),
  ]);
  if (!hasSitemap && robots && /^\s*sitemap\s*:/im.test(robots)) hasSitemap = true;

  const h = analyzeHtml(page.body);
  const blocked = AI_CRAWLERS.filter((c) => robotsBlocks(robots, c.ua));
  const checks = [];
  const add = (id, label, status, detail, fix) => checks.push({ id, label, status, detail, fix });

  if (blocked.length === 0) {
    add("crawlers", "AI crawler access", "pass", robots ? "No AI crawler is blocked in robots.txt." : "No robots.txt found, so AI crawlers are allowed by default.", null);
  } else if (blocked.length >= AI_CRAWLERS.length) {
    add("crawlers", "AI crawler access", "fail", "Every major AI crawler is blocked by robots.txt. AI engines literally cannot read your site.", "Remove the Disallow rules for " + blocked.map((c) => c.ua).join(", ") + " in robots.txt.");
  } else {
    add("crawlers", "AI crawler access", "warn", "Blocked: " + blocked.map((c) => `${c.ua} (${c.who})`).join("; ") + ".", "Allow these user-agents in robots.txt so those engines can cite you.");
  }

  const validTypes = h.jsonldTypes.filter((t) => t !== "(unparseable)");
  if (validTypes.length) add("schema", "Structured data (JSON-LD)", "pass", "Found JSON-LD: " + [...new Set(validTypes)].slice(0, 6).join(", ") + ".", null);
  else if (h.jsonldTypes.length) add("schema", "Structured data (JSON-LD)", "warn", "JSON-LD is present but could not be parsed.", "Fix the malformed JSON-LD so engines can read it.");
  else add("schema", "Structured data (JSON-LD)", "fail", "No JSON-LD structured data found.", "Add Organization + FAQPage + Article JSON-LD. AI engines use it to classify and quote your content.");

  const titleOk = h.title && h.title.length >= 15 && h.title.length <= 65;
  const descOk = h.description && h.description.length >= 70 && h.description.length <= 165;
  if (titleOk && descOk) add("meta", "Title & meta description", "pass", "Both present and well-sized.", null);
  else add("meta", "Title & meta description", h.title || h.description ? "warn" : "fail",
    `Title: ${h.title ? `"${h.title.slice(0, 60)}" (${h.title.length} chars)` : "missing"}. Description: ${h.description ? `${h.description.length} chars` : "missing"}.`,
    "Use a 15-65 char title and a 70-165 char meta description that answers a real buyer question.");

  add("og", "Open Graph tags", h.og >= 3 ? "pass" : h.og > 0 ? "warn" : "fail",
    h.og ? `${h.og} og: tags found.` : "No Open Graph tags.",
    h.og >= 3 ? null : "Add og:title, og:description, og:image, og:url for clean link previews and richer machine context.");

  add("sitemap", "XML sitemap", hasSitemap ? "pass" : "fail",
    hasSitemap ? "sitemap.xml found." : "No sitemap.xml at the site root.",
    hasSitemap ? null : "Publish /sitemap.xml and submit it in Bing Webmaster Tools (ChatGPT Search reads the Bing index).");

  add("llms", "llms.txt", hasLlms ? "pass" : "warn",
    hasLlms ? "llms.txt found." : "No llms.txt. (Minor: it has no proven effect on citations yet, but it's cheap dev-doc hygiene.)",
    hasLlms ? null : "Optional: add /llms.txt as a concise map of your key pages for AI tools. Don't expect a ranking boost.");

  const W = { crawlers: 35, schema: 22, meta: 15, og: 8, sitemap: 15, llms: 5 };
  const pts = { pass: 1, warn: 0.5, fail: 0 };
  let score = 0, max = 0;
  for (const c of checks) { score += (W[c.id] || 0) * pts[c.status]; max += W[c.id] || 0; }
  score = Math.round((score / max) * 100);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return {
    url: page.finalUrl || u.toString(),
    score, grade,
    summary: { wordsOnHomepage: h.words, lang: h.lang, canonical: h.canonical, h1: h.h1 },
    checks,
    checkedAt: new Date().toISOString(),
  };
}

router.get("/ai-readiness", async (req, res) => {
  try {
    const result = await runCheck(req.query.url);
    res.json(result);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message || "Could not check that site" });
  }
});

// ---- llms.txt generator helpers (pure; exported for tests) ----
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™" };
export function decodeEntities(str) {
  if (!str) return str;
  return String(str).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// Same-origin links inside <nav> elements, in document order, with their visible label.
// The site root and in-page/asset links are skipped.
export function extractNavLinks(html, origin) {
  const out = [];
  const seen = new Set();
  for (const nav of String(html || "").match(/<nav\b[\s\S]*?<\/nav>/gi) || []) {
    for (const m of nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = (m[1].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
      let abs;
      try { abs = new URL(href, origin); } catch { continue; }
      if (abs.origin !== origin) continue;
      const url = abs.toString().replace(/[#?].*$/, "");
      const key = url.replace(/\/+$/, "");
      if (key === origin || seen.has(key)) continue;
      if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip)$/i.test(abs.pathname)) continue;
      const label = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      seen.add(key);
      out.push({ url, label: label || null });
    }
  }
  return out;
}

// Navigation first (site order), then remaining sitemap/link URLs; trailing-slash-insensitive
// dedupe; explicit truncation accounting instead of a silent cap.
export function orderLlmsUrls({ navLinks = [], urls = [], cap = 50 }) {
  const seen = new Set();
  const all = [];
  for (const n of navLinks) { const k = n.url.replace(/\/+$/, ""); if (!seen.has(k)) { seen.add(k); all.push({ url: n.url, label: n.label, nav: true }); } }
  for (const x of urls) { const k = x.replace(/\/+$/, ""); if (!seen.has(k)) { seen.add(k); all.push({ url: x, label: null, nav: false }); } }
  const kept = all.slice(0, cap);
  return { items: kept, totalFound: all.length, truncated: all.length > kept.length, omitted: all.length - kept.length };
}

// Free llms.txt generator: build a spec-shaped llms.txt from a site's sitemap (or homepage
// links), with page titles/descriptions. Genuinely useful dev-doc hygiene; honestly NOT a
// citation-ranking lever (we say so on the tool page). Funnels to the paid audit.
router.get("/llms-txt", async (req, res) => {
  const budget = createRequestBudget(LLMS_TOTAL_BUDGET_MS);
  try {
    const u = normalizeUrl(req.query.url);
    await assertPublicUrl(u); // shared guard (server/lib/agent-readiness/ssrf.js)
    const headers = { "User-Agent": UA, Accept: "text/html,*/*" };

    let page;
    try { page = await fetchPublicBounded(u.toString(), { allowHostVariants: true, maxRedirects: 3, maxBytes: MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS, headers, budget }); }
    catch (e) {
      if (e.code === "ssrf") throw e;
      const err = httpErr(e.code === "off_origin_redirect" ? 400 : 502, e.code === "off_origin_redirect" ? "That site redirects to a different host" : "Could not reach that site");
      err.code = e.code; throw err;
    }
    // A reached homepage needs a 2xx HTML response; a 404 page's <title> is not success.
    if (!page.ok) { const err = httpErr(502, `That site's homepage answered HTTP ${page.status}`); err.code = "homepage_not_ok"; err.httpStatus = page.status; throw err; }
    if (!isHtml(page.contentType)) { const err = httpErr(502, "That site's homepage is not an HTML page"); err.code = "homepage_not_html"; throw err; }
    const origin = new URL(page.finalUrl).origin;
    const h = analyzeHtml(page.body);

    const pathLabel = (link) => {
      try {
        const p = new URL(link).pathname.replace(/\/+$/, "");
        if (p === "") return "Home";
        return (p.split("/").pop() || p).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || p;
      } catch { return link; }
    };

    // Supplied list (?paths=/a,/b) or robots.txt Sitemap: lines + /sitemap.xml, one index level.
    const rawPaths = req.query.paths;
    const suppliedPaths = rawPaths == null ? null
      : (Array.isArray(rawPaths) ? rawPaths : String(rawPaths).split(",")).map((x) => String(x).trim()).filter(Boolean);
    const found = await discoverSiteUrls({ origin, suppliedPaths, budget, headers: { "User-Agent": UA, Accept: "application/xml,text/plain,*/*" } });
    let urls = found.urls;
    const discovery = {
      mode: found.mode,
      source: urls.length ? (found.mode === "supplied" ? "supplied" : "sitemap") : "homepage-links",
      sitemaps: found.sitemaps, missing: found.missing, redirected: found.redirected,
      rejected: found.rejected, limited: found.limited, skipped: found.skipped,
      provenance: found.provenance,
    };

    if (!urls.length && found.mode !== "supplied") {
      const set = new Set();
      for (const m of page.body.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi)) {
        try {
          const abs = new URL(m[1], origin);
          if (abs.origin === origin) set.add(abs.toString().replace(/[#?].*$/, ""));
        } catch { /* ignore bad href */ }
      }
      urls = [...set];
    }

    // navigation sections first, then the rest; explicit truncation (no silent cap)
    const navLinks = found.mode === "supplied" ? [] : extractNavLinks(page.body, origin);
    const ordered = orderLlmsUrls({ navLinks, urls, cap: 50 });

    // fetch title/description for the first N pages in parallel; label the rest from the path
    const TITLE_N = 14;
    // Each item is read in its own origin scope: a supplied external reference is
    // fetched anonymously and its redirects must stay on that reference's origin.
    const provOf = (x) => found.provenance?.[x] || (found.mode === "supplied" ? PROVENANCE.SUPPLIED_SAME_ORIGIN : discovery.source);
    for (const it of ordered.items) it.external = provOf(it.url) === PROVENANCE.SUPPLIED_EXTERNAL;
    const head = await Promise.all(ordered.items.slice(0, TITLE_N).map(async (it) => {
      try {
        if (budget.exhausted) throw new Error("budget");
        const itOrigin = it.external ? new URL(it.url).origin : origin;
        const r = await fetchPublicBounded(it.url, { allowedOrigin: itOrigin, maxRedirects: 3, maxBytes: MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS, headers: it.external ? anonymousHeaders(headers) : headers, budget });
        if (!r.ok || !isHtml(r.contentType)) throw new Error("not a page");
        const a = analyzeHtml(r.body);
        return { ...it, title: it.label || a.title || pathLabel(it.url), desc: a.description || "" };
      } catch { return { ...it, title: it.label || pathLabel(it.url), desc: "" }; }
    }));
    const tail = ordered.items.slice(TITLE_N).map((it) => ({ ...it, title: it.label || pathLabel(it.url), desc: "" }));
    const pages = [...head, ...tail];

    const hostname = new URL(origin).hostname;
    const siteName = decodeEntities((h.title || hostname).split(/[|–—:·]|\s-\s/)[0].trim()).slice(0, 60) || hostname;
    const clean = (x, n) => decodeEntities(String(x)).replace(/\s+/g, " ").trim().slice(0, n);
    const line = (p) => `- [${clean(p.title || p.url, 80)}](${p.url})${p.desc ? ": " + clean(p.desc, 130) : ""}\n`;
    let out = `# ${siteName}\n\n`;
    if (h.description) out += `> ${clean(h.description, 500)}\n\n`;
    const navPages = pages.filter((p) => p.nav);
    const restPages = pages.filter((p) => !p.nav && !p.external);
    const externalPages = pages.filter((p) => !p.nav && p.external);
    if (navPages.length) { out += `## Sections\n\n`; for (const p of navPages) out += line(p); out += `\n`; }
    if (restPages.length) { out += `## Pages\n\n`; for (const p of restPages) out += line(p); }
    if (externalPages.length) { out += `${restPages.length ? "\n" : ""}## External references\n\n`; for (const p of externalPages) out += line(p); }
    if (ordered.truncated) out += `\n> This bounded output omits ${ordered.omitted} additional discovered pages.\n`;

    // Honest coverage labels: automatic mode is bounded by the 50 cap; supplied mode
    // qualifies only the requester's list, never automatic full coverage.
    const emittedKeys = new Set(ordered.items.map((it) => it.url.replace(/\/+$/, "")));
    const omittedUrls = urls.filter((x) => !emittedKeys.has(x.replace(/\/+$/, ""))).slice(0, 200);
    const extN = pages.filter((p) => p.external).length;
    discovery.coverage = found.mode === "supplied"
      ? { mode: "requester-supplied", emitted: pages.length, supplied: suppliedPaths.length,
          suppliedSameOrigin: pages.length - extN, suppliedExternal: extN,
          references: pages.map((p) => ({ url: p.url, provenance: provOf(p.url) })),
          label: `requester-supplied: ${pages.length} of ${suppliedPaths.length} supplied references emitted (${pages.length - extN} supplied-same-origin, ${extN} supplied-external); qualifies the supplied list only, not automatic full coverage` }
      : { mode: "automatic", emitted: pages.length, discovered: ordered.totalFound, cap: 50, omittedUrls,
          label: `automatic: ${pages.length} of ${ordered.totalFound} discovered pages emitted (cap 50); ${ordered.omitted} omitted` };
    if (budget.exhausted) discovery.coverage.partial = "budget_exhausted";
    res.json({ origin, siteName, count: pages.length, llmsTxt: out, totalFound: ordered.totalFound, truncated: ordered.truncated, omitted: ordered.omitted, navSections: navPages.length, discovery });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message || "Could not generate llms.txt", ...(e.code ? { code: e.code } : {}), ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}) });
  } finally {
    budget.dispose();
  }
});

export default router;
