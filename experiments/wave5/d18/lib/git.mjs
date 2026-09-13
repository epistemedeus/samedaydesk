import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./pins.mjs";

export function git(args, cwd = REPO_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function gitFetchWithRetry(args, { attempts = 4 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = git(["fetch", ...args]);
    if (last.status === 0) return last;
    const delayMs = 1000 * 2 ** (i + 2);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  return last;
}

export function haveCommit(sha) {
  const probed = git(["cat-file", "-t", sha]);
  return String(probed.stdout).trim() === "commit";
}
