import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { INPUT_MAX_BYTES, checkInputBounds } from "../../task-bundle-economics/src/limits.mjs";

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function dropUndefined(value) {
  if (Array.isArray(value)) return value.map(dropUndefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) out[key] = dropUndefined(child);
    }
    return out;
  }
  return value;
}

export function readBoundedJson(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    if (fstatSync(descriptor).size > INPUT_MAX_BYTES) {
      return { ok: false, reason: "input_too_large" };
    }
    const parsed = JSON.parse(readFileSync(descriptor, "utf8"));
    const bounds = checkInputBounds(parsed);
    if (!bounds.ok) return { ok: false, reason: "input_bounds_refused", message: bounds.message };
    return { ok: true, value: parsed };
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: false, reason: "input_missing" };
    return { ok: false, reason: "input_unreadable" };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}
