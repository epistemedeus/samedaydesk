import { createHash } from "node:crypto";

import { MonitorError } from "./errors.mjs";

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function sanitize(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MonitorError("non-finite numbers cannot enter a change receipt", { code: "non_finite" });
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value !== "object") {
    throw new MonitorError("value is not JSON data", { code: "not_json" });
  }
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  const out = {};
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new MonitorError(`unsafe key ${key}`, { code: "unsafe_key" });
    }
    out[key] = sanitize(value[key]);
  }
  return out;
}

export function canonical(value) {
  const clean = sanitize(value);
  return canonicalClean(clean);
}

function canonicalClean(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalClean(entry)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalClean(value[key])}`).join(",")}}`;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function digestJson(value) {
  return sha256(canonical(value));
}
