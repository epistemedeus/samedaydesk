import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { refuse } from "./refuse.mjs";
import { MAX_LOCAL_INPUT_BYTES } from "./pins.mjs";

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

/** File identity follows useful-jobs: 64 hex. Optional sha256: prefix is stripped. */
export function parseFileSha256(value, { label = "sha256" } = {}) {
  if (value == null || value === false || value === "") return null;
  if (typeof value !== "string") {
    throw refuse("invalid-file-sha256", `${label} must be a 64-char hex digest`, { got: value });
  }
  const s = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  if (!/^[0-9a-f]{64}$/i.test(s)) {
    throw refuse("invalid-file-sha256", `${label} must be a 64-char hex digest`, { got: value });
  }
  return s.toLowerCase();
}

export function readBoundedFile(absPath) {
  let st;
  try {
    st = statSync(absPath);
  } catch {
    return { missing: true, path: absPath };
  }
  if (!st.isFile()) {
    throw refuse("input-not-regular-file", "Local input must be a regular file", { path: absPath });
  }
  if (st.size > MAX_LOCAL_INPUT_BYTES) {
    throw refuse("input-too-large", `Local input exceeds ${MAX_LOCAL_INPUT_BYTES} byte bound`, {
      path: absPath,
      size: st.size,
      limit: MAX_LOCAL_INPUT_BYTES,
    });
  }
  const buf = readFileSync(absPath);
  return {
    missing: false,
    path: absPath,
    bytes: buf.length,
    sha256: sha256Buffer(buf),
  };
}

export function fileExists(p) {
  try {
    return Boolean(p) && existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}
