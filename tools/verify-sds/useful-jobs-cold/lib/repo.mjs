import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { USEFUL_JOBS_PIN } from "./pin.mjs";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

export function defaultRoot() {
  // tools/verify-sds/useful-jobs-cold/lib → repo root
  return join(LIB_DIR, "../../../..");
}

export function resolveRoot(explicit) {
  return explicit ? resolve(explicit) : defaultRoot();
}

export function kitPath(root, { source = "kit", version = USEFUL_JOBS_PIN.version } = {}) {
  const name = `useful-jobs-${version}.tar.gz`;
  if (source === "for-agents" || source === "public") {
    return join(root, "client/public/for-agents/useful-jobs", name);
  }
  return join(root, "client/public/kit", name);
}

export function obtainArchiveBin(root) {
  return join(root, USEFUL_JOBS_PIN.obtainArchiveBin);
}

/** First existing ancestor, with symlinks resolved. Missing dest still follows a linked parent. */
export function realExisting(p) {
  let cur = resolve(p);
  for (;;) {
    if (existsSync(cur)) {
      try {
        return realpathSync(cur);
      } catch {
        return cur;
      }
    }
    const parent = dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
}

export function isInsideRepo(dest, root) {
  const rel = relative(realExisting(root), realExisting(dest));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

export function assertObtainPresent(root) {
  const bin = obtainArchiveBin(root);
  if (!existsSync(bin)) {
    throw new Error(`obtain-archive missing: ${bin}`);
  }
  return bin;
}
