import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { MAX_INPUT_BYTES } from "./pins.mjs";
import { refuse } from "./refuse.mjs";
import { ERROR_CODES } from "./pins.mjs";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveInputPath(arg, cwd = process.cwd()) {
  if (!arg) return null;
  return isAbsolute(arg) ? arg : join(cwd, arg);
}

export function loadJsonFile(filePath) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return { ok: false, result: refuse(ERROR_CODES.MISSING_REQUIRED_INPUTS, `cannot read ${filePath}`) };
  }
  if (stat.size > MAX_INPUT_BYTES) {
    return { ok: false, result: refuse(ERROR_CODES.INVALID_JSON, `input exceeds ${MAX_INPUT_BYTES} bytes`) };
  }
  const raw = readFileSync(filePath, "utf8");
  try {
    return { ok: true, value: JSON.parse(raw), path: filePath };
  } catch {
    return { ok: false, result: refuse(ERROR_CODES.INVALID_JSON, `invalid JSON: ${filePath}`) };
  }
}

export function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (isPlainObject(value)) {
    for (const child of Object.values(value)) walk(child, visit);
  }
}

export function textBlob(value) {
  const parts = [];
  walk(value, (node) => {
    if (typeof node === "string") parts.push(node);
  });
  return parts.join("\n");
}
