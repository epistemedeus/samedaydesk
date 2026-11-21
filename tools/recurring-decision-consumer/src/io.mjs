import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { INPUT_MAX_BYTES, STATE_MAX_BYTES } from "./limits.mjs";

export function readBoundedJson(path, maxBytes = INPUT_MAX_BYTES) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
  } catch (error) {
    if (error?.code === "ENOENT") {
      const err = new Error("not found");
      err.code = "ENOENT";
      throw err;
    }
    throw error;
  }
  try {
    const size = fstatSync(descriptor).size;
    if (size > maxBytes) {
      const err = new Error(`input exceeds ${maxBytes} bytes`);
      err.code = "OVERSIZE";
      throw err;
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

export function writeJsonAtomic(path, value, maxBytes = STATE_MAX_BYTES) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    const err = new Error(`output exceeds ${maxBytes} bytes`);
    err.code = "OVERSIZE";
    throw err;
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function removePath(path) {
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}
