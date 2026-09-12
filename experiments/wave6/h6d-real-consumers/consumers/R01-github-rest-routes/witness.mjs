/**
 * Independent OpenAPI used-ops witness for github/rest-api-description.
 * Equality is the set of method+path (+ operationId if present).
 * Does not import kit engines or compare/oracle modules.
 * Does not fingerprint requestBody/response schemas (engine may).
 */
import { existsSync, readFileSync, statSync } from "node:fs";

const METHODS = Object.freeze(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asKey(method, path) {
  return `${String(method).toUpperCase()} ${path}`;
}

function refused(code, message, extra = {}) {
  return {
    ok: false,
    refused: true,
    fact: message,
    status: "refused",
    code,
    changed: [],
    unchanged: [],
    added: [],
    removed: [],
    unknown: extra.unknown || [],
    equality: "method+path+operationId",
    purchaseAuthority: false,
    runtimeCompatibilityProof: false,
    ...extra,
  };
}

function loadInput(value, label) {
  if (value == null || value === "") {
    return { error: refused("missing-input", `${label} is missing`, { label }) };
  }
  if (Buffer.isBuffer(value)) {
    return { text: value.toString("utf8"), path: null, label };
  }
  if (isPlainObject(value)) {
    if (typeof value.text === "string" && value.openapi === undefined && value.paths === undefined) {
      return loadInput(value.text, label);
    }
    if (value.openapi != null || value.swagger != null || isPlainObject(value.paths) || Array.isArray(value.operations)) {
      return { text: null, doc: value, path: null, label };
    }
  }
  const str = String(value);
  if (str.length < 4096 && existsSync(str)) {
    try {
      if (statSync(str).isFile()) {
        return { text: readFileSync(str, "utf8"), path: str, label };
      }
    } catch {
      /* treat as text */
    }
  }
  return { text: str, path: null, label };
}

function looksLikeOpenApi(doc) {
  if (!isPlainObject(doc)) return false;
  if (typeof doc.openapi === "string" || typeof doc.swagger === "string") return true;
  return isPlainObject(doc.paths);
}

function parseJsonDoc(text, label) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return { error: refused("empty-document", `${label} is empty`, { label }) };
  if (/^\s*(<!DOCTYPE\s+html|<html[\s>])/i.test(raw)) {
    return { error: refused("html-input", `${label} is HTML, not OpenAPI`, { label }) };
  }
  if (!raw.startsWith("{") && !raw.startsWith("[")) {
    return {
      error: refused(
        "yaml-not-json",
        `${label} is not JSON-encoded OpenAPI (this witness parses JSON OpenAPI / JSON-in-.yaml excerpts)`,
        { label },
      ),
    };
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return { error: refused("parse-error", `${label} is not JSON: ${err.message}`, { label }) };
  }
  return { doc };
}

function indexOperations(doc) {
  const map = new Map();
  const unknown = [];
  const paths = isPlainObject(doc.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isPlainObject(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isPlainObject(op)) continue;
      const key = asKey(method, path);
      map.set(key, {
        key,
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === "string" && op.operationId ? op.operationId : null,
        summary: typeof op.summary === "string" ? op.summary : null,
        deprecated: Boolean(op.deprecated),
      });
    }
  }
  if (!looksLikeOpenApi(doc)) {
    unknown.push({ reason: "not-openapi-object" });
  }
  return { map, unknown, dialect: doc.openapi || doc.swagger || null };
}

function loadOpenApi(value, label) {
  const loaded = loadInput(value, label);
  if (loaded.error) return loaded.error;
  let doc = loaded.doc;
  if (!doc) {
    const parsed = parseJsonDoc(loaded.text, label);
    if (parsed.error) return parsed.error;
    doc = parsed.doc;
  }
  if (!isPlainObject(doc)) {
    return refused("not-object", `${label} is not an object`, { label });
  }
  if (!looksLikeOpenApi(doc)) {
    return refused("not-openapi", `${label} is not an OpenAPI document (missing openapi/swagger/paths)`, { label });
  }
  const indexed = indexOperations(doc);
  return { ok: true, doc, ...indexed, label };
}

function parseUsed(used) {
  if (used == null || used === false) return { keys: null, unknown: [] };
  const loaded = loadInput(used, "used");
  if (loaded.error) return { keys: null, unknown: [{ reason: "used-unreadable", detail: loaded.error }] };
  let doc = loaded.doc;
  if (!doc) {
    const parsed = parseJsonDoc(loaded.text, "used");
    if (parsed.error) return { keys: null, unknown: [{ reason: "used-parse-error", detail: parsed.error }] };
    doc = parsed.doc;
  }
  const unknown = [];
  const keys = [];
  const operations = Array.isArray(doc)
    ? doc
    : Array.isArray(doc?.operations)
      ? doc.operations
      : null;
  if (!operations) {
    return { keys: null, unknown: [{ reason: "missing-used-list", detail: "used-ops must be { operations: [...] }" }] };
  }
  for (const entry of operations) {
    if (!isPlainObject(entry)) {
      unknown.push({ reason: "malformed-used-entry", entry });
      continue;
    }
    if (entry.method && entry.path) {
      keys.push(asKey(entry.method, entry.path));
      continue;
    }
    if (entry.operationId) {
      keys.push({ operationId: entry.operationId });
      continue;
    }
    unknown.push({ reason: "incomplete-used-entry", entry });
  }
  return { keys, unknown };
}

function resolveUsedKey(spec, beforeMap, afterMap) {
  if (typeof spec === "string") return spec;
  const oid = spec?.operationId;
  if (!oid) return null;
  for (const map of [beforeMap, afterMap]) {
    for (const op of map.values()) {
      if (op.operationId === oid) return op.key;
    }
  }
  return null;
}

function publicOp(op) {
  if (!op) return null;
  return {
    key: op.key,
    method: op.method,
    path: op.path,
    operationId: op.operationId,
  };
}

/**
 * @param {string|object|Buffer} before
 * @param {string|object|Buffer} after
 * @param {string|object|undefined} used
 * @returns {{fact: string, changed: object[], unchanged: object[], added: object[], removed: object[], unknown: object[]}}
 */
export function witness(before, after, used) {
  const b = loadOpenApi(before, "before");
  if (b.refused) return b;
  const a = loadOpenApi(after, "after");
  if (a.refused) return a;

  const usedSpec = parseUsed(used);
  const unknown = [...(b.unknown || []), ...(a.unknown || []), ...(usedSpec.unknown || [])];

  let focus = null;
  if (usedSpec.keys) {
    focus = new Set();
    for (const spec of usedSpec.keys) {
      const key = resolveUsedKey(spec, b.map, a.map);
      if (!key) {
        unknown.push({
          reason: "used-op-absent-from-both",
          spec,
        });
        continue;
      }
      focus.add(key);
    }
  }

  const keys = [...new Set([...(focus || [...b.map.keys(), ...a.map.keys()])])].sort();
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const key of keys) {
    const bp = b.map.get(key);
    const ap = a.map.get(key);
    if (!bp && !ap) {
      unknown.push({ key, reason: "absent-in-both" });
      continue;
    }
    if (!bp && ap) {
      added.push(publicOp(ap));
      continue;
    }
    if (bp && !ap) {
      removed.push(publicOp(bp));
      continue;
    }
    if (bp.operationId !== ap.operationId) {
      changed.push({
        key,
        field: "operationId",
        before: publicOp(bp),
        after: publicOp(ap),
      });
      continue;
    }
    unchanged.push(publicOp(ap));
  }

  const hasDelta = added.length + removed.length + changed.length > 0;
  const status = unknown.length ? "partial" : hasDelta ? "actionable" : "informational";
  const fact = hasDelta
    ? `Used-op identity delta: +${added.length}/~${changed.length}/-${removed.length} (method+path+operationId)`
    : "Used-op identity set unchanged (method+path+operationId)";

  return {
    ok: true,
    refused: false,
    fact,
    status,
    equality: "method+path+operationId",
    dialect: { before: b.dialect, after: a.dialect },
    counts: {
      beforeOps: focus ? [...b.map.keys()].filter((k) => focus.has(k)).length : b.map.size,
      afterOps: focus ? [...a.map.keys()].filter((k) => focus.has(k)).length : a.map.size,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
      unknown: unknown.length,
    },
    added,
    removed,
    changed,
    unchanged,
    unknown,
    purchaseAuthority: false,
    runtimeCompatibilityProof: false,
    note: "Set identity only. Nested schema fields (e.g. label.archived_at) are out of scope for this witness.",
  };
}

export default witness;
