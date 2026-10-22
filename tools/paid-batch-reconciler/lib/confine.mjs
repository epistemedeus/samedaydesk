import { basename, isAbsolute, relative, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { REPO_ROOT } from "./pins.mjs";

export function looksJsonText(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

export function isSafeItemId(id) {
  if (typeof id !== "string" || !id.trim()) return false;
  if (id.includes("\0") || /[\x00-\x1f]/.test(id)) return false;
  if (/[\\/]/.test(id)) return false;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    decoded = id;
  }
  if (decoded !== basename(decoded)) return false;
  if (decoded === "." || decoded === "..") return false;
  if (id !== basename(id)) return false;
  return true;
}

export function resolvedInside(root, target) {
  const abs = resolve(target);
  let check = abs;
  try {
    if (existsSync(abs)) check = realpathSync(abs);
  } catch {
    check = abs;
  }
  const rel = relative(resolve(root), check);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function inputRoot() {
  return REPO_ROOT;
}

export function confineExistingPath(filePath, root = inputRoot()) {
  if (typeof filePath !== "string") return { ok: true, path: filePath };
  if (looksJsonText(filePath)) return { ok: true, path: filePath, json: true };
  const abs = resolve(filePath);
  if (!resolvedInside(root, abs)) {
    return { ok: false, path: abs };
  }
  return { ok: true, path: abs };
}
