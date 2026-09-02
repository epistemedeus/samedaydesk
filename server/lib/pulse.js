// Lightweight aggregate request analytics with optional durable atomic backing.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLASSIFICATION_SCHEMA_VERSION,
  LEGACY_IMPORT_KEY,
  MCP_METHOD_KEYS,
  bumpCounterMap,
  deltaFromV2Snapshot,
  deltaIsEmpty,
  deltaToRpcPayload,
  durableSnapshotToCounters,
  emptyDelta,
  emptyFunnel,
  migrationDigest,
  snapshotCountersFromDelta,
  stableFlushIdFromDelta,
  deltaCanonicalDigest,
  validateDelta,
} from "./pulse-store/schema.js";
import {
  createDefaultFileFallback,
  createDefaultPulseStore,
  newFlushId,
} from "./pulse-store/index.js";
import { assertSnapshotMigrationKeys, validateLegacyFingerprintArray } from "./pulse-store/wal-schema.js";

const RECENT_CAP = 80;
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

const LEGACY_PULSE_FILE = path.join(os.tmpdir(), "sdd-pulse-v1.json");
const productionStateHome =
  process.env.XDG_STATE_HOME ||
  (process.env.HOME ? path.join(process.env.HOME, ".local", "state") : null);
const PULSE_FILE =
  process.env.PULSE_FILE ||
  (process.env.NODE_ENV === "production" && productionStateHome
    ? path.join(productionStateHome, "samedaydesk", "pulse-v1.json")
    : LEGACY_PULSE_FILE);
const PULSE_FALLBACK_FILE = `${PULSE_FILE}.fallback.json`;

const processStartedAt = new Date().toISOString();
let observationStartedAt = processStartedAt;
let durableStore = createDefaultPulseStore();
let fileFallback = createDefaultFileFallback(PULSE_FALLBACK_FILE);
let hydrationState = "pending";
let durableSnapshot = null;
let legacyUncertainty = null;
let pendingDelta = emptyDelta();
let inFlightFlush = null;
let flushInProgress = false;
let lastSuccessfulFlush = fileFallback.getLastSuccessfulFlush();
let droppedUnknown = fileFallback.getDroppedUnknown();
let fallbackCorrupt = fileFallback.isCorrupt();
let snapshotCorrupt = fileFallback.isSnapshotCorrupt();
let walWritePending = false;

const localProcess = {
  uniqueHumans: new Set(),
  recent: [],
};

const pulseStorage = {
  mode: process.env.PULSE_FILE
    ? "explicit"
    : PULSE_FILE === LEGACY_PULSE_FILE
      ? "temporary"
      : "production_state_home",
  migratedLegacySnapshot: false,
  durableConfigured: durableStore.configured,
};

function refreshFallbackDiagnostics() {
  droppedUnknown = fileFallback.getDroppedUnknown();
  fallbackCorrupt = fileFallback.isCorrupt();
  snapshotCorrupt = fileFallback.isSnapshotCorrupt();
}

function hasKnownGap() {
  refreshFallbackDiagnostics();
  return droppedUnknown > 0 || fallbackCorrupt || snapshotCorrupt;
}

function hasIncompleteWrite() {
  return walWritePending;
}

function addWalCounters(into) {
  for (const entry of fileFallback.loadPendingFlushes()) {
    addSnapshotCounters(into, snapshotCountersFromDelta(entry.delta));
  }
}

function addSnapshotCounters(into, from) {
  into.total += from.total || 0;
  into.humans += from.humans || 0;
  into.bots += from.bots || 0;
  into.aiCrawlers += from.aiCrawlers || 0;
  into.mcpSurfaceGets += from.mcpSurfaceGets || 0;
  into.mcpProtocol.requests += from.mcpProtocol?.requests || 0;
  into.mcpProtocol.messages += from.mcpProtocol?.messages || 0;
  for (const key of MCP_METHOD_KEYS) {
    into.mcpProtocol.byMethod[key] =
      (into.mcpProtocol.byMethod[key] || 0) + (from.mcpProtocol?.byMethod?.[key] || 0);
  }
  for (const [key, value] of Object.entries(from.byPath || {})) {
    bumpCounterMap(into.byPath, key, value);
  }
  for (const [key, value] of Object.entries(from.byReferer || {})) {
    bumpCounterMap(into.byReferer, key, value);
  }
  for (const [key, value] of Object.entries(from.byAiBot || {})) {
    bumpCounterMap(into.byAiBot, key, value);
  }
  for (const key of Object.keys(emptyFunnel())) {
    into.funnel[key] = (into.funnel[key] || 0) + (from.funnel?.[key] || 0);
  }
  into.sellerRepair = mergeSellerRepairCounters(into.sellerRepair, from.sellerRepair);
}

function mergeSellerRepairCounters(base, add) {
  const out = {
    briefViews: (base.briefViews || 0) + (add?.briefViews || 0),
    scopeClicks: (base.scopeClicks || 0) + (add?.scopeClicks || 0),
    checkoutStarts: (base.checkoutStarts || 0) + (add?.checkoutStarts || 0),
    byFinding: { ...(base.byFinding || {}) },
  };
  for (const [findingId, row] of Object.entries(add?.byFinding || {})) {
    const existing = out.byFinding[findingId] || {
      routeClass: row.routeClass,
      briefViews: 0,
      scopeClicks: 0,
      checkoutStarts: 0,
    };
    out.byFinding[findingId] = {
      routeClass: existing.routeClass || row.routeClass,
      briefViews: (existing.briefViews || 0) + (row.briefViews || 0),
      scopeClicks: (existing.scopeClicks || 0) + (row.scopeClicks || 0),
      checkoutStarts: (existing.checkoutStarts || 0) + (row.checkoutStarts || 0),
    };
  }
  return out;
}

function operationalCounters() {
  const out = durableSnapshot
    ? durableSnapshotToCounters(durableSnapshot)
    : {
        total: 0,
        humans: 0,
        bots: 0,
        aiCrawlers: 0,
        mcpSurfaceGets: 0,
        mcpProtocol: { requests: 0, messages: 0, byMethod: Object.create(null) },
        byPath: Object.create(null),
        byReferer: Object.create(null),
        byAiBot: Object.create(null),
        funnel: emptyFunnel(),
        sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
      };
  addWalCounters(out);
  if (!deltaIsEmpty(pendingDelta)) {
    addSnapshotCounters(out, snapshotCountersFromDelta(pendingDelta));
  }
  return out;
}

function pendingCounters() {
  const out = {
    total: 0,
    humans: 0,
    bots: 0,
    aiCrawlers: 0,
    mcpSurfaceGets: 0,
    mcpProtocol: { requests: 0, messages: 0, byMethod: Object.create(null) },
    byPath: Object.create(null),
    byReferer: Object.create(null),
    byAiBot: Object.create(null),
    funnel: emptyFunnel(),
    sellerRepair: { briefViews: 0, scopeClicks: 0, checkoutStarts: 0, byFinding: {} },
  };
  addWalCounters(out);
  if (!deltaIsEmpty(pendingDelta)) {
    addSnapshotCounters(out, snapshotCountersFromDelta(pendingDelta));
  }
  return out;
}

function authorityState() {
  if (hasKnownGap()) return "incomplete_known_gap";
  if (hasIncompleteWrite()) return "incomplete_local_fallback";
  if (!durableStore.configured || hydrationState !== "hydrated") {
    return "incomplete_local_fallback";
  }
  if (inFlightFlush || !deltaIsEmpty(pendingDelta)) {
    return "incomplete_local_fallback";
  }
  if (fileFallback.loadPendingFlushes().length > 0) {
    return "incomplete_local_fallback";
  }
  return "durable_atomic_aggregate";
}

function isComplete() {
  if (hasKnownGap()) return false;
  if (hasIncompleteWrite()) return false;
  if (!durableStore.configured || hydrationState !== "hydrated") return false;
  if (inFlightFlush) return false;
  if (!deltaIsEmpty(pendingDelta)) return false;
  if (fileFallback.loadPendingFlushes().length > 0) return false;
  return true;
}

function admitPendingDeltaToWal() {
  if (deltaIsEmpty(pendingDelta)) return true;
  const delta = structuredClone(pendingDelta);
  const flushId = newFlushId();
  const entry = {
    flushId,
    delta,
    createdAt: new Date().toISOString(),
  };
  const result = fileFallback.enqueuePendingFlush(entry);
  refreshFallbackDiagnostics();
  if (result.outcome === "queued" || result.outcome === "duplicate_same") {
    pendingDelta = emptyDelta();
    walWritePending = false;
    if (!inFlightFlush) inFlightFlush = entry;
    return true;
  }
  if (result.outcome === "dropped_persisted") {
    pendingDelta = emptyDelta();
    walWritePending = false;
    return false;
  }
  if (result.outcome === "write_failed") {
    walWritePending = true;
    return false;
  }
  walWritePending = false;
  return false;
}

function enqueueMigrationDelta(delta) {
  if (deltaIsEmpty(delta)) return true;
  const normalized = validateDelta(delta);
  const canonical = deltaCanonicalDigest(normalized);
  for (const row of fileFallback.loadPendingFlushes()) {
    if (deltaCanonicalDigest(row.delta) === canonical) return true;
  }
  const flushId = stableFlushIdFromDelta(normalized);
  if (lastSuccessfulFlush?.flushId === flushId) return true;
  const entry = {
    flushId,
    delta: normalized,
    createdAt: new Date().toISOString(),
  };
  const result = fileFallback.enqueuePendingFlush(entry);
  refreshFallbackDiagnostics();
  if (result.outcome === "queued" || result.outcome === "duplicate_same") {
    walWritePending = false;
    if (!inFlightFlush) inFlightFlush = entry;
    return true;
  }
  if (result.outcome === "write_failed") {
    walWritePending = true;
    return false;
  }
  walWritePending = false;
  return false;
}

async function readDurableSnapshot() {
  const snapshot = await durableStore.readSnapshot(observationStartedAt);
  durableSnapshot = snapshot;
  if (snapshot?.observationStart) observationStartedAt = snapshot.observationStart;
  if (snapshot?.legacyUncertainty) legacyUncertainty = snapshot.legacyUncertainty;
  hydrationState = "hydrated";
  return snapshot;
}

async function attemptFlush(entry) {
  try {
    const ack = await durableStore.flush(entry.flushId, entry.delta);
    const removal = fileFallback.removePendingFlush(entry.flushId);
    if (removal.outcome !== "queued") {
      walWritePending = true;
      return false;
    }
    walWritePending = false;
    lastSuccessfulFlush = {
      flushId: entry.flushId,
      status: ack?.status || "applied",
      at: new Date().toISOString(),
    };
    fileFallback.recordSuccessfulFlush(lastSuccessfulFlush);
    if (inFlightFlush?.flushId === entry.flushId) inFlightFlush = null;
    try {
      await readDurableSnapshot();
    } catch {
      hydrationState = "stale";
    }
    return true;
  } catch {
    if (!fileFallback.loadPendingFlushes().some((row) => row.flushId === entry.flushId)) {
      const result = fileFallback.enqueuePendingFlush(entry);
      refreshFallbackDiagnostics();
      if (result.outcome === "write_failed") {
        walWritePending = true;
      }
    }
    if (inFlightFlush?.flushId !== entry.flushId) {
      inFlightFlush = entry;
    }
    return false;
  }
}

async function drainPendingFlushes() {
  if (!durableStore.configured || flushInProgress) return;
  flushInProgress = true;
  try {
    admitPendingDeltaToWal();
    if (!inFlightFlush) {
      const backlog = fileFallback.loadPendingFlushes();
      if (backlog.length > 0) inFlightFlush = backlog[0];
    }
    if (inFlightFlush) {
      await attemptFlush(inFlightFlush);
    }
    for (const entry of fileFallback.loadPendingFlushes()) {
      if (inFlightFlush?.flushId === entry.flushId) continue;
      await attemptFlush(entry);
    }
  } finally {
    flushInProgress = false;
  }
}

function scheduleFlush() {
  void drainPendingFlushes();
}

function legacyUncertaintyForWal(source) {
  return {
    schemaVersion: 1,
    note: source.note,
    startedAt: source.startedAt,
    total: source.total,
    humans: source.humans,
    uniqueHumans: source.uniqueHumans,
    bots: source.bots,
    aiCrawlers: source.aiCrawlers,
    byPath: source.byPath,
    byReferer: source.byReferer,
    byAiBot: source.byAiBot,
    funnel: source.funnel,
  };
}

function loadLegacyFromFileSnapshot(snapshot) {
  legacyUncertainty = {
    schemaVersion: 1,
    note:
      "Request-classification counters captured before MCP surface/protocol split. " +
      "GET /mcp hits were stored as human page views without evidence to relabel them.",
    startedAt: snapshot.startedAt || null,
    total: snapshot.total || 0,
    humans: snapshot.humans || 0,
    uniqueHumans: Array.isArray(snapshot.uniqueHumans) ? snapshot.uniqueHumans.length : 0,
    bots: snapshot.bots || 0,
    aiCrawlers: snapshot.aiCrawlers || 0,
    byPath: { ...(snapshot.byPath || {}) },
    byReferer: { ...(snapshot.byReferer || {}) },
    byAiBot: { ...(snapshot.byAiBot || {}) },
    funnel: { ...emptyFunnel(), ...(snapshot.funnel || {}) },
    recent: Array.isArray(snapshot.recent) ? snapshot.recent.slice(-RECENT_CAP) : [],
    authority: "incomplete_historical_evidence",
  };
}

function sellerRepairDeltaFromSnapshot(snapshot) {
  const repair = {
    briefViews: snapshot.sellerRepair?.briefViews || 0,
    scopeClicks: snapshot.sellerRepair?.scopeClicks || 0,
    checkoutStarts: snapshot.sellerRepair?.checkoutStarts || 0,
    byFinding: Object.create(null),
  };
  for (const findingId of sellerRepairFindingIds) {
    const row = snapshot.sellerRepair?.byFinding?.[findingId];
    if (row?.routeClass !== sellerRepairFindingRouteClasses[findingId]) continue;
    repair.byFinding[findingId] = {
      routeClass: row.routeClass,
      briefViews:
        Number.isSafeInteger(row.briefViews) && row.briefViews >= 0 ? row.briefViews : 0,
      scopeClicks:
        Number.isSafeInteger(row.scopeClicks) && row.scopeClicks >= 0 ? row.scopeClicks : 0,
      checkoutStarts:
        Number.isSafeInteger(row.checkoutStarts) && row.checkoutStarts >= 0
          ? row.checkoutStarts
          : 0,
    };
  }
  const delta = emptyDelta();
  delta.sellerRepair = repair;
  return delta;
}

function migrateLegacySnapshotFileOnce() {
  try {
    const walLegacy = fileFallback.getLegacyUncertainty();
    if (walLegacy) legacyUncertainty = walLegacy;
    const walStartedAt = fileFallback.getObservationStartedAt();
    if (walStartedAt) observationStartedAt = walStartedAt;

    let source = PULSE_FILE;
    if (!fs.existsSync(source) && source !== LEGACY_PULSE_FILE && fs.existsSync(LEGACY_PULSE_FILE)) {
      source = LEGACY_PULSE_FILE;
      pulseStorage.migratedLegacySnapshot = true;
    }
    if (!fs.existsSync(source)) return;

    const raw = fs.readFileSync(source, "utf8");
    const digest = migrationDigest(raw);
    if (fileFallback.getMigratedSnapshotDigest() === digest) return;

    let snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      fileFallback.markSnapshotCorrupt();
      refreshFallbackDiagnostics();
      return;
    }

    const loadedSchemaVersion = snapshot.classificationSchemaVersion || 1;
    if (loadedSchemaVersion > CLASSIFICATION_SCHEMA_VERSION) {
      fileFallback.markSnapshotCorrupt();
      refreshFallbackDiagnostics();
      return;
    }

    if (loadedSchemaVersion < CLASSIFICATION_SCHEMA_VERSION) {
      pendingDelta = emptyDelta();
      assertSnapshotMigrationKeys(snapshot, 1);
      validateLegacyFingerprintArray(snapshot.uniqueHumans);
      loadLegacyFromFileSnapshot(snapshot);
      const repairDelta = sellerRepairDeltaFromSnapshot(snapshot);
      if (!fileFallback.persistLocalMetadata({
        legacyUncertainty: legacyUncertaintyForWal(legacyUncertainty),
        observationStartedAt: processStartedAt,
      })) {
        walWritePending = true;
        refreshFallbackDiagnostics();
        return;
      }
      if (!enqueueMigrationDelta(repairDelta)) return;
      if (!fileFallback.markSnapshotMigrated(digest)) {
        refreshFallbackDiagnostics();
        return;
      }
      observationStartedAt = processStartedAt;
      return;
    }

    let migrationDelta;
    try {
      assertSnapshotMigrationKeys(snapshot, 2);
      migrationDelta = deltaFromV2Snapshot(snapshot);
    } catch {
      fileFallback.markSnapshotCorrupt();
      refreshFallbackDiagnostics();
      return;
    }
    if (snapshot.legacyUncertainty) legacyUncertainty = snapshot.legacyUncertainty;
    if (snapshot.startedAt) observationStartedAt = snapshot.startedAt;
    if (!fileFallback.persistLocalMetadata({
      legacyUncertainty: legacyUncertainty
        ? legacyUncertaintyForWal(legacyUncertainty)
        : null,
      observationStartedAt,
    })) {
      walWritePending = true;
      refreshFallbackDiagnostics();
      return;
    }
    if (!enqueueMigrationDelta(migrationDelta)) return;
    if (!fileFallback.markSnapshotMigrated(digest)) {
      refreshFallbackDiagnostics();
      return;
    }
    localProcess.recent = Array.isArray(snapshot.recent) ? snapshot.recent.slice(-RECENT_CAP) : [];
  } catch {
    fileFallback.markSnapshotCorrupt();
    refreshFallbackDiagnostics();
  }
}

function loadWalStateOnStartup() {
  migrateLegacySnapshotFileOnce();
  refreshFallbackDiagnostics();
  const walLegacy = fileFallback.getLegacyUncertainty();
  if (walLegacy) legacyUncertainty = walLegacy;
  const walStartedAt = fileFallback.getObservationStartedAt();
  if (walStartedAt) observationStartedAt = walStartedAt;
  for (const entry of fileFallback.loadPendingFlushes()) {
    inFlightFlush = entry;
    break;
  }
}

async function importLegacyIfNeeded() {
  if (!legacyUncertainty || fileFallback.isLegacyImported() || !durableStore.configured) return;
  try {
    await durableStore.importLegacyObservation(LEGACY_IMPORT_KEY, {
      schemaVersion: 1,
      note: legacyUncertainty.note,
      startedAt: legacyUncertainty.startedAt,
      total: legacyUncertainty.total,
      humans: legacyUncertainty.humans,
      uniqueHumans: legacyUncertainty.uniqueHumans,
      bots: legacyUncertainty.bots,
      aiCrawlers: legacyUncertainty.aiCrawlers,
      byPath: legacyUncertainty.byPath,
      byReferer: legacyUncertainty.byReferer,
      byAiBot: legacyUncertainty.byAiBot,
      funnel: legacyUncertainty.funnel,
    });
    fileFallback.markLegacyImported();
  } catch {
    /* retry on next hydration */
  }
}

async function hydrateFromDurableStore() {
  if (!durableStore.configured) {
    hydrationState = "fallback";
    return;
  }
  try {
    await readDurableSnapshot();
    await importLegacyIfNeeded();
    const backlog = fileFallback.loadPendingFlushes();
    if (backlog.length > 0 && !inFlightFlush) {
      inFlightFlush = backlog[0];
    }
    await drainPendingFlushes();
  } catch {
    hydrationState = "fallback";
  }
}

let hydrationPromise = null;
export function waitForPulseHydration() {
  if (!hydrationPromise) hydrationPromise = hydrateFromDurableStore();
  return hydrationPromise;
}

function maybeRetryHydration() {
  if (!durableStore.configured) return;
  if (hydrationState === "hydrated") return;
  hydrationPromise = hydrateFromDurableStore();
}

loadWalStateOnStartup();
void waitForPulseHydration();
setInterval(() => {
  admitPendingDeltaToWal();
  scheduleFlush();
  maybeRetryHydration();
}, 15000).unref();
process.on("SIGTERM", () => {
  admitPendingDeltaToWal();
});
process.on("beforeExit", () => {
  admitPendingDeltaToWal();
});

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
  if (!ua) return { kind: "bot", aiBot: null };
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
  localProcess.recent.push(event);
  if (localProcess.recent.length > RECENT_CAP) localProcess.recent.shift();
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
  pendingDelta.total += 1;
  pendingDelta.mcpSurfaceGets += 1;
  pushRecent({
    t: new Date().toISOString(),
    p: MCP_MOUNT_PATH,
    kind: "mcpSurfaceGet",
  });
}

function recordMcpProtocolPost(req) {
  const parsed = parseMcpProtocolBody(req.body);
  if (!parsed.admitted) return;

  pendingDelta.total += 1;
  pendingDelta.mcpProtocolRequests += 1;
  pendingDelta.mcpProtocolMessages += parsed.messages.length;
  for (const { methodClass } of parsed.messages) {
    bump(pendingDelta.mcpProtocolByMethod, methodClass);
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
  pendingDelta.total += 1;

  if (kind === "ai") {
    pendingDelta.aiCrawlers += 1;
    bump(pendingDelta.byAiBot, aiBot);
  } else if (kind === "bot") {
    pendingDelta.bots += 1;
  } else {
    pendingDelta.humans += 1;
    bump(pendingDelta.byPath, p.length > 60 ? p.slice(0, 60) : p);
    bump(pendingDelta.byReferer, ref);
    const ua = headerValue(req, "user-agent");
    const ipRaw = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";
    const fp = crypto.createHash("sha1").update(ipRaw + "|" + ua).digest("hex").slice(0, 16);
    localProcess.uniqueHumans.add(fp);
  }

  if (p === "/") pendingDelta.funnel.home += 1;
  else if (p === "/scan" || p.startsWith("/scan")) pendingDelta.funnel.scan += 1;
  else if (p.startsWith("/tools")) pendingDelta.funnel.tools += 1;
  else if (p.startsWith("/reports")) pendingDelta.funnel.reports += 1;
  else if (p.startsWith("/guides")) pendingDelta.funnel.guides += 1;
  else if (p === "/pricing" || p === "/checkout") pendingDelta.funnel.pricing += 1;

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
    /* never break requests */
  }
  return next();
}

const SELLER_REPAIR_EVENTS = new Set([
  "seller_repair_brief_viewed",
  "seller_repair_scope_clicked",
  "seller_repair_checkout_started",
]);
const FINDING_ID_RE = /^[a-z0-9-]{1,96}$/;

export function recordClientEvent(event, props) {
  if (!SELLER_REPAIR_EVENTS.has(event)) return false;
  const findingId = props?.finding_id;
  const routeClass = props?.route_class;
  if (typeof findingId !== "string" || !FINDING_ID_RE.test(findingId)) return false;
  if (!SELLER_REPAIR_FINDING_IDS.has(findingId)) return false;
  if (routeClass !== sellerRepairFindingRouteClasses[findingId]) return false;

  const row = pendingDelta.sellerRepair.byFinding[findingId] || {
    routeClass,
    briefViews: 0,
    scopeClicks: 0,
    checkoutStarts: 0,
  };
  if (row.routeClass !== routeClass) return false;

  if (event === "seller_repair_brief_viewed") {
    row.briefViews += 1;
    pendingDelta.sellerRepair.briefViews += 1;
  } else if (event === "seller_repair_scope_clicked") {
    row.scopeClicks += 1;
    pendingDelta.sellerRepair.scopeClicks += 1;
  } else {
    row.checkoutStarts += 1;
    pendingDelta.sellerRepair.checkoutStarts += 1;
  }
  pendingDelta.sellerRepair.byFinding[findingId] = row;
  return true;
}

export function flushPulseSnapshot() {
  const ok = admitPendingDeltaToWal();
  scheduleFlush();
  return ok && !fallbackCorrupt && !walWritePending;
}

export function pulseSnapshot() {
  refreshFallbackDiagnostics();
  const counters = operationalCounters();
  const pending = pendingCounters();
  const durable = hydrationState === "hydrated" ? durableSnapshotToCounters(durableSnapshot) : null;
  return {
    startedAt: hydrationState === "hydrated" ? observationStartedAt : processStartedAt,
    processStartedAt,
    now: new Date().toISOString(),
    classificationSchemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    authority: authorityState(),
    complete: isComplete(),
    total: counters.total,
    humans: counters.humans,
    uniqueHumansEstimate: {
      count: localProcess.uniqueHumans.size,
      scope: "current_process_only",
      meaning:
        "Coarse in-process human-ish estimate from this Node process only. " +
        "Not durable, not cross-process unique, and not payment or demand evidence.",
    },
    bots: counters.bots,
    aiCrawlers: counters.aiCrawlers,
    mcpSurfaceGet: {
      requests: counters.mcpSurfaceGets,
      meaning:
        "GET /mcp hits the MCP endpoint setup or purchase-return plain-text surface. " +
        "May be a browser, monitor, registry probe, or client check. " +
        "Not unique agents, buyers, demand, payment, or protocol use.",
    },
    mcpProtocol: {
      httpRequests: counters.mcpProtocol.requests,
      messages: counters.mcpProtocol.messages,
      byMethod: { ...counters.mcpProtocol.byMethod },
      meaning:
        "Shape-valid POST /mcp JSON-RPC HTTP requests only. " +
        "Counts HTTP requests and safe method classes, not params, tools, sessions, or delivery. " +
        "Not unique agents, buyers, demand, or payment.",
    },
    legacyUncertainty,
    funnel: counters.funnel,
    byPath: counters.byPath,
    byReferer: counters.byReferer,
    byAiBot: counters.byAiBot,
    sellerRepair: counters.sellerRepair,
    durable,
    pending,
    knownGap: {
      droppedUnknown,
      fallbackCorrupt,
      snapshotCorrupt,
      walWritePending,
      meaning:
        "Any non-zero dropped count, corrupt local evidence, or unresolved WAL write " +
        "marks admitted-but-unaccounted or unreadable backlog state.",
    },
    lastSuccessfulFlush,
    storage: { ...pulseStorage, hydrationState },
    recent: localProcess.recent.slice(-40).reverse(),
  };
}

export function configurePulseStoreForTests(options = {}) {
  durableStore = options.store || createDefaultPulseStore(options);
  fileFallback = options.fileFallback || createDefaultFileFallback(options.fallbackFile || PULSE_FALLBACK_FILE);
  pulseStorage.durableConfigured = durableStore.configured;
  hydrationState = "pending";
  durableSnapshot = null;
  inFlightFlush = null;
  pendingDelta = emptyDelta();
  localProcess.uniqueHumans = new Set();
  localProcess.recent = [];
  legacyUncertainty = null;
  lastSuccessfulFlush = fileFallback.getLastSuccessfulFlush();
  walWritePending = false;
  refreshFallbackDiagnostics();
  observationStartedAt = processStartedAt;
  hydrationPromise = null;
  if (options.reloadWal !== false) {
    const walLegacy = fileFallback.getLegacyUncertainty();
    if (walLegacy) legacyUncertainty = walLegacy;
    const walStartedAt = fileFallback.getObservationStartedAt();
    if (walStartedAt) observationStartedAt = walStartedAt;
    for (const entry of fileFallback.loadPendingFlushes()) {
      inFlightFlush = entry;
      break;
    }
  }
  if (options.autoHydrate !== false) hydrationPromise = hydrateFromDurableStore();
  return { durableStore, fileFallback, waitForPulseHydration };
}

export function __pulseTestInternals() {
  return {
    pendingDelta,
    inFlightFlush,
    durableSnapshot,
    hydrationState,
    drainPendingFlushes,
    hydrateFromDurableStore,
    maybeRetryHydration,
    admitPendingDeltaToWal,
    walWritePending,
    deltaToRpcPayload,
    loadWalStateOnStartup,
    PULSE_FALLBACK_FILE,
  };
}
