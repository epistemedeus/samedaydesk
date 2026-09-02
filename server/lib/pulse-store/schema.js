import crypto from "node:crypto";
import { MCP_TOOL_NAMES, MCP_TOOL_NAME_MAX_LEN } from "../mcp-tool-inventory.js";

export const CLASSIFICATION_SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;
export const LEGACY_IMPORT_KEY = "pr9_v1_migration";

export const FUNNEL_KEYS = Object.freeze([
  "home",
  "scan",
  "tools",
  "reports",
  "guides",
  "pricing",
]);

export const MCP_METHOD_KEYS = Object.freeze([
  "initialize",
  "tools/list",
  "tools/call",
  "notifications",
  "other",
]);

export const MAX_MAP_KEYS = 200;
export const MAX_AI_BOT_KEYS = 64;
export const MAX_PATH_KEY_LEN = 60;
export const MAX_REFERER_KEY_LEN = 96;
export const MAX_AI_BOT_KEY_LEN = 64;
export const MAX_SELLER_FINDINGS = 32;
export const MAX_FINDING_ID_LEN = 96;
export const MAX_PENDING_FLUSHES = 48;

export const DELTA_ALLOWED_KEYS = Object.freeze([
  "schemaVersion",
  "total",
  "humans",
  "bots",
  "aiCrawlers",
  "mcpSurfaceGets",
  "mcpProtocolRequests",
  "mcpProtocolMessages",
  "mcpProtocolByMethod",
  "mcpToolCallsObservedFrom",
  "mcpToolCallsByName",
  "byPath",
  "byReferer",
  "byAiBot",
  "funnel",
  "sellerRepair",
]);

export const LEGACY_OBSERVATION_ALLOWED_KEYS = Object.freeze([
  "schemaVersion",
  "note",
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
]);

export function emptyCounterMap(keys) {
  const out = Object.create(null);
  for (const key of keys) out[key] = 0;
  return out;
}

export function emptyMcpProtocolByMethod() {
  return emptyCounterMap(MCP_METHOD_KEYS);
}

export function emptyFunnel() {
  return emptyCounterMap(FUNNEL_KEYS);
}

export function emptySellerRepairDelta() {
  return {
    briefViews: 0,
    scopeClicks: 0,
    checkoutStarts: 0,
    byFinding: Object.create(null),
  };
}

export function emptyDelta(mcpToolCallsObservedFrom = new Date().toISOString()) {
  return {
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    total: 0,
    humans: 0,
    bots: 0,
    aiCrawlers: 0,
    mcpSurfaceGets: 0,
    mcpProtocolRequests: 0,
    mcpProtocolMessages: 0,
    mcpProtocolByMethod: emptyMcpProtocolByMethod(),
    mcpToolCallsObservedFrom,
    mcpToolCallsByName: Object.create(null),
    byPath: Object.create(null),
    byReferer: Object.create(null),
    byAiBot: Object.create(null),
    funnel: emptyFunnel(),
    sellerRepair: emptySellerRepairDelta(),
  };
}

export function isNonNegSafeInt(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateCounterMap(
  map,
  field,
  {
    allowedKeys = null,
    maxKeys = MAX_MAP_KEYS,
    maxKeyLen = MAX_REFERER_KEY_LEN,
  } = {},
) {
  if (map == null) return Object.create(null);
  if (typeof map !== "object" || Array.isArray(map)) {
    throw new Error(`pulse_invalid_field:${field}`);
  }
  const keys = Object.keys(map);
  if (keys.length > maxKeys) throw new Error(`pulse_invalid_field:${field}`);
  const out = Object.create(null);
  for (const key of keys) {
    if (!key || key.length > maxKeyLen) throw new Error(`pulse_invalid_field:${field}`);
    if (allowedKeys && !allowedKeys.includes(key)) {
      throw new Error(`pulse_invalid_field:${field}`);
    }
    const value = map[key];
    if (!isNonNegSafeInt(value)) throw new Error(`pulse_invalid_field:${field}`);
    out[key] = value;
  }
  return out;
}

export function validateSellerRepairDelta(sellerRepair) {
  if (sellerRepair == null) return emptySellerRepairDelta();
  if (typeof sellerRepair !== "object" || Array.isArray(sellerRepair)) {
    throw new Error("pulse_invalid_field:sellerRepair");
  }
  const out = emptySellerRepairDelta();
  for (const field of ["briefViews", "scopeClicks", "checkoutStarts"]) {
    const value = sellerRepair[field] ?? 0;
    if (!isNonNegSafeInt(value)) throw new Error(`pulse_invalid_field:sellerRepair.${field}`);
    out[field] = value;
  }
  const byFinding = sellerRepair.byFinding;
  if (byFinding != null) {
    if (typeof byFinding !== "object" || Array.isArray(byFinding)) {
      throw new Error("pulse_invalid_field:sellerRepair.byFinding");
    }
    const findingKeys = Object.keys(byFinding);
    if (findingKeys.length > MAX_SELLER_FINDINGS) {
      throw new Error("pulse_invalid_field:sellerRepair.byFinding");
    }
    for (const findingId of findingKeys) {
      if (
        !findingId ||
        findingId.length > MAX_FINDING_ID_LEN ||
        !/^[a-z0-9-]+$/.test(findingId)
      ) {
        throw new Error("pulse_invalid_field:sellerRepair.byFinding");
      }
      const row = byFinding[findingId];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error("pulse_invalid_field:sellerRepair.byFinding");
      }
      const routeClass = row.routeClass;
      if (routeClass !== "paid_get" && routeClass !== "paid_post") {
        throw new Error("pulse_invalid_field:sellerRepair.byFinding.routeClass");
      }
      const normalized = {
        routeClass,
        briefViews: 0,
        scopeClicks: 0,
        checkoutStarts: 0,
      };
      for (const metric of ["briefViews", "scopeClicks", "checkoutStarts"]) {
        const metricValue = row[metric] ?? 0;
        if (!isNonNegSafeInt(metricValue)) {
          throw new Error(`pulse_invalid_field:sellerRepair.byFinding.${metric}`);
        }
        normalized[metric] = metricValue;
      }
      out.byFinding[findingId] = normalized;
    }
  }
  return out;
}

export function validateDelta(delta) {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
    throw new Error("pulse_invalid_delta");
  }
  for (const key of Object.keys(delta)) {
    if (!DELTA_ALLOWED_KEYS.includes(key)) throw new Error("pulse_invalid_delta");
  }
  if (delta.schemaVersion !== CLASSIFICATION_SCHEMA_VERSION) {
    throw new Error("pulse_invalid_schema_version");
  }
  const out = emptyDelta();
  for (const field of [
    "total",
    "humans",
    "bots",
    "aiCrawlers",
    "mcpSurfaceGets",
    "mcpProtocolRequests",
    "mcpProtocolMessages",
  ]) {
    const value = delta[field] ?? 0;
    if (!isNonNegSafeInt(value)) throw new Error(`pulse_invalid_field:${field}`);
    out[field] = value;
  }
  out.mcpProtocolByMethod = validateCounterMap(delta.mcpProtocolByMethod, "mcpProtocolByMethod", {
    allowedKeys: MCP_METHOD_KEYS,
    maxKeys: MCP_METHOD_KEYS.length,
    maxKeyLen: 32,
  });
  if (
    typeof delta.mcpToolCallsObservedFrom !== "string" ||
    delta.mcpToolCallsObservedFrom.length > 64 ||
    !Number.isFinite(Date.parse(delta.mcpToolCallsObservedFrom))
  ) {
    throw new Error("pulse_invalid_delta:mcpToolCallsObservedFrom");
  }
  out.mcpToolCallsObservedFrom = delta.mcpToolCallsObservedFrom;
  out.mcpToolCallsByName = validateCounterMap(delta.mcpToolCallsByName, "mcpToolCallsByName", {
    allowedKeys: MCP_TOOL_NAMES,
    maxKeys: MCP_TOOL_NAMES.length,
    maxKeyLen: MCP_TOOL_NAME_MAX_LEN,
  });
  for (const key of MCP_METHOD_KEYS) {
    out.mcpProtocolByMethod[key] = out.mcpProtocolByMethod[key] ?? 0;
  }
  out.byPath = validateCounterMap(delta.byPath, "byPath", { maxKeyLen: MAX_PATH_KEY_LEN });
  out.byReferer = validateCounterMap(delta.byReferer, "byReferer", {
    maxKeyLen: MAX_REFERER_KEY_LEN,
  });
  out.byAiBot = validateCounterMap(delta.byAiBot, "byAiBot", {
    maxKeys: MAX_AI_BOT_KEYS,
    maxKeyLen: MAX_AI_BOT_KEY_LEN,
  });
  out.funnel = validateCounterMap(delta.funnel, "funnel", {
    allowedKeys: FUNNEL_KEYS,
    maxKeys: FUNNEL_KEYS.length,
    maxKeyLen: 16,
  });
  for (const key of FUNNEL_KEYS) out.funnel[key] = out.funnel[key] ?? 0;
  out.sellerRepair = validateSellerRepairDelta(delta.sellerRepair);
  return out;
}

export function legacyObservationHash(observation) {
  return crypto.createHash("md5").update(JSON.stringify(observation)).digest("hex");
}

export function stableFlushIdFromDelta(delta) {
  const payload = deltaToRpcPayload(validateDelta(delta));
  const digest = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

export function deltaCanonicalDigest(delta) {
  const payload = deltaToRpcPayload(validateDelta(delta));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function migrationDigest(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const V2_SNAPSHOT_ALLOWED_KEYS = Object.freeze([
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
  "mcpToolCallsObservedFrom",
  "mcpToolCallsByName",
  "sellerRepair",
  "byPath",
  "byReferer",
  "byAiBot",
  "funnel",
  "recent",
  "authority",
  "complete",
]);

function validateLegacyFingerprintArray(value, field = "uniqueHumans") {
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error(`pulse_invalid_snapshot:${field}`);
  if (value.length > 10_000) throw new Error(`pulse_invalid_snapshot:${field}`);
  for (const item of value) {
    if (typeof item !== "string" || !item || item.length > 64) {
      throw new Error(`pulse_invalid_snapshot:${field}`);
    }
  }
}

export function deltaFromV2Snapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("pulse_invalid_snapshot");
  }
  for (const key of Object.keys(snapshot)) {
    if (!V2_SNAPSHOT_ALLOWED_KEYS.includes(key)) throw new Error("pulse_invalid_snapshot");
  }
  if (snapshot.classificationSchemaVersion !== CLASSIFICATION_SCHEMA_VERSION) {
    throw new Error("pulse_invalid_snapshot_schema");
  }
  validateLegacyFingerprintArray(snapshot.uniqueHumans);
  const delta = emptyDelta();
  for (const field of [
    "total",
    "humans",
    "bots",
    "aiCrawlers",
    "mcpSurfaceGets",
  ]) {
    const value = snapshot[field] ?? 0;
    if (!isNonNegSafeInt(value)) throw new Error(`pulse_invalid_snapshot:${field}`);
    delta[field] = value;
  }
  const mcpProtocol = snapshot.mcpProtocol;
  if (mcpProtocol != null) {
    if (typeof mcpProtocol !== "object" || Array.isArray(mcpProtocol)) {
      throw new Error("pulse_invalid_snapshot:mcpProtocol");
    }
    delta.mcpProtocolRequests = mcpProtocol.requests ?? 0;
    delta.mcpProtocolMessages = mcpProtocol.messages ?? 0;
    if (!isNonNegSafeInt(delta.mcpProtocolRequests) || !isNonNegSafeInt(delta.mcpProtocolMessages)) {
      throw new Error("pulse_invalid_snapshot:mcpProtocol");
    }
    delta.mcpProtocolByMethod = validateCounterMap(mcpProtocol.byMethod, "mcpProtocol.byMethod", {
      allowedKeys: MCP_METHOD_KEYS,
      maxKeys: MCP_METHOD_KEYS.length,
      maxKeyLen: 32,
    });
  }
  if (snapshot.mcpToolCallsObservedFrom == null) {
    if (Object.keys(snapshot.mcpToolCallsByName || {}).length > 0) {
      throw new Error("pulse_invalid_snapshot:mcpToolCallsObservedFrom");
    }
    delta.mcpToolCallsObservedFrom = new Date().toISOString();
  } else {
    if (
      typeof snapshot.mcpToolCallsObservedFrom !== "string" ||
      snapshot.mcpToolCallsObservedFrom.length > 64 ||
      !Number.isFinite(Date.parse(snapshot.mcpToolCallsObservedFrom))
    ) {
      throw new Error("pulse_invalid_snapshot:mcpToolCallsObservedFrom");
    }
    delta.mcpToolCallsObservedFrom = snapshot.mcpToolCallsObservedFrom;
  }
  delta.mcpToolCallsByName = validateCounterMap(snapshot.mcpToolCallsByName, "mcpToolCallsByName", {
    allowedKeys: MCP_TOOL_NAMES,
    maxKeys: MCP_TOOL_NAMES.length,
    maxKeyLen: MCP_TOOL_NAME_MAX_LEN,
  });
  delta.byPath = validateCounterMap(snapshot.byPath, "byPath", { maxKeyLen: MAX_PATH_KEY_LEN });
  delta.byReferer = validateCounterMap(snapshot.byReferer, "byReferer", {
    maxKeyLen: MAX_REFERER_KEY_LEN,
  });
  delta.byAiBot = validateCounterMap(snapshot.byAiBot, "byAiBot", {
    maxKeys: MAX_AI_BOT_KEYS,
    maxKeyLen: MAX_AI_BOT_KEY_LEN,
  });
  delta.funnel = validateCounterMap(snapshot.funnel, "funnel", {
    allowedKeys: FUNNEL_KEYS,
    maxKeys: FUNNEL_KEYS.length,
    maxKeyLen: 16,
  });
  for (const key of FUNNEL_KEYS) delta.funnel[key] = delta.funnel[key] ?? 0;
  delta.sellerRepair = validateSellerRepairDelta(snapshot.sellerRepair);
  return validateDelta(delta);
}

export function validateLegacyObservation(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    throw new Error("pulse_invalid_legacy_observation");
  }
  for (const key of Object.keys(observation)) {
    if (!LEGACY_OBSERVATION_ALLOWED_KEYS.includes(key)) {
      throw new Error("pulse_invalid_legacy_observation");
    }
  }
  if (observation.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    throw new Error("pulse_invalid_legacy_schema_version");
  }
  const note = observation.note;
  if (note != null && (typeof note !== "string" || note.length > 512)) {
    throw new Error("pulse_invalid_legacy_observation");
  }
  const out = {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    note:
      note ||
      "Incomplete historical request-classification evidence. Not a complete traffic total.",
    startedAt: observation.startedAt ?? null,
    total: 0,
    humans: 0,
    uniqueHumans: 0,
    bots: 0,
    aiCrawlers: 0,
    byPath: Object.create(null),
    byReferer: Object.create(null),
    byAiBot: Object.create(null),
    funnel: emptyFunnel(),
  };
  for (const field of ["total", "humans", "uniqueHumans", "bots", "aiCrawlers"]) {
    const value = observation[field] ?? 0;
    if (!isNonNegSafeInt(value)) throw new Error(`pulse_invalid_field:${field}`);
    out[field] = value;
  }
  out.byPath = validateCounterMap(observation.byPath, "byPath", { maxKeyLen: MAX_PATH_KEY_LEN });
  out.byReferer = validateCounterMap(observation.byReferer, "byReferer", {
    maxKeyLen: MAX_REFERER_KEY_LEN,
  });
  out.byAiBot = validateCounterMap(observation.byAiBot, "byAiBot", {
    maxKeys: MAX_AI_BOT_KEYS,
    maxKeyLen: MAX_AI_BOT_KEY_LEN,
  });
  out.funnel = validateCounterMap(observation.funnel, "funnel", {
    allowedKeys: FUNNEL_KEYS,
    maxKeys: FUNNEL_KEYS.length,
    maxKeyLen: 16,
  });
  for (const key of FUNNEL_KEYS) out.funnel[key] = out.funnel[key] ?? 0;
  return out;
}

export function deltaIsEmpty(delta) {
  if (delta.total !== 0) return false;
  if (delta.humans !== 0 || delta.bots !== 0 || delta.aiCrawlers !== 0) return false;
  if (delta.mcpSurfaceGets !== 0 || delta.mcpProtocolRequests !== 0) return false;
  if (delta.mcpProtocolMessages !== 0) return false;
  for (const key of MCP_METHOD_KEYS) {
    if ((delta.mcpProtocolByMethod[key] || 0) !== 0) return false;
  }
  if (Object.keys(delta.mcpToolCallsByName).length > 0) return false;
  for (const map of [delta.byPath, delta.byReferer, delta.byAiBot]) {
    if (Object.keys(map).length > 0) return false;
  }
  for (const key of FUNNEL_KEYS) {
    if ((delta.funnel[key] || 0) !== 0) return false;
  }
  const sr = delta.sellerRepair;
  if (sr.briefViews || sr.scopeClicks || sr.checkoutStarts) return false;
  if (Object.keys(sr.byFinding).length > 0) return false;
  return true;
}

export function bumpCounterMap(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

export function mergeCounterMaps(base, add) {
  const out = { ...base };
  if (!add) return out;
  for (const [key, value] of Object.entries(add)) {
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

export function mergeSellerRepair(base, add) {
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

export function mergeDeltas(into, from) {
  into.total += from.total;
  into.humans += from.humans;
  into.bots += from.bots;
  into.aiCrawlers += from.aiCrawlers;
  into.mcpSurfaceGets += from.mcpSurfaceGets;
  into.mcpProtocolRequests += from.mcpProtocolRequests;
  into.mcpProtocolMessages += from.mcpProtocolMessages;
  into.mcpProtocolByMethod = mergeCounterMaps(into.mcpProtocolByMethod, from.mcpProtocolByMethod);
  into.mcpToolCallsObservedFrom =
    Date.parse(into.mcpToolCallsObservedFrom) <= Date.parse(from.mcpToolCallsObservedFrom)
      ? into.mcpToolCallsObservedFrom
      : from.mcpToolCallsObservedFrom;
  into.mcpToolCallsByName = mergeCounterMaps(into.mcpToolCallsByName, from.mcpToolCallsByName);
  into.byPath = mergeCounterMaps(into.byPath, from.byPath);
  into.byReferer = mergeCounterMaps(into.byReferer, from.byReferer);
  into.byAiBot = mergeCounterMaps(into.byAiBot, from.byAiBot);
  into.funnel = mergeCounterMaps(into.funnel, from.funnel);
  into.sellerRepair = mergeSellerRepair(into.sellerRepair, from.sellerRepair);
}

export function snapshotCountersFromDelta(delta) {
  return {
    total: delta.total,
    humans: delta.humans,
    bots: delta.bots,
    aiCrawlers: delta.aiCrawlers,
    mcpSurfaceGets: delta.mcpSurfaceGets,
    mcpProtocol: {
      requests: delta.mcpProtocolRequests,
      messages: delta.mcpProtocolMessages,
      byMethod: { ...delta.mcpProtocolByMethod },
    },
    mcpToolCallsByName: { ...delta.mcpToolCallsByName },
    byPath: { ...delta.byPath },
    byReferer: { ...delta.byReferer },
    byAiBot: { ...delta.byAiBot },
    funnel: { ...delta.funnel },
    sellerRepair: structuredClone(delta.sellerRepair),
  };
}

export function emptySnapshotCounters() {
  return {
    total: 0,
    humans: 0,
    bots: 0,
    aiCrawlers: 0,
    mcpSurfaceGets: 0,
    mcpProtocol: {
      requests: 0,
      messages: 0,
      byMethod: emptyMcpProtocolByMethod(),
    },
    mcpToolCallsByName: Object.create(null),
    byPath: Object.create(null),
    byReferer: Object.create(null),
    byAiBot: Object.create(null),
    funnel: emptyFunnel(),
    sellerRepair: emptySellerRepairDelta(),
  };
}

export function durableSnapshotToCounters(snapshot) {
  const out = emptySnapshotCounters();
  if (!snapshot) return out;
  out.total = snapshot.total || 0;
  out.humans = snapshot.humans || 0;
  out.bots = snapshot.bots || 0;
  out.aiCrawlers = snapshot.aiCrawlers || 0;
  out.mcpSurfaceGets = snapshot.mcpSurfaceGets || 0;
  out.mcpProtocol.requests = snapshot.mcpProtocolRequests || 0;
  out.mcpProtocol.messages = snapshot.mcpProtocolMessages || 0;
  out.mcpProtocol.byMethod = mergeCounterMaps(
    out.mcpProtocol.byMethod,
    snapshot.mcpProtocolByMethod,
  );
  out.mcpToolCallsByName = mergeCounterMaps(out.mcpToolCallsByName, snapshot.mcpToolCallsByName);
  out.byPath = mergeCounterMaps(out.byPath, snapshot.byPath);
  out.byReferer = mergeCounterMaps(out.byReferer, snapshot.byReferer);
  out.byAiBot = mergeCounterMaps(out.byAiBot, snapshot.byAiBot);
  out.funnel = mergeCounterMaps(out.funnel, snapshot.funnel);
  out.sellerRepair = mergeSellerRepair(out.sellerRepair, snapshot.sellerRepair);
  return out;
}

export function deltaToRpcPayload(delta) {
  return {
    schemaVersion: delta.schemaVersion,
    total: delta.total,
    humans: delta.humans,
    bots: delta.bots,
    aiCrawlers: delta.aiCrawlers,
    mcpSurfaceGets: delta.mcpSurfaceGets,
    mcpProtocolRequests: delta.mcpProtocolRequests,
    mcpProtocolMessages: delta.mcpProtocolMessages,
    mcpProtocolByMethod: { ...delta.mcpProtocolByMethod },
    mcpToolCallsObservedFrom: delta.mcpToolCallsObservedFrom,
    mcpToolCallsByName: { ...delta.mcpToolCallsByName },
    byPath: { ...delta.byPath },
    byReferer: { ...delta.byReferer },
    byAiBot: { ...delta.byAiBot },
    funnel: { ...delta.funnel },
    sellerRepair: {
      briefViews: delta.sellerRepair.briefViews,
      scopeClicks: delta.sellerRepair.scopeClicks,
      checkoutStarts: delta.sellerRepair.checkoutStarts,
      byFinding: { ...delta.sellerRepair.byFinding },
    },
  };
}

export function containsRawRequestData(value, depth = 0) {
  if (depth > 6 || value == null) return false;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return (
      lower.includes("user-agent") ||
      lower.includes("x-forwarded-for") ||
      lower.includes("authorization") ||
      lower.includes("referer:") ||
      lower.includes("mcp-session-id") ||
      lower.includes("stripe-signature")
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsRawRequestData(entry, depth + 1));
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const blocked = [
        "ip",
        "ua",
        "userAgent",
        "referer",
        "headers",
        "body",
        "params",
        "sessionId",
        "toolName",
        "credentials",
        "uniqueHumans",
      ];
      if (blocked.includes(key)) return true;
      if (containsRawRequestData(entry, depth + 1)) return true;
    }
  }
  return false;
}
