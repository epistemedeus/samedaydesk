/**
 * Independent method+path witness for Stripe OpenAPI excerpts.
 * Does not import useful-jobs engines or record-repeat compare/oracle.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const METHODS = Object.freeze(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return JSON.stringify(value);
}

function maybeReadFile(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (existsSync(value)) return readFileSync(value, "utf8");
  return value;
}

export function parseOpenApi(input) {
  if (input && typeof input === "object" && !Buffer.isBuffer(input) && !Array.isArray(input)) {
    if (input.paths || input.openapi || input.swagger) return input;
  }
  const text = asText(maybeReadFile(input)).trim();
  if (!text) {
    const err = new Error("empty-openapi");
    err.code = "empty-openapi";
    throw err;
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text);
  }
  const err = new Error("witness-parses-json-openapi-only");
  err.code = "unsupported-openapi-text";
  throw err;
}

export function parseUsed(input) {
  if (input == null) return { operations: null, raw: null };
  if (Array.isArray(input)) return { operations: input, raw: { operations: input } };
  if (typeof input === "object" && !Buffer.isBuffer(input)) {
    return { operations: input.operations || null, raw: input };
  }
  const text = asText(maybeReadFile(input)).trim();
  if (!text) return { operations: null, raw: null };
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return { operations: parsed, raw: { operations: parsed } };
  return { operations: parsed?.operations || null, raw: parsed };
}

export function opKey(method, path) {
  return `${String(method).toUpperCase()} ${path}`;
}

export function indexMethodPaths(doc) {
  const map = new Map();
  const paths = doc?.paths && typeof doc.paths === "object" ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      const key = opKey(method, path);
      map.set(key, {
        key,
        method: method.toUpperCase(),
        path,
        operationId: op.operationId || null,
        deprecated: Boolean(op.deprecated),
        digest: createHash("sha256").update(stableStringify(op)).digest("hex"),
      });
    }
  }
  return map;
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

function resolveUsedKeys(operations, beforeMap, afterMap) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { keys: [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort(), unknown: [] };
  }
  const keys = [];
  const unknown = [];
  for (const [i, entry] of operations.entries()) {
    if (!entry || typeof entry !== "object") {
      unknown.push({ reason: "malformed-used-entry", index: i });
      continue;
    }
    if (entry.method && entry.path) {
      keys.push(opKey(entry.method, entry.path));
      continue;
    }
    if (entry.operationId) {
      const hit =
        [...beforeMap.values()].find((o) => o.operationId === entry.operationId) ||
        [...afterMap.values()].find((o) => o.operationId === entry.operationId);
      if (hit) keys.push(hit.key);
      else unknown.push({ reason: "unknown-operationId", operationId: entry.operationId });
      continue;
    }
    unknown.push({ reason: "incomplete-used-entry", index: i });
  }
  return { keys: [...new Set(keys)], unknown };
}

/**
 * Independent witness: identity is HTTP method + path.
 * `changed` is used ops present in both whose operation object digest differs.
 * Nested requestBody edits therefore surface here even if an engine fingerprint is shallower.
 */
export function witness(before, after, used) {
  let beforeDoc;
  let afterDoc;
  const unknown = [];
  try {
    beforeDoc = parseOpenApi(before);
  } catch (err) {
    unknown.push({ reason: "before-parse", error: err.code || err.message });
  }
  try {
    afterDoc = parseOpenApi(after);
  } catch (err) {
    unknown.push({ reason: "after-parse", error: err.code || err.message });
  }
  if (!beforeDoc || !afterDoc) {
    return {
      fact: "openapi-method-path",
      changed: [],
      unchanged: [],
      added: [],
      removed: [],
      unknown,
    };
  }

  const beforeMap = indexMethodPaths(beforeDoc);
  const afterMap = indexMethodPaths(afterDoc);
  const usedSpec = parseUsed(used);
  const resolved = resolveUsedKeys(usedSpec.operations, beforeMap, afterMap);
  unknown.push(...resolved.unknown);

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const key of resolved.keys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b && !a) {
      unknown.push({ key, reason: "absent-in-both" });
      continue;
    }
    if (!b && a) {
      added.push(key);
      continue;
    }
    if (b && !a) {
      removed.push(key);
      continue;
    }
    if (b.digest !== a.digest) changed.push(key);
    else unchanged.push(key);
  }

  return {
    fact: "openapi-method-path",
    changed,
    unchanged,
    added,
    removed,
    unknown,
    usedCount: resolved.keys.length,
    purchaseAuthority: false,
    liveStripe: false,
    note: "Method+path identity. Changed means the used operation object bytes differ, not runtime compatibility.",
  };
}
