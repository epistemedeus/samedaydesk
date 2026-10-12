// Bounds shared by the supplied-row normalizer and the ordinary readiness caller.
// No package imports.

export const MAX_BYTES = 32_768;
export const MAX_DEPTH = 8;
export const MAX_KEYS = 32;
export const MAX_STRING = 2_048;
export const MAX_REQUIRED_PATHS = 16;
export const WORK_LIMIT_MS = 2_000;

const ROUTE_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;
const HOSTILE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "command",
  "cmd",
  "exec",
  "shell",
  "eval",
]);

export function suppliedFail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function isPlainJson(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function inspectSupplied(value, depth = 0, extraKeys = null) {
  if (depth > MAX_DEPTH) throw suppliedFail("oversized_input", "document is too deep");
  if (typeof value === "string") {
    if (value.length > MAX_STRING) throw suppliedFail("oversized_input", "string is too long");
    if (value.includes("\u0000")) throw suppliedFail("hostile_input", "string is not accepted");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw suppliedFail("invalid_shape", "number must be finite");
    return;
  }
  if (typeof value === "boolean" || value === null) return;
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) throw suppliedFail("oversized_input", "array is too long");
    for (const item of value) inspectSupplied(item, depth + 1, extraKeys);
    return;
  }
  if (!isPlainJson(value)) throw suppliedFail("invalid_shape", "value must be plain JSON");
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) throw suppliedFail("oversized_input", "object has too many properties");
  for (const key of keys) {
    if (HOSTILE_KEYS.has(key) || extraKeys?.has(key) || key.includes("__proto__") || key.includes("\u0000")) {
      throw suppliedFail("hostile_input", "object property is not accepted");
    }
    if (key === "$ref" || key === "$dynamicRef" || key === "$id") {
      throw suppliedFail("hostile_input", "schema references and identifiers are not resolved");
    }
    inspectSupplied(value[key], depth + 1, extraKeys);
  }
}

export function assertSuppliedRoute(route) {
  if (typeof route !== "string" || route.length > 200 || !ROUTE_PATTERN.test(route)) {
    throw suppliedFail("invalid_shape", "route is not an exact path");
  }
  if (route.startsWith("//") || route.includes("..") || route.includes("{") || route.includes("\\")) {
    throw suppliedFail("hostile_input", "route is not an exact path");
  }
}
