// Lightweight, dependency-free, in-memory request analytics.
//
// Why this exists: the client-side PostHog key is not present in the production
// build, so we had ZERO visibility into whether the funnel gets any traffic.
// This middleware records page/content requests server-side (no client key, no
// cookies, no DB) and exposes an aggregate read endpoint we can poll over HTTP.
//
// Caveat: state is in-memory, so it resets on each restart/redeploy. That is
// fine for "is anything happening and from where" monitoring between deploys.
// No PII is stored: IPs are bucketed to a coarse hash only for unique-ish counts.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RECENT_CAP = 80;

const state = {
  startedAt: new Date().toISOString(),
  total: 0,
  humans: 0,
  bots: 0,
  aiCrawlers: 0,
  byPath: Object.create(null), // page path -> count (human + unknown only)
  byReferer: Object.create(null), // referer host -> count (humans)
  byAiBot: Object.create(null), // AI crawler product -> count
  uniqueHumans: new Set(), // coarse ip+ua hash, humans only
  funnel: { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 },
  recent: [], // last N events
};

// Best-effort persistence: the in-memory state would otherwise reset on every
// restart/redeploy (frequent), and we'd lose the first real visitors. Snapshot
// to a tmp file and reload on boot. Harmless if the FS doesn't persist.
const PULSE_FILE = process.env.PULSE_FILE || path.join(os.tmpdir(), "sdd-pulse-v1.json");
let dirty = false;

function saveSnapshot() {
  try {
    fs.writeFileSync(PULSE_FILE, JSON.stringify({ ...state, uniqueHumans: [...state.uniqueHumans] }));
    dirty = false;
  } catch {
    /* ignore */
  }
}
function loadSnapshot() {
  try {
    const s = JSON.parse(fs.readFileSync(PULSE_FILE, "utf8"));
    state.total = s.total || 0;
    state.humans = s.humans || 0;
    state.bots = s.bots || 0;
    state.aiCrawlers = s.aiCrawlers || 0;
    Object.assign(state.byPath, s.byPath || {});
    Object.assign(state.byReferer, s.byReferer || {});
    Object.assign(state.byAiBot, s.byAiBot || {});
    Object.assign(state.funnel, s.funnel || {});
    state.uniqueHumans = new Set(s.uniqueHumans || []);
    state.recent = Array.isArray(s.recent) ? s.recent.slice(-RECENT_CAP) : [];
    if (s.startedAt) state.startedAt = s.startedAt; // keep the true window start
  } catch {
    /* no snapshot yet */
  }
}
loadSnapshot();
setInterval(() => dirty && saveSnapshot(), 15000).unref();
process.on("SIGTERM", saveSnapshot);
process.on("beforeExit", saveSnapshot);

const AI_CRAWLERS = [
  ["GPTBot", /GPTBot/i],
  ["OAI-SearchBot", /OAI-SearchBot/i],
  ["ChatGPT-User", /ChatGPT-User/i],
  ["ClaudeBot", /ClaudeBot/i],
  ["Claude-User", /Claude-User|Claude-Web|anthropic-ai/i],
  ["PerplexityBot", /PerplexityBot/i],
  ["Perplexity-User", /Perplexity-User/i],
  ["Google-Extended", /Google-Extended/i],
  ["Applebot-Extended", /Applebot-Extended/i],
  ["CCBot", /CCBot/i],
  ["Bytespider", /Bytespider/i],
  ["Amazonbot", /Amazonbot/i],
  ["cohere-ai", /cohere-ai/i],
  ["Meta-ExternalAgent", /Meta-ExternalAgent|FacebookBot/i],
  ["YouBot", /YouBot/i],
  ["DuckAssistBot", /DuckAssistBot/i],
];

const GENERIC_BOT =
  /bot\b|crawler|spider|slurp|bingbot|googlebot|yandex|baidu|duckduckbot|facebookexternalhit|crawl|headless|preview|monitor|uptime|python-requests|curl|wget|go-http|node-fetch|axios|libwww|httpclient|scrapy|semrush|ahrefs|mj12|dotbot/i;

const ASSET_RE = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|txt|xml|json|webmanifest)$/i;

function classify(ua) {
  if (!ua) return { kind: "bot", aiBot: null }; // no UA → almost always a bot/script
  for (const [name, re] of AI_CRAWLERS) if (re.test(ua)) return { kind: "ai", aiBot: name };
  if (GENERIC_BOT.test(ua)) return { kind: "bot", aiBot: null };
  return { kind: "human", aiBot: null };
}

function refererHost(ref) {
  if (!ref) return "(direct)";
  try {
    const h = new URL(ref).host;
    return h || "(direct)";
  } catch {
    return "(other)";
  }
}

function bump(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

export function pulseMiddleware(req, _res, next) {
  try {
    if (req.method !== "GET") return next();
    const p = (req.path || "/").split("?")[0];
    // Ignore assets, the pulse endpoint itself, health, and API noise.
    if (
      ASSET_RE.test(p) ||
      p.startsWith("/api/") ||
      p === "/favicon.ico" ||
      p === "/robots.txt" ||
      p === "/sitemap.xml"
    ) {
      return next();
    }

    const ua = req.headers["user-agent"] || "";
    const { kind, aiBot } = classify(ua);
    const ref = refererHost(req.headers["referer"] || req.headers["origin"] || "");
    state.total += 1;

    if (kind === "ai") {
      state.aiCrawlers += 1;
      bump(state.byAiBot, aiBot);
    } else if (kind === "bot") {
      state.bots += 1;
    } else {
      state.humans += 1;
      bump(state.byPath, p.length > 60 ? p.slice(0, 60) : p);
      bump(state.byReferer, ref);
      const ipRaw = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
      const fp = crypto.createHash("sha1").update(ipRaw + "|" + ua).digest("hex").slice(0, 16);
      state.uniqueHumans.add(fp);
    }

    // Funnel buckets (count all visitor kinds; humans matter most but AI crawlers
    // hitting /scan or /reports is itself a GEO signal).
    if (p === "/") state.funnel.home += 1;
    else if (p === "/scan" || p.startsWith("/scan")) state.funnel.scan += 1;
    else if (p.startsWith("/tools")) state.funnel.tools += 1;
    else if (p.startsWith("/reports")) state.funnel.reports += 1;
    else if (p.startsWith("/guides")) state.funnel.guides += 1;
    else if (p === "/pricing" || p === "/checkout") state.funnel.pricing += 1;

    state.recent.push({
      t: new Date().toISOString(),
      p,
      kind: aiBot || kind,
      ref: kind === "human" ? ref : undefined,
    });
    if (state.recent.length > RECENT_CAP) state.recent.shift();
    dirty = true;
  } catch {
    // Never let analytics break a request.
  }
  return next();
}

export function pulseSnapshot() {
  return {
    startedAt: state.startedAt,
    now: new Date().toISOString(),
    total: state.total,
    humans: state.humans,
    uniqueHumans: state.uniqueHumans.size,
    bots: state.bots,
    aiCrawlers: state.aiCrawlers,
    funnel: state.funnel,
    byPath: state.byPath,
    byReferer: state.byReferer,
    byAiBot: state.byAiBot,
    recent: state.recent.slice(-40).reverse(),
  };
}
