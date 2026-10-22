import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(HERE, "..");
export const CALLERS_ROOT = join(PACK_ROOT, "callers");
export const PIN = JSON.parse(readFileSync(join(PACK_ROOT, "PIN.json"), "utf8"));
export const RUN_TIMEOUT_MS = 180_000;
export const EXTRACT_TIMEOUT_MS = 60_000;

export function pathIsInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function findRepoRoot({ repoRoot } = {}) {
  if (repoRoot) {
    const abs = resolve(repoRoot);
    if (existsSync(join(abs, PIN.engine.archivePath))) return abs;
    throw Object.assign(new Error(`archive not found under --repo-root ${abs}`), {
      code: "archive-not-found",
    });
  }
  if (process.env.USEFUL_JOB_DESK_REPO) {
    const abs = resolve(process.env.USEFUL_JOB_DESK_REPO);
    if (existsSync(join(abs, PIN.engine.archivePath))) return abs;
  }
  let dir = PACK_ROOT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, PIN.engine.archivePath))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw Object.assign(new Error("published 1.4.7 archive not found from pack root"), {
    code: "archive-not-found",
  });
}

export function callerPath(...parts) {
  return join(PACK_ROOT, "callers", ...parts);
}

export const DESK_JOBS = Object.freeze([
  {
    id: "lockfile-pin-delta",
    family: "lockfile",
    before: callerPath("lockfile", "before.json"),
    after: callerPath("lockfile", "after.json"),
    afterRepeat: callerPath("lockfile", "after-repeat.json"),
    outputs: ["pin-delta.json", "pin-delta.md"],
  },
  {
    id: "vendor-budget-impact",
    family: "vendor",
    before: callerPath("vendor", "before.json"),
    after: callerPath("vendor", "after.json"),
    afterRepeat: callerPath("vendor", "after-repeat.json"),
    outputs: ["budget-impact.json", "budget-impact.md"],
  },
]);

export const H32_PRIVATE_MARKERS = Object.freeze([
  "paid-useful-jobs",
  "managed-useful-jobs-order",
  "result-mailbox",
]);
