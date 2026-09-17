import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = here;
export const ROOT = join(here, "../../..");
export const PINS_PATH = join(here, "pins.json");
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

export const SCHEMA = "samedaydesk.ops.quota-probe.v1";
export const PINS_SCHEMA = "samedaydesk.ops.quota-probe.pins.v1";
export const PROVIDERS = Object.freeze([
  "samedaydesk",
  "github",
  "resend",
  "supabase",
  "hostinger",
]);
export const AUTHORITY_CLASSES = Object.freeze([
  "seller_observed",
  "provider_returned",
  "independently_reconciled",
  "provider_authoritative",
]);
export const WINDOW_KINDS = Object.freeze(["declared_cap", "rate_limit", "rate_limited"]);
export const HTTP_METHODS = Object.freeze(["GET", "HEAD"]);
export const MCP_RPC_ALLOWED = Object.freeze(["initialize", "ping", "tools/list", "notifications/initialized"]);
export const DECISIONS = Object.freeze({
  OBSERVED: "observed",
  INVALID_INPUT: "invalid-input",
});
export const SEEDED_FAILURES = Object.freeze({
  "consume-quota-tools-call": {
    file: "consume-quota-tools-call.json",
    code: "consume_quota_refused",
    message: "seeded consume-quota-tools-call caught: tools/call is not a quota remaining reading",
  },
  "http-429-as-headroom": {
    file: "http-429-as-headroom.json",
    code: "http_429_is_not_headroom",
    message: "seeded http-429-as-headroom caught: HTTP 429 is rate_limited, not remaining capacity",
  },
  "http-402-as-remaining": {
    file: "http-402-as-remaining.json",
    code: "http_402_is_not_remaining",
    message: "seeded http-402-as-remaining caught: HTTP 402 is not remaining quota",
  },
  "money-movement": {
    file: "money-movement.json",
    code: "money_movement_refused",
    message: "seeded money-movement caught: checkout intent is refused",
  },
});

const ROOT_KEYS = Object.freeze(["schemaVersion", "mode", "observedAt", "windows"]);
const WINDOW_KEYS = Object.freeze([
  "id",
  "providerId",
  "surface",
  "sourcePath",
  "authorityClass",
  "windowKind",
  "limit",
  "remaining",
  "used",
  "unit",
  "resetAt",
  "httpStatus",
  "httpMethod",
  "rpcMethod",
  "consumesQuota",
  "headers",
  "retryAfter",
  "autoRetry",
  "toolNames",
  "honorRetryAfterWithoutWait",
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ID_RE = /^[a-z][a-z0-9_.-]{1,95}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const MAX_WINDOWS = 32;

const MONEY_MOVEMENT_KEYS = new Set([
  "pay",
  "checkout",
  "settle",
  "transfer",
  "refund",
  "capture",
  "payout",
  "charge",
  "authorize",
  "purchase",
  "autopay",
  "payment",
  "paymentintent",
  "stripe",
  "sku",
  "priceusd",
  "walletpay",
  "xpayment",
]);
const PAY_MODES = new Set([
  "pay",
  "paid",
  "checkout",
  "settle",
  "settlement",
  "transfer",
  "refund",
  "capture",
  "payout",
  "charge",
  "purchase",
  "authorize",
  "mutate",
  "write",
  "live_pay",
  "live",
]);
const SUM_KEYS = new Set([
  "totalremaining",
  "sumremaining",
  "aggregateremaining",
  "summedremaining",
  "combinedremaining",
  "totalused",
  "sumused",
]);
const CONSUME_KEYS = new Set(["toolscall", "calltool", "invoketool", "generatethefixpack"]);
const SECRET_RE = /(sk_live|sk_test|whsec_|service_role|BEGIN [A-Z ]+PRIVATE KEY)/i;
const MUTATING_HTTP = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const BOUNDARIES = Object.freeze({
  readOnly: true,
  payment: false,
  checkout: false,
  publish: false,
  neo: false,
  toolsCall: false,
  fetch: false,
  moneyMovement: false,
});
const CLAIMS = Object.freeze({
  sumAcrossWindows: false,
  http429IsHeadroom: false,
  http402IsRemaining: false,
  independentlySettled: false,
  remainingIsLive: false,
});

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function loadPins(pinsPath = PINS_PATH) {
  return JSON.parse(readFileSync(pinsPath, "utf8"));
}

export function seededFailurePath(id) {
  const spec = SEEDED_FAILURES[id];
  if (!spec) return null;
  return join(INVALID_FIXTURES, spec.file);
}

export function codesFrom(result) {
  return (result?.errors || []).map((error) => error.code);
}

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function closed(decision, reasons, extra = {}) {
  const errors = Array.isArray(extra.errors) ? extra.errors : [];
  const ok = decision === DECISIONS.OBSERVED && errors.length === 0;
  return {
    ok,
    schemaVersion: SCHEMA,
    decision,
    reasons: reasons.slice(0, 32),
    errors,
    quotedPath: extra.quotedPath ?? null,
    mode: "read_only",
    liveObserved: false,
    consumesQuota: false,
    moneyMovement: false,
    boundaries: { ...BOUNDARIES },
    claims: { ...CLAIMS },
    windows: extra.windows ?? [],
    mcp: extra.mcp ?? {
      tools: loadPins().mcpToolNames,
      listAllowed: true,
      callAllowed: false,
    },
  };
}

function fail(code, path, message, extra = {}) {
  return closed(DECISIONS.INVALID_INPUT, [code], {
    ...extra,
    errors: [error(code, path, message), ...(extra.errors || [])],
  });
}

function walkForbidden(value, path, into) {
  if (typeof value === "string") {
    if (SECRET_RE.test(value)) {
      into.push(error("secret_refused", path, "quota probe refuses credential material"));
    }
    const lower = value.toLowerCase();
    if (lower === "tools/call" && !path.endsWith(".message")) {
      into.push(error("consume_quota_refused", path, "tools/call is not a quota remaining reading"));
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbidden(item, `${path}[${index}]`, into));
    return;
  }
  for (const key of ownKeys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      into.push(error("prototype_key_refused", path, `forbidden key ${key}`));
      continue;
    }
    const next = path ? `${path}.${key}` : key;
    const normalized = normalizeKey(key);
    if (MONEY_MOVEMENT_KEYS.has(normalized)) {
      into.push(error("money_movement_refused", next, "quota probe refuses payment, checkout, and settlement"));
    }
    if (SUM_KEYS.has(normalized)) {
      into.push(error("sum_across_windows", next, "remaining values are not summed across windows or providers"));
    }
    if (CONSUME_KEYS.has(normalized)) {
      into.push(error("consume_quota_refused", next, "quota probe refuses tools/call and other consuming surfaces"));
    }
    if (normalized === "autoretry" && value[key] === true) {
      into.push(error("auto_retry_refused", next, "Retry-After is recorded without a wait loop"));
    }
    walkForbidden(value[key], next, into);
  }
}

function isNonNegInt(value) {
  return Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function validateRetryAfter(retryAfter, path, errors) {
  if (retryAfter == null) return;
  if (!isPlainObject(retryAfter)) {
    errors.push(error("invalid_retry_after", path, "retryAfter must be an object"));
    return;
  }
  const keys = ownKeys(retryAfter);
  for (const key of keys) {
    if (!["seconds", "httpDate", "raw"].includes(key)) {
      errors.push(error("unknown_retry_after_key", `${path}.${key}`, `unknown retryAfter key ${key}`));
    }
  }
  if (retryAfter.seconds != null && !isNonNegInt(retryAfter.seconds)) {
    errors.push(error("invalid_retry_after", `${path}.seconds`, "retryAfter.seconds must be a non-negative integer"));
  }
}

function validateWindow(window, index) {
  const path = `windows[${index}]`;
  const errors = [];
  if (!isPlainObject(window)) {
    return { errors: [error("invalid_window", path, "window must be a JSON object")], window: null };
  }
  for (const key of ownKeys(window)) {
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(error("prototype_key_refused", `${path}.${key}`, `forbidden key ${key}`));
    } else if (!WINDOW_KEYS.includes(key)) {
      errors.push(error("unknown_window_key", `${path}.${key}`, `unknown window key ${key}`));
    }
  }
  if (!ID_RE.test(window.id)) {
    errors.push(error("invalid_id", `${path}.id`, "id must be a closed token"));
  }
  if (!PROVIDERS.includes(window.providerId)) {
    errors.push(error("unknown_provider", `${path}.providerId`, "providerId is not in the closed SDS ops set"));
  }
  if (!AUTHORITY_CLASSES.includes(window.authorityClass)) {
    errors.push(error("unknown_authority_class", `${path}.authorityClass`, "authorityClass is not in the closed set"));
  }
  if (!WINDOW_KINDS.includes(window.windowKind)) {
    errors.push(error("unknown_window_kind", `${path}.windowKind`, "windowKind must be declared_cap, rate_limit, or rate_limited"));
  }
  if (window.consumesQuota !== false) {
    errors.push(error("consume_quota_refused", `${path}.consumesQuota`, "quota probe windows must declare consumesQuota:false"));
  }
  if (window.autoRetry === true) {
    errors.push(error("auto_retry_refused", `${path}.autoRetry`, "Retry-After is recorded without a wait loop"));
  }
  if (window.rpcMethod != null) {
    if (window.rpcMethod === "tools/call") {
      errors.push(error("consume_quota_refused", `${path}.rpcMethod`, "tools/call is not a quota remaining reading"));
    } else if (!MCP_RPC_ALLOWED.includes(window.rpcMethod)) {
      errors.push(error("unknown_rpc_method", `${path}.rpcMethod`, "MCP RPC must be initialize, ping, or tools/list"));
    }
  }
  const httpMethod = window.httpMethod ?? null;
  if (httpMethod != null) {
    if (httpMethod === "POST" && MCP_RPC_ALLOWED.includes(window.rpcMethod)) {
      // Streamable HTTP MCP list/initialize uses POST JSON-RPC. tools/call is already refused.
    } else if (MUTATING_HTTP.has(httpMethod)) {
      errors.push(error("mutating_http_refused", `${path}.httpMethod`, "quota probe refuses mutating HTTP"));
    } else if (!HTTP_METHODS.includes(httpMethod)) {
      errors.push(error("unknown_http_method", `${path}.httpMethod`, "httpMethod must be GET or HEAD"));
    }
  }
  if (window.httpStatus != null && !isNonNegInt(window.httpStatus)) {
    errors.push(error("invalid_http_status", `${path}.httpStatus`, "httpStatus must be a non-negative integer"));
  }
  if (window.httpStatus === 402) {
    errors.push(error("http_402_is_not_remaining", `${path}.httpStatus`, "HTTP 402 is not remaining quota"));
  }
  if (window.httpStatus === 429) {
    if (window.windowKind !== "rate_limited") {
      errors.push(error("http_429_is_not_headroom", `${path}.windowKind`, "HTTP 429 must be windowKind rate_limited"));
    }
    if (window.remaining != null) {
      errors.push(error("http_429_is_not_headroom", `${path}.remaining`, "HTTP 429 is rate_limited, not remaining capacity"));
    }
    if (window.used != null) {
      errors.push(error("http_429_is_not_headroom", `${path}.used`, "HTTP 429 does not report used as headroom"));
    }
  }
  if (window.windowKind === "rate_limited") {
    if (window.httpStatus !== 429) {
      errors.push(error("http_429_is_not_headroom", `${path}.httpStatus`, "rate_limited windows require httpStatus 429"));
    }
    if (window.remaining != null || window.used != null) {
      errors.push(error("http_429_is_not_headroom", path, "rate_limited windows must leave remaining and used null"));
    }
  }
  if (window.windowKind === "rate_limit") {
    if (!isNonNegInt(window.limit) || window.limit < 1) {
      errors.push(error("invalid_limit", `${path}.limit`, "rate_limit windows require a positive integer limit"));
    }
    if (!isNonNegInt(window.remaining)) {
      errors.push(error("invalid_remaining", `${path}.remaining`, "rate_limit windows require a non-negative remaining"));
    }
    if (window.used != null && !isNonNegInt(window.used)) {
      errors.push(error("invalid_used", `${path}.used`, "used must be a non-negative integer"));
    }
    if (isNonNegInt(window.limit) && isNonNegInt(window.remaining) && window.remaining > window.limit) {
      errors.push(error("remaining_exceeds_limit", `${path}.remaining`, "remaining cannot exceed limit"));
    }
    if (isNonNegInt(window.limit) && isNonNegInt(window.remaining) && isNonNegInt(window.used) && window.used + window.remaining !== window.limit) {
      errors.push(error("used_remaining_mismatch", path, "used + remaining must equal limit when all three are present"));
    }
  }
  if (window.windowKind === "declared_cap") {
    if (!isNonNegInt(window.limit) || window.limit < 1) {
      errors.push(error("invalid_limit", `${path}.limit`, "declared_cap windows require a positive integer limit"));
    }
    if (window.remaining != null) {
      errors.push(error("declared_cap_has_no_remaining", `${path}.remaining`, "a declared cap is not remaining headroom"));
    }
  }
  if (window.resetAt != null && !RFC3339_RE.test(window.resetAt)) {
    errors.push(error("invalid_reset_at", `${path}.resetAt`, "resetAt must be RFC3339 UTC with milliseconds"));
  }
  if (window.unit != null && (typeof window.unit !== "string" || window.unit.length < 1 || window.unit.length > 64)) {
    errors.push(error("invalid_unit", `${path}.unit`, "unit must be a short token"));
  }
  if (window.headers != null && !isPlainObject(window.headers)) {
    errors.push(error("invalid_headers", `${path}.headers`, "headers must be an object of strings"));
  }
  if (window.toolNames != null) {
    if (!Array.isArray(window.toolNames) || window.toolNames.length === 0) {
      errors.push(error("invalid_tool_names", `${path}.toolNames`, "toolNames must be a non-empty array"));
    } else {
      const pinned = loadPins().mcpToolNames;
      if (JSON.stringify(window.toolNames) !== JSON.stringify(pinned)) {
        errors.push(error("mcp_tool_inventory_mismatch", `${path}.toolNames`, "toolNames must match the shipped MCP inventory"));
      }
    }
  }
  validateRetryAfter(window.retryAfter, `${path}.retryAfter`, errors);
  if (window.honorRetryAfterWithoutWait === false) {
    errors.push(error("auto_retry_refused", `${path}.honorRetryAfterWithoutWait`, "Retry-After must not start a wait loop"));
  }

  const observed = errors.length
    ? null
    : {
        id: window.id,
        providerId: window.providerId,
        surface: window.surface ?? null,
        sourcePath: window.sourcePath ?? null,
        authorityClass: window.authorityClass,
        windowKind: window.windowKind,
        limit: window.limit ?? null,
        remaining: window.windowKind === "rate_limit" ? window.remaining : null,
        used: window.windowKind === "rate_limit" ? window.used ?? null : null,
        unit: window.unit ?? null,
        resetAt: window.resetAt ?? null,
        httpStatus: window.httpStatus ?? null,
        httpMethod: window.httpMethod ?? null,
        rpcMethod: window.rpcMethod ?? null,
        consumesQuota: false,
        liveObserved: false,
      };
  return { errors, window: observed };
}

export function probe(pack, extra = {}) {
  if (!isPlainObject(pack)) {
    return fail("invalid_input", "$", "quota pack must be a JSON object", extra);
  }
  const forbidden = [];
  walkForbidden(pack, "", forbidden);
  if (forbidden.length) {
    const first = forbidden[0];
    return closed(DECISIONS.INVALID_INPUT, [first.code], {
      ...extra,
      errors: forbidden.slice(0, 16),
    });
  }
  for (const key of ownKeys(pack)) {
    if (!ROOT_KEYS.includes(key)) {
      return fail("unknown_root_key", key, `unknown root key ${key}`, extra);
    }
  }
  if (pack.schemaVersion !== SCHEMA) {
    return fail("unknown_schema", "schemaVersion", `schemaVersion must be ${SCHEMA}`, extra);
  }
  if (PAY_MODES.has(String(pack.mode || "").toLowerCase())) {
    return fail("money_movement_refused", "mode", "quota probe refuses payment, checkout, and live fetch modes", extra);
  }
  if (pack.mode !== "read_only") {
    return fail("invalid_mode", "mode", "mode must be read_only", extra);
  }
  if (pack.observedAt != null && !RFC3339_RE.test(pack.observedAt)) {
    return fail("invalid_observed_at", "observedAt", "observedAt must be RFC3339 UTC with milliseconds", extra);
  }
  if (!Array.isArray(pack.windows) || pack.windows.length < 1 || pack.windows.length > MAX_WINDOWS) {
    return fail("invalid_windows", "windows", `windows must be an array of 1..${MAX_WINDOWS} items`, extra);
  }

  const errors = [];
  const windows = [];
  const seenIds = new Set();
  for (let index = 0; index < pack.windows.length; index += 1) {
    const result = validateWindow(pack.windows[index], index);
    errors.push(...result.errors);
    if (result.window) {
      if (seenIds.has(result.window.id)) {
        errors.push(error("duplicate_window_id", `windows[${index}].id`, "window id must be unique in the pack"));
      } else {
        seenIds.add(result.window.id);
        windows.push(result.window);
      }
    }
  }
  if (errors.length) {
    return closed(DECISIONS.INVALID_INPUT, [...new Set(errors.map((item) => item.code))], {
      ...extra,
      errors: errors.slice(0, 16),
    });
  }
  return closed(DECISIONS.OBSERVED, ["read_only_quota_windows"], {
    ...extra,
    windows,
  });
}

export function probeFile(filePath) {
  let pack;
  try {
    pack = loadJson(filePath);
  } catch (cause) {
    return fail("invalid_json", filePath, cause instanceof Error ? cause.message : "invalid JSON", {
      quotedPath: filePath,
    });
  }
  return probe(pack, { quotedPath: filePath });
}

function extractMcpToolNames(source) {
  const match = source.match(/export const MCP_TOOL_NAMES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!match) return [];
  return [...match[1].matchAll(/"([a-z0-9_]+)"/g)].map((item) => item[1]);
}

export function probeCold({ root = ROOT, pinsPath = PINS_PATH } = {}) {
  let pins;
  try {
    pins = loadPins(pinsPath);
  } catch (cause) {
    return fail("invalid_pins", pinsPath, cause instanceof Error ? cause.message : "invalid pins");
  }
  if (pins.schemaVersion !== PINS_SCHEMA) {
    return fail("unknown_pins_schema", "schemaVersion", `pins schemaVersion must be ${PINS_SCHEMA}`);
  }
  if (!Array.isArray(pins.mcpToolNames) || pins.mcpToolNames.length !== 5) {
    return fail("mcp_tool_inventory_mismatch", "mcpToolNames", "pins must list the five shipped MCP tools");
  }
  const errors = [];
  const windows = [];
  for (const pin of pins.windows || []) {
    const sourcePath = join(root, pin.sourcePath);
    let source;
    try {
      source = readFileSync(sourcePath, "utf8");
    } catch {
      errors.push(error("declared_cap_missing_source", pin.sourcePath, `cannot read ${pin.sourcePath}`));
      continue;
    }
    if (!source.includes(pin.sourcePattern)) {
      errors.push(
        error(
          "declared_cap_mismatch",
          pin.sourcePath,
          `${pin.id} sourcePattern was not found in ${pin.sourcePath}`,
        ),
      );
      continue;
    }
    if (pin.id === "mcp.tool_inventory") {
      const names = extractMcpToolNames(source);
      if (JSON.stringify(names) !== JSON.stringify(pins.mcpToolNames)) {
        errors.push(error("mcp_tool_inventory_mismatch", pin.sourcePath, "MCP_TOOL_NAMES does not match pins.mcpToolNames"));
        continue;
      }
      if (source.includes("tools/call")) {
        errors.push(error("consume_quota_refused", pin.sourcePath, "inventory pin must not encode tools/call"));
        continue;
      }
    }
    windows.push({
      id: pin.id,
      providerId: pin.providerId,
      sourcePath: pin.sourcePath,
      sourcePattern: pin.sourcePattern,
      authorityClass: pin.authorityClass,
      windowKind: "declared_cap",
      limit: pin.limit,
      remaining: null,
      used: null,
      unit: pin.unit,
      rpcMethod: pin.rpcMethod ?? null,
      matched: true,
      consumesQuota: false,
      liveObserved: false,
    });
  }
  if (errors.length) {
    return closed(DECISIONS.INVALID_INPUT, [...new Set(errors.map((item) => item.code))], {
      errors: errors.slice(0, 16),
      windows,
      mcp: { tools: pins.mcpToolNames, listAllowed: true, callAllowed: false },
    });
  }
  return closed(DECISIONS.OBSERVED, ["declared_caps_from_source"], {
    windows,
    mcp: { tools: pins.mcpToolNames, listAllowed: true, callAllowed: false },
  });
}

export function runSuite() {
  const valid = listJsonFiles(VALID_FIXTURES).map((filePath) => {
    const result = probeFile(filePath);
    return {
      filePath,
      expect: "accept",
      ok: result.ok === true,
      codes: codesFrom(result),
      result,
    };
  });
  const manifest = loadInvalidManifest();
  const invalid = listJsonFiles(INVALID_FIXTURES).map((filePath) => {
    const name = filePath.split("/").pop();
    const expectedCode = manifest[name]?.code;
    const result = probeFile(filePath);
    const codes = codesFrom(result);
    const ok = result.ok === false && Boolean(expectedCode) && codes.includes(expectedCode);
    return {
      filePath,
      expect: "reject",
      expectedCode,
      ok,
      codes,
      result,
    };
  });
  const results = [...valid, ...invalid];
  const failed = results.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed: failed.length,
    total: results.length,
    results,
  };
}
