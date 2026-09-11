import fs from "node:fs";
import path from "node:path";
import {
  EXECUTION_CONTRACT_VERSION,
  EXECUTION_MAX_INPUT_BYTES,
  KIT_MAX_LOCAL_INPUT_BYTES,
  MAX_LOCAL_INPUT_BYTES,
} from "./constants.mjs";
import { sha256Buffer } from "./digest.mjs";
import { refuse } from "./refuse.mjs";

export function assertExecutionInputBytes(key, bytes, extra = {}) {
  if (bytes > EXECUTION_MAX_INPUT_BYTES) {
    throw refuse("input-oversize", `Input ${key} is ${bytes} bytes; max is ${EXECUTION_MAX_INPUT_BYTES}`, {
      key,
      bytes,
      max: EXECUTION_MAX_INPUT_BYTES,
      kitLimitBytes: KIT_MAX_LOCAL_INPUT_BYTES,
      contract: EXECUTION_CONTRACT_VERSION,
      ...extra,
    });
  }
}

export function flagToKey(flag) {
  return String(flag).replace(/^--/, "");
}

export function resolveInputPath(declaredPath, { inputRoot = null } = {}) {
  if (!declaredPath || typeof declaredPath !== "string") return null;
  if (path.isAbsolute(declaredPath)) return path.normalize(declaredPath);
  if (inputRoot) return path.resolve(inputRoot, declaredPath);
  return path.resolve(declaredPath);
}

/**
 * Confine a resolved path under --input-root. Behavior is aligned with
 * useful-jobs `validate-next-run.mjs` (realpath, symlink follow-once).
 */
export function assertWithinRoot(absPath, root) {
  if (!root) return;
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    throw refuse("input-root-missing", "input-root must be an existing directory", { root });
  }
  const rootStat = fs.statSync(realRoot);
  if (!rootStat.isDirectory()) {
    throw refuse("input-root-not-directory", "input-root must be a directory", { root: realRoot });
  }
  let real;
  try {
    real = fs.realpathSync(absPath);
  } catch {
    real = path.resolve(absPath);
  }
  if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
    throw refuse("input-path-escapes-root", "Resolved input path escapes input-root", {
      path: absPath,
      root: realRoot,
    });
  }
}

export function readBoundedRegularFile(absPath, { inputRoot = null } = {}) {
  if (inputRoot) assertWithinRoot(absPath, inputRoot);
  let st;
  try {
    st = fs.lstatSync(absPath);
  } catch {
    throw refuse("input-missing-file", "Input file not found", { path: absPath });
  }
  if (st.isSymbolicLink()) {
    const target = fs.realpathSync(absPath);
    if (inputRoot) assertWithinRoot(target, inputRoot);
    st = fs.statSync(target);
    absPath = target;
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
  const buf = fs.readFileSync(absPath);
  return {
    path: absPath,
    bytes: buf.length,
    sha256: sha256Buffer(buf),
    buffer: buf,
  };
}
