import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BYTES = 1_000_000;

export function stable(value) {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

export function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function readJson(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, reason: "missing" };
    return { ok: false, reason: "unreadable", message: error.message };
  }
  try {
    const size = fstatSync(descriptor).size;
    if (size > MAX_BYTES) return { ok: false, reason: "oversize" };
    const text = readFileSync(descriptor, "utf8");
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, reason: "invalid_json", message: error.message };
  } finally {
    closeSync(descriptor);
  }
}

export function writeJsonAtomic(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    return { ok: false, reason: "oversize" };
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return { ok: true };
}

export function removeFile(path) {
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
