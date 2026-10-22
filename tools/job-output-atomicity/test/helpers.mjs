import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../lib/pins.mjs";
import { ensureF08Worktree } from "../lib/f08-worktree.mjs";
import { killProcessGroup } from "../lib/reap.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_DIR = join(here, "..");
export const VERIFY_CLI = join(MODULE_DIR, "bin/verify-complete.mjs");
export const CATALOG = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");

let cachedF08 = null;

export function f08Root() {
  if (!cachedF08) cachedF08 = ensureF08Worktree();
  return cachedF08;
}

export function tempDir(prefix = "joa-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export async function waitForFile(filePath, { timeoutMs = 20_000, intervalMs = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function startMutator(filePath) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { writeFileSync } from "node:fs";
       const f = process.env.JOA_MUTATE_FILE;
       let n = 0;
       for (;;) {
         writeFileSync(f, "mutated-" + String(n++) + "\\n");
       }`,
    ],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, JOA_MUTATE_FILE: filePath, JOA_RUN_ID: `mutator-${process.pid}` },
    },
  );
  return {
    pid: child.pid,
    stop() {
      killProcessGroup(child.pid);
    },
  };
}

export function removeQuiet(path) {
  rmSync(path, { recursive: true, force: true });
}
