import {
  MAX_PENDING_FLUSHES,
  deltaCanonicalDigest,
  validateDelta,
  validateLegacyObservation,
} from "./schema.js";

export const WAL_VERSION = 2;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WAL_ROOT_KEYS = Object.freeze([
  "version",
  "pendingFlushes",
  "droppedUnknown",
  "lastSuccessfulFlush",
  "legacyImported",
  "legacyUncertainty",
  "observationStartedAt",
  "migratedSnapshotDigest",
  "snapshotCorrupt",
]);

const V1_SNAPSHOT_KEYS = Object.freeze([
  "startedAt",
  "total",
  "humans",
  "uniqueHumans",
  "bots",
  "aiCrawlers",
  "byPath",
  "byReferer",
  "byAiBot",
  "funnel",
  "recent",
  "sellerRepair",
  "classificationSchemaVersion",
  "legacyUncertainty",
  "mcpSurfaceGets",
  "mcpProtocol",
  "mcpToolCallsByName",
  "authority",
  "complete",
]);

const V2_SNAPSHOT_KEYS = Object.freeze([
  "startedAt",
  "classificationSchemaVersion",
  "legacyUncertainty",
  "total",
  "humans",
  "uniqueHumans",
  "bots",
  "aiCrawlers",
  "mcpSurfaceGets",
  "mcpProtocol",
  "sellerRepair",
  "byPath",
  "byReferer",
  "byAiBot",
  "funnel",
  "recent",
  "authority",
  "complete",
]);

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isNonNegSafeInt(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isHexDigest(value, len) {
  return typeof value === "string" && value.length === len && /^[0-9a-f]+$/i.test(value);
}

export function validateLegacyFingerprintArray(value, field = "uniqueHumans") {
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error(`pulse_invalid_snapshot:${field}`);
  if (value.length > 10_000) throw new Error(`pulse_invalid_snapshot:${field}`);
  for (const item of value) {
    if (typeof item !== "string" || !item || item.length > 64) {
      throw new Error(`pulse_invalid_snapshot:${field}`);
    }
  }
}

function validateLastSuccessfulFlush(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
  }
  const keys = Object.keys(value);
  if (keys.length > 4) throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
  for (const key of keys) {
    if (!["flushId", "status", "at"].includes(key)) {
      throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
    }
  }
  if (!UUID_RE.test(value.flushId)) throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
  if (typeof value.status !== "string" || value.status.length > 64) {
    throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
  }
  if (!isIsoTimestamp(value.at)) throw new Error("pulse_wal_invalid:lastSuccessfulFlush");
  return {
    flushId: value.flushId,
    status: value.status,
    at: value.at,
  };
}

export function validateWalFlushEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("pulse_wal_invalid:flush_entry");
  }
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !keys.includes("flushId") || !keys.includes("delta") || !keys.includes("createdAt")) {
    throw new Error("pulse_wal_invalid:flush_entry");
  }
  if (!UUID_RE.test(raw.flushId)) throw new Error("pulse_wal_invalid:flush_id");
  if (!isIsoTimestamp(raw.createdAt)) throw new Error("pulse_wal_invalid:flush_created_at");
  const delta = validateDelta(raw.delta);
  return {
    flushId: raw.flushId,
    delta,
    createdAt: raw.createdAt,
    canonical: deltaCanonicalDigest(delta),
  };
}

export function validateWalState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("pulse_wal_corrupt");
  }
  const rootKeys = Object.keys(raw);
  if (raw.version !== WAL_VERSION) throw new Error("pulse_wal_corrupt");
  for (const key of rootKeys) {
    if (!WAL_ROOT_KEYS.includes(key)) throw new Error("pulse_wal_corrupt");
  }
  if (!Array.isArray(raw.pendingFlushes)) throw new Error("pulse_wal_corrupt");
  if (raw.pendingFlushes.length > MAX_PENDING_FLUSHES) throw new Error("pulse_wal_corrupt");
  if (!isNonNegSafeInt(raw.droppedUnknown ?? 0)) throw new Error("pulse_wal_corrupt");

  const pendingFlushes = [];
  const seenIds = new Map();
  for (const entry of raw.pendingFlushes) {
    const normalized = validateWalFlushEntry(entry);
    const prior = seenIds.get(normalized.flushId);
    if (prior && prior !== normalized.canonical) {
      throw new Error("pulse_wal_flush_id_conflict");
    }
    if (prior === normalized.canonical) continue;
    seenIds.set(normalized.flushId, normalized.canonical);
    pendingFlushes.push({
      flushId: normalized.flushId,
      delta: normalized.delta,
      createdAt: normalized.createdAt,
    });
  }

  let legacyUncertainty = null;
  if (raw.legacyUncertainty != null) {
    if (typeof raw.legacyUncertainty !== "object" || Array.isArray(raw.legacyUncertainty)) {
      throw new Error("pulse_wal_corrupt");
    }
    legacyUncertainty = validateLegacyObservation({
      schemaVersion: 1,
      note: raw.legacyUncertainty.note,
      startedAt: raw.legacyUncertainty.startedAt,
      total: raw.legacyUncertainty.total,
      humans: raw.legacyUncertainty.humans,
      uniqueHumans: raw.legacyUncertainty.uniqueHumans,
      bots: raw.legacyUncertainty.bots,
      aiCrawlers: raw.legacyUncertainty.aiCrawlers,
      byPath: raw.legacyUncertainty.byPath,
      byReferer: raw.legacyUncertainty.byReferer,
      byAiBot: raw.legacyUncertainty.byAiBot,
      funnel: raw.legacyUncertainty.funnel,
    });
  }

  if (raw.observationStartedAt != null && !isIsoTimestamp(raw.observationStartedAt)) {
    throw new Error("pulse_wal_corrupt");
  }
  if (raw.migratedSnapshotDigest != null && !isHexDigest(raw.migratedSnapshotDigest, 64)) {
    throw new Error("pulse_wal_corrupt");
  }
  if (raw.legacyImported != null && typeof raw.legacyImported !== "boolean") {
    throw new Error("pulse_wal_corrupt");
  }
  if (raw.snapshotCorrupt != null && typeof raw.snapshotCorrupt !== "boolean") {
    throw new Error("pulse_wal_corrupt");
  }

  return {
    version: WAL_VERSION,
    pendingFlushes,
    droppedUnknown: raw.droppedUnknown ?? 0,
    lastSuccessfulFlush: validateLastSuccessfulFlush(raw.lastSuccessfulFlush),
    legacyImported: raw.legacyImported ?? false,
    legacyUncertainty,
    observationStartedAt: raw.observationStartedAt ?? null,
    migratedSnapshotDigest: raw.migratedSnapshotDigest ?? null,
    snapshotCorrupt: raw.snapshotCorrupt ?? false,
  };
}

export function defaultWalState() {
  return {
    version: WAL_VERSION,
    pendingFlushes: [],
    droppedUnknown: 0,
    lastSuccessfulFlush: null,
    legacyImported: false,
    legacyUncertainty: null,
    observationStartedAt: null,
    migratedSnapshotDigest: null,
    snapshotCorrupt: false,
  };
}

export function assertSnapshotMigrationKeys(snapshot, schemaVersion) {
  const allowed = schemaVersion >= 2 ? V2_SNAPSHOT_KEYS : V1_SNAPSHOT_KEYS;
  for (const key of Object.keys(snapshot)) {
    if (!allowed.includes(key)) throw new Error("pulse_invalid_snapshot");
  }
}
