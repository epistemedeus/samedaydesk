import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { F08_REF, F08_TESTED_SHA, REPO_ROOT } from "./pins.mjs";

function git(args, cwd = REPO_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function f08CliExists(root) {
  return existsSync(join(root, "server/paid-useful-jobs/bin/cli.mjs"));
}

/**
 * Fetch the pinned F08 commit into a detached worktree. Read-only by policy:
 * tests write outputs outside this tree. Never copies a competing kernel into
 * ownedPaths.
 */
export function ensureF08Worktree({ sha = F08_TESTED_SHA, dest } = {}) {
  if (process.env.F08_ROOT && f08CliExists(process.env.F08_ROOT)) {
    return process.env.F08_ROOT;
  }
  const target = dest || join(tmpdir(), `joa-f08-${sha.slice(0, 12)}`);
  if (f08CliExists(target)) return target;

  const have = git(["cat-file", "-t", sha]);
  if (String(have.stdout).trim() !== "commit") {
    const fetched = git(["fetch", "origin", F08_REF]);
    if (fetched.status !== 0) {
      const err = new Error(fetched.stderr || `git fetch origin ${F08_REF} failed`);
      err.code = "missing-f08";
      throw err;
    }
  }

  mkdirSync(tmpdir(), { recursive: true });
  const add = git(["worktree", "add", "--detach", target, sha]);
  if (add.status !== 0 && !f08CliExists(target)) {
    const err = new Error(add.stderr || `git worktree add failed for ${sha}`);
    err.code = "missing-f08";
    throw err;
  }
  if (!f08CliExists(target)) {
    const err = new Error(`F08 CLI missing after worktree add at ${target}`);
    err.code = "missing-f08";
    throw err;
  }
  return target;
}
