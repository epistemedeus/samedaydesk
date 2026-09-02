// Lightweight, dependency-free aggregate request analytics.
//
// Why this exists: the client-side PostHog key is not present in the production
// build, so we had ZERO visibility into whether the funnel gets any traffic.
// This middleware records page/content requests server-side (no client key, no
// cookies, no DB) and exposes an aggregate read endpoint we can poll over HTTP.
//
// State is held in memory while the process runs and best-effort snapshotted to
// disk so ordinary restarts do not erase the observation window. No PII is
// stored: IPs are bucketed to a coarse hash only for unique-ish counts.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RECENT_CAP = 80;
const CLASSIFICATION_SCHEMA_VERSION = 2;
const MCP_MOUNT_PATH = "/mcp";
const MCP_BATCH_MAX = 25;
const MCP_METHOD_MAX_LEN = 128;

export const sellerRepairFindingRouteClasses = Object.freeze({
  "hypernatt-liq-radar-20260830": "paid_get",
  "onesource-erc20-balance-20260830": "paid_get",
  "402-com-tr-morpho-health-20260830": "paid_get",
  "scrape402-crypto-20260830": "paid_get",
  "vibe-springs-btc-usd-20260830": "paid_get",
  "blockrun-exa-search-20260830": "paid_post",
  "exa-direct-search-20260830": "paid_post",
  "driftflight-image-generation-20260830": "paid_post",
  "agenttoll-market-radar-20260901": "paid_post",
});
export const sellerRepairFindingIds = Object.freeze(
  Object.keys(sellerRepairFindingRouteClasses),
);
const SELLER_REPAIR_FINDING_IDS = new Set(sellerRepairFindingIds);

function emptyMcpProtocol() {
  return {
    requests: 0,
    messages: 0,
    byMethod: {
      initialize: 0,
      "tools/list": 0,
      "tools/call": 0,
      notifications: 0,
      other: 0,
    },
  };
}

function emptyFunnel() {
  return { home: 0, scan: 0, tools: 0, reports: 0, guides: 0, pricing: 0 };
}

const state = {
  startedAt: new Date().toISOString(),
  classificationSchemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  total: 0,
  humans: 0,
  bots: 0,
  aiCrawlers: 0,
  mcpSurfaceGets: 0,
  mcpProtocol: emptyMcpProtocol(),
  legacyUncertainty: null,
  byPath: Object.create(null), // page path -> count (humans only)
  byReferer: Object.create(null), // referer host -> count (humans)
  byAiBot: Object.create(null), // AI crawler product -> count
  uniqueHumans: new Set(), // coarse ip+ua hash, humans only
  funnel: emptyFunnel(),
  sellerRepair: {
    briefViews: 0,
    scopeClicks: 0,
    checkoutStarts: 0,
    byFinding: Object.create(null),
  },
  recent: [], // last N events
};

// Production snapshots must live outside the replaceable application release.
// An explicit file always wins. Otherwise use the conventional per-user state
// directory in production and reserve the runtime temp directory for local
// development. This stays provider-neutral while surviving ordinary releases
// on hosts that preserve the service account's home directory.
const LEGACY_PULSE_FILE = path.join(os.tmpdir(), "sdd-pulse-v1.json");
const productionStateHome =
  process.env.XDG_STATE_HOME ||
  (process.env.HOME ? path.join(process.env.HOME, ".local", "state") : null);
const PULSE_FILE =
  process.env.PULSE_FILE ||
  (process.env.NODE_ENV === "production" && productionStateHome
    ? path.join(productionStateHome, "samedaydesk", "pulse-v1.json")
    : LEGACY_PULSE_FILE);
const pulseStorage = {
  mode: process.env.PULSE_FILE
    ? "explicit"
    : PULSE_FILE === LEGACY_PULSE_FILE
      ? "temporary"
      : "production_state_home",
  loaded: false,
  migratedLegacySnapshot: false,
  lastSaveAt: null,
  lastSaveOk: null,
};
let dirty = false;

function serializeSnapshot() {
  return {
    ...state,
    uniqueHumans: [...state.uniqueHumans],
  };
}

function saveSnapshot() {
  try {
    fs.mkdirSync(path.dirname(PULSE_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(PULSE_FILE, JSON.stringify(serializeSnapshot()));
    dirty = false;
    pulseStorage.lastSaveAt = new Date().toISOString();
    pulseStorage.lastSaveOk = true;
    return true;
  } catch {
    pulseStorage.lastSaveOk = false;
    return false;
  }
}

function loadSellerRepair(s) {
  state.sellerRepair.briefViews = s.sellerRepair?.briefViews || 0;
  state.sellerRepair.scopeClicks = s.sellerRepair?.scopeClicks || 0;
  state.sellerRepair.checkoutStarts = s.sellerRepair?.checkoutStarts || 0;
  state.sellerRepair.byFinding = Object.create(null);
  for (const findingId of sellerRepairFindingIds) {
    const row = s.sellerRepair?.byFinding?.[findingId];
    if (row?.routeClass !== sellerRepairFindingRouteClasses[findingId]) continue;
    state.sellerRepair.byFinding[findingId] = {
      routeClass: row.routeClass,
      briefViews: Number.isSafeInteger(row.briefViews) && row.briefViews >= 0
        ? row.briefViews
        : 0,
      scopeClicks: Number.isSafeInteger(row.scopeClicks) && row.scopeClicks >= 0
        ? row.scopeClicks
        : 0,
      checkoutStarts: Number.isSafeInteger(row.checkoutStarts) && row.checkoutStarts >= 0
        ? row.checkoutStarts
        : 0,
    };
  }
}

function resetV2RequestCounters() {
  state.startedAt = new Date().toISOString();
  state.total = 0;
  state.humans = 0;
  state.bots = 0;
  state.aiCrawlers = 0;
  state.mcpSurfaceGets = 0;
  state.mcpProtocol = emptyMcpProtocol();
  state.byPath = Object.create(null);
  state.byReferer = Object.create(null);
  state.byAiBot = Object.create(null);
  state.uniqueHumans = new Set();
  state.funnel = emptyFunnel();
  state.recent = [];
  state.classificationSchemaVersion = CLASSIFICATION_SCHEMA_VERSION;
}

function applyLegacyUncertaintyBoundary(s) {
  state.legacyUncertainty = {
    schemaVersion: 1,
    note:
      "Request-classification counters captured before MCP surface/protocol split. " +
      "GET /mcp hits were stored as human page views without evidence to relabel them.",
    startedAt: s.startedAt || null,
    total: s.total || 0,
    humans: s.humans || 0,
    uniqueHumans: Array.isArray(s.uniqueHumans) ? s.uniqueHumans.length : 0,
    bots: s.bots || 0,
    aiCrawlers: s.aiCrawlers || 0,
    byPath: { ...(s.byPath || {}) },
    byReferer: { ...(s.byReferer || {}) },
    byAiBot: { ...(s.byAiBot || {}) },
    funnel: { ...emptyFunnel(), ...(s.funnel || {}) },
    recent: Array.isArray(s.recent) ? s.recent.slice(-RECENT_CAP) : [],
  };
  resetV2RequestCounters();
  dirty = true;
}

function loadV2RequestCounters(s) {
  state.classificationSchemaVersion = s.classificationSchemaVersion || CLASSIFICATION_SCHEMA_VERSION;
  state.startedAt = s.startedAt || state.startedAt;
  state.total = s.total || 0;
  state.humans = s.humans || 0;
  state.bots = s.bots || 0;
  state.aiCrawlers = s.aiCrawlers || 0;
  state.mcpSurfaceGets = s.mcpSurfaceGets || 0;
  state.mcpProtocol = emptyMcpProtocol();
  const loadedProtocol = s.mcpProtocol;
  if (loadedProtocol && typeof loadedProtocol === "object") {
    state.mcpProtocol.requests = loadedProtocol.requests || 0;
    state.mcpProtocol.messages = loadedProtocol.messages || 0;
    for (const key of Object.keys(state.mcpProtocol.byMethod)) {
      state.mcpProtocol.byMethod[key] = loadedProtocol.byMethod?.[key] || 0;
    }
  }
  Object.assign(state.byPath, s.byPath || {});
  Object.assign(state.byReferer, s.byReferer || {});
  Object.assign(state.byAiBot, s.byAiBot || {});
  Object.assign(state.funnel, { ...emptyFunnel(), ...(s.funnel || {}) });
  state.uniqueHumans = new Set(s.uniqueHumans || []);
  state.recent = Array.isArray(s.recent) ? s.recent.slice(-RECENT_CAP) : [];
  state.legacyUncertainty = s.legacyUncertainty || null;
}

function loadSnapshot() {
  try {
    let source = PULSE_FILE;
    if (!fs.existsSync(source) && source !== LEGACY_PULSE_FILE && fs.existsSync(LEGACY_PULSE_FILE)) {
      source = LEGACY_PULSE_FILE;
      pulseStorage.migratedLegacySnapshot = true;
    }
    const s = JSON.parse(fs.readFileSync(source, "utf8"));
    const loadedSchemaVersion = s.classificationSchemaVersion || 1;
    loadSellerRepair(s);
    pulseStorage.loaded = true;

    if (loadedSchemaVersion >= CLASSIFICATION_SCHEMA_VERSION) {
      loadV2RequestCounters(s);
    } else {
      applyLegacyUncertaintyBoundary(s);
    }

    if (source !== PULSE_FILE || loadedSchemaVersion < CLASSIFICATION_SCHEMA_VERSION) {
      dirty = true;
      saveSnapshot();
    }
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

function headerValue(req, name) {
  const raw = req.headers?.[name];
  if (Array.isArray(raw)) return String(raw[0] || "");
  return typeof raw === "string" ? raw : "";
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

function isMcpMountPath(requestPath) {
  return requestPath === MCP_MOUNT_PATH || requestPath === `${MCP_MOUNT_PATH}/`;
}

function pushRecent(event) {
  state.recent.push(event);
  if (state.recent.length > RECENT_CAP) state.recent.shift();
  dirty = true;
}

export function mcpMethodClass(method) {
  if (method === "initialize") return "initialize";
  if (method === "tools/list") return "tools/list";
  if (method === "tools/call") return "tools/call";
  if (
    method === "notifications/initialized" ||
    method === "notifications/cancelled" ||
    method.startsWith("notifications/")
  ) {
    return "notifications";
  }
  return "other";
}

function isValidMcpRpcMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
  if (msg.jsonrpc !== "2.0") return false;
  if (typeof msg.method !== "string" || !msg.method || msg.method.length > MCP_METHOD_MAX_LEN) {
    return false;
  }
  return true;
}

// Admit shape-valid POST /mcp JSON-RPC bodies only. Params, IDs, and tool names
// are never read or stored.
export function parseMcpProtocolBody(body) {
  let entries;
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MCP_BATCH_MAX) {
      return { admitted: false, messages: [] };
    }
    entries = body;
  } else if (body && typeof body === "object") {
    entries = [body];
  } else {
    return { admitted: false, messages: [] };
  }

  const messages = [];
  for (const entry of entries) {
    if (!isValidMcpRpcMessage(entry)) return { admitted: false, messages: [] };
    messages.push({ methodClass: mcpMethodClass(entry.method) });
  }
  return { admitted: messages.length > 0, messages };
}

export function classifyPulseGet(req, requestPath) {
  const ua = headerValue(req, "user-agent");
  const { kind, aiBot } = classify(ua);
  return { kind, aiBot, recentKind: aiBot || kind };
}

function recordMcpSurfaceGet() {
  state.total += 1;
  state.mcpSurfaceGets += 1;
  pushRecent({
    t: new Date().toISOString(),
    p: MCP_MOUNT_PATH,
    kind: "mcpSurfaceGet",
  });
}

function recordMcpProtocolPost(req) {
  const parsed = parseMcpProtocolBody(req.body);
  if (!parsed.admitted) return;

  state.total += 1;
  state.mcpProtocol.requests += 1;
  state.mcpProtocol.messages += parsed.messages.length;
  for (const { methodClass } of parsed.messages) {
    bump(state.mcpProtocol.byMethod, methodClass);
  }
  pushRecent({
    t: new Date().toISOString(),
    p: MCP_MOUNT_PATH,
    kind: "mcpProtocol",
    n: parsed.messages.length,
  });
}

function recordOrdinaryGet(req, p) {
  const { kind, aiBot, recentKind } = classifyPulseGet(req, p);
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
    const ua = headerValue(req, "user-agent");
    const ipRaw = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
    const fp = crypto.createHash("sha1").update(ipRaw + "|" + ua).digest("hex").slice(0, 16);
    state.uniqueHumans.add(fp);
  }

  if (p === "/") state.funnel.home += 1;
  else if (p === "/scan" || p.startsWith("/scan")) state.funnel.scan += 1;
  else if (p.startsWith("/tools")) state.funnel.tools += 1;
  else if (p.startsWith("/reports")) state.funnel.reports += 1;
  else if (p.startsWith("/guides")) state.funnel.guides += 1;
  else if (p === "/pricing" || p === "/checkout") state.funnel.pricing += 1;

  pushRecent({
    t: new Date().toISOString(),
    p,
    kind: recentKind,
    ref: kind === "human" ? ref : undefined,
  });
}

export function pulseMiddleware(req, _res, next) {
  try {
    const p = (req.path || "/").split("?")[0];

    if (req.method === "POST" && isMcpMountPath(p)) {
      recordMcpProtocolPost(req);
      return next();
    }

    if (req.method !== "GET") return next();

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

    if (isMcpMountPath(p)) {
      recordMcpSurfaceGet();
      return next();
    }

    recordOrdinaryGet(req, p);
  } catch {
    // Never let analytics break a request.
  }
  return next();
}

const SELLER_REPAIR_EVENTS = new Set([
  "seller_repair_brief_viewed",
  "seller_repair_scope_clicked",
  "seller_repair_checkout_started",
]);
const FINDING_ID_RE = /^[a-z0-9-]{1,96}$/;

// These events are anonymous and spoofable. They are useful only as diagnostic
// interaction signals, never as seller identity, delivery, acceptance, demand,
// payment, or revenue evidence.
export function recordClientEvent(event, props) {
  if (!SELLER_REPAIR_EVENTS.has(event)) return false;
  const findingId = props?.finding_id;
  const routeClass = props?.route_class;
  if (typeof findingId !== "string" || !FINDING_ID_RE.test(findingId)) return false;
  if (!SELLER_REPAIR_FINDING_IDS.has(findingId)) return false;
  if (routeClass !== sellerRepairFindingRouteClasses[findingId]) return false;

  const row = state.sellerRepair.byFinding[findingId] || {
    routeClass,
    briefViews: 0,
    scopeClicks: 0,
    checkoutStarts: 0,
  };
  if (row.routeClass !== routeClass) return false;

  if (event === "seller_repair_brief_viewed") {
    row.briefViews += 1;
    state.sellerRepair.briefViews += 1;
  } else if (event === "seller_repair_scope_clicked") {
    row.scopeClicks += 1;
    state.sellerRepair.scopeClicks += 1;
  } else {
    row.checkoutStarts += 1;
    state.sellerRepair.checkoutStarts += 1;
  }
  state.sellerRepair.byFinding[findingId] = row;
  dirty = true;
  return true;
}

export function flushPulseSnapshot() {
  return saveSnapshot();
}

export function pulseSnapshot() {
  return {
    startedAt: state.startedAt,
    now: new Date().toISOString(),
    classificationSchemaVersion: state.classificationSchemaVersion,
    total: state.total,
    humans: state.humans,
    uniqueHumans: state.uniqueHumans.size,
    bots: state.bots,
    aiCrawlers: state.aiCrawlers,
    mcpSurfaceGet: {
      requests: state.mcpSurfaceGets,
      meaning:
        "GET /mcp hits the MCP endpoint setup or purchase-return plain-text surface. " +
        "May be a browser, monitor, registry probe, or client check. " +
        "Not unique agents, buyers, demand, payment, or protocol use.",
    },
    mcpProtocol: {
      httpRequests: state.mcpProtocol.requests,
      messages: state.mcpProtocol.messages,
      byMethod: { ...state.mcpProtocol.byMethod },
      meaning:
        "Shape-valid POST /mcp JSON-RPC HTTP requests only. " +
        "Counts HTTP requests and safe method classes, not params, tools, sessions, or delivery. " +
        "Not unique agents, buyers, demand, or payment.",
    },
    legacyUncertainty: state.legacyUncertainty,
    funnel: state.funnel,
    byPath: state.byPath,
    byReferer: state.byReferer,
    byAiBot: state.byAiBot,
    sellerRepair: state.sellerRepair,
    storage: { ...pulseStorage },
    recent: state.recent.slice(-40).reverse(),
  };
}
