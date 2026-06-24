import { Router } from "express";
import dns from "node:dns/promises";
import net from "node:net";

// Free "AI Readiness Checker" — a zero-marginal-cost lead magnet. Given a URL it fetches
// the page + robots.txt and checks whether AI search engines (ChatGPT/Claude/Perplexity/
// Gemini) can crawl + understand the site, then returns a score + concrete fixes. The deep
// version (real citation testing vs competitors) is the paid AI-Search Visibility Audit.
// runCheck() is exported so the server-rendered /scan proof page can reuse it.
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

// Free llms.txt generator: build a spec-shaped llms.txt from a site's sitemap (or homepage
// links), with page titles/descriptions. Genuinely useful dev-doc hygiene; honestly NOT a
// citation-ranking lever (we say so on the tool page). Funnels to the paid audit.
router.get("/llms-txt", async (req, res) => {
  try {
    const u = normalizeUrl(req.query.url);
    await assertPublicHost(u.hostname);

    let page;
    try { page = await fetchText(u.toString(), { acceptHtml: true }); }
    catch { throw httpErr(502, "Could not reach that site"); }
    const origin = (() => { try { return new URL(page.finalUrl || u.toString()).origin; } catch { return u.origin; } })();
    const h = analyzeHtml(page.body);

    const pathLabel = (link) => {
      try {
        const p = new URL(link).pathname.replace(/\/+$/, "");
        if (p === "") return "Home";
        return (p.split("/").pop() || p).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || p;
      } catch { return link; }
    };

    // Collect URLs from sitemap.xml (follow one level of sitemap index), else homepage links.
    let urls = [];
    try {
      const sm = await fetchText(origin + "/sitemap.xml");
      if (sm.ok) {
        let locs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
        if (/<sitemapindex/i.test(sm.body) && locs.length) {
          const child = await fetchText(locs[0]).catch(() => null);
          if (child && child.ok) locs = [...child.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
        }
        urls = locs;
      }
    } catch { /* fall through to link scrape */ }

    if (!urls.length) {
      const set = new Set();
      for (const m of page.body.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi)) {
        try {
          const abs = new URL(m[1], origin);
          if (abs.origin === origin) set.add(abs.toString().replace(/[#?].*$/, ""));
        } catch { /* ignore bad href */ }
      }
      urls = [...set];
    }

    // dedupe (trailing slash insensitive) + cap
    const seen = new Set();
    const deduped = [];
    for (const x of urls) {
      const key = x.replace(/\/+$/, "");
      if (!seen.has(key)) { seen.add(key); deduped.push(x); }
    }
    urls = deduped.slice(0, 50);

    // fetch title/description for the first N pages in parallel; label the rest from the path
    const TITLE_N = 14;
    const head = await Promise.all(urls.slice(0, TITLE_N).map(async (link) => {
      try {
        const r = await fetchText(link, { acceptHtml: true });
        const a = analyzeHtml(r.body);
        return { url: link, title: a.title || pathLabel(link), desc: a.description || "" };
      } catch { return { url: link, title: pathLabel(link), desc: "" }; }
    }));
    const tail = urls.slice(TITLE_N).map((link) => ({ url: link, title: pathLabel(link), desc: "" }));
    const pages = [...head, ...tail];

    const hostname = new URL(origin).hostname;
    const siteName = (h.title || hostname).split(/[|–—:·]|\s-\s/)[0].trim().slice(0, 60) || hostname;
    let out = `# ${siteName}\n\n`;
    if (h.description) out += `> ${h.description.replace(/\s+/g, " ").trim()}\n\n`;
    out += `## Pages\n\n`;
    for (const p of pages) {
      const t = (p.title || p.url).replace(/\s+/g, " ").trim().slice(0, 80);
      out += `- [${t}](${p.url})${p.desc ? ": " + p.desc.replace(/\s+/g, " ").trim().slice(0, 130) : ""}\n`;
    }

    res.json({ origin, siteName, count: pages.length, llmsTxt: out });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message || "Could not generate llms.txt" });
  }
});

export default router;
