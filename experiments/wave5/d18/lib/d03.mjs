import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { D03_PATH, D03_REF, D03_TESTED_SHA, REPO_ROOT } from "./pins.mjs";
import { git, gitFetchWithRetry, haveCommit } from "./git.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireDirLock(lockPath, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      mkdirSync(lockPath);
      return true;
    } catch {
      sleep(100);
    }
  }
  return false;
}

export function d03ModuleDir(root) {
  if (!root) return null;
  if (existsSync(join(root, "lib/verify.mjs"))) return root;
  const nested = join(root, D03_PATH);
  if (existsSync(join(nested, "lib/verify.mjs"))) return nested;
  return null;
}

function missingD03(message) {
  const err = new Error(message);
  err.code = "missing-d03";
  return err;
}

export function ensureD03Worktree({ sha = D03_TESTED_SHA, dest } = {}) {
  if (process.env.D03_ROOT) {
    const fromEnv = d03ModuleDir(process.env.D03_ROOT);
    if (fromEnv) return fromEnv;
    throw missingD03(`D03_ROOT does not contain ${D03_PATH}: ${process.env.D03_ROOT}`);
  }

  const inTree = d03ModuleDir(join(REPO_ROOT, D03_PATH)) || d03ModuleDir(REPO_ROOT);
  if (inTree) return inTree;

  const target = dest || join(tmpdir(), `w5-d18-d03-${sha.slice(0, 12)}`);
  const existing = d03ModuleDir(target);
  if (existing) return existing;

  const lockPath = `${target}.lock`;
  const gotLock = acquireDirLock(lockPath);
  try {
    const raced = d03ModuleDir(target);
    if (raced) return raced;

    if (!haveCommit(sha)) {
      const bySha = gitFetchWithRetry(["origin", sha]);
      if (lastFailed(bySha) && !haveCommit(sha)) {
        const byRef = gitFetchWithRetry(["origin", D03_REF]);
        if (lastFailed(byRef) && !haveCommit(sha)) {
          const byPr = gitFetchWithRetry(["origin", "pull/69/head"]);
          if (lastFailed(byPr) && !haveCommit(sha)) {
            throw missingD03(byPr.stderr || byRef.stderr || bySha.stderr || `git fetch of D03 ${sha} failed`);
          }
        }
      }
    }

    mkdirSync(tmpdir(), { recursive: true });
    if (!existsSync(target)) {
      const add = git(["worktree", "add", "--detach", target, sha]);
      if (add.status !== 0 && !d03ModuleDir(target)) {
        throw missingD03(add.stderr || `git worktree add failed for D03 ${sha}`);
      }
    }

    const start = Date.now();
    while (!d03ModuleDir(target) && Date.now() - start < 15_000) sleep(100);
    const ready = d03ModuleDir(target);
    if (!ready) throw missingD03(`D03 verify.mjs missing after worktree add at ${target}`);
    return ready;
  } finally {
    if (gotLock) rmSync(lockPath, { recursive: true, force: true });
  }
}

function lastFailed(result) {
  return !result || result.status !== 0;
}

export async function loadVerifyComplete(moduleDir = ensureD03Worktree()) {
  const href = pathToFileURL(join(moduleDir, "lib/verify.mjs")).href;
  const loaded = await import(href);
  if (typeof loaded.verifyComplete !== "function") {
    throw missingD03("D03 module loaded without verifyComplete export");
  }
  return {
    verifyComplete: loaded.verifyComplete,
    moduleDir,
    testedSha: D03_TESTED_SHA,
  };
}

export function d03Cli(moduleDir = ensureD03Worktree()) {
  return join(moduleDir, "bin/verify-complete.mjs");
}
