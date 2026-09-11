import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { loadPin, REPO_ROOT } from "./paths.mjs";

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function findBin(root) {
  if (!root) return null;
  const nested = join(root, "tools/json-schema-webhook-drift/bin/webhook-drift.mjs");
  const direct = join(root, "bin/webhook-drift.mjs");
  if (existsSync(nested)) return nested;
  if (existsSync(direct)) return direct;
  return null;
}

function ensureWorktree(repoRoot, sha) {
  const dest = join(tmpdir(), "w5-m06-engine", sha);
  const bin = findBin(dest);
  if (bin) {
    try {
      const head = git(dest, ["rev-parse", "HEAD"]);
      if (head === sha) return { root: dest, bin, source: "worktree" };
    } catch {
      throw new Error(`engine worktree at ${dest} is not a git checkout of ${sha}`);
    }
  }
  mkdirSync(join(tmpdir(), "w5-m06-engine"), { recursive: true });
  try {
    git(repoRoot, ["fetch", "--depth=1", "origin", sha]);
  } catch (err) {
    throw new Error(`incomplete: cannot fetch engine ${sha}: ${err.stderr || err.message}`);
  }
  if (!existsSync(join(dest, ".git")) && !existsSync(dest)) {
    try {
      git(repoRoot, ["worktree", "add", "--detach", dest, sha]);
    } catch (err) {
      throw new Error(`incomplete: cannot materialize engine worktree: ${err.stderr || err.message}`);
    }
  } else if (!findBin(dest)) {
    try {
      git(repoRoot, ["worktree", "add", "--detach", dest, sha]);
    } catch (err) {
      throw new Error(`incomplete: cannot materialize engine worktree: ${err.stderr || err.message}`);
    }
  }
  const ready = findBin(dest);
  if (!ready) {
    throw new Error(`incomplete: engine CLI missing after worktree add at ${dest}`);
  }
  const head = git(dest, ["rev-parse", "HEAD"]);
  if (head !== sha) {
    throw new Error(`incomplete: engine HEAD ${head} != pin ${sha}`);
  }
  return { root: dest, bin: ready, source: "worktree" };
}

export function resolveEngine({ repoRoot = REPO_ROOT, env = process.env, pin = loadPin() } = {}) {
  const sha = pin.engine.sha;
  if (env.W5_M02_ENGINE_ROOT) {
    const bin = findBin(env.W5_M02_ENGINE_ROOT);
    if (!bin) {
      throw new Error(
        `incomplete: W5_M02_ENGINE_ROOT=${env.W5_M02_ENGINE_ROOT} has no webhook-drift CLI`,
      );
    }
    let head = null;
    try {
      head = git(env.W5_M02_ENGINE_ROOT, ["rev-parse", "HEAD"]);
    } catch {
      head = null;
    }
    return {
      root: env.W5_M02_ENGINE_ROOT,
      bin,
      source: "env",
      sha: head || "unverified-env",
      pinSha: sha,
    };
  }

  const inRepo = findBin(repoRoot);
  if (inRepo) {
    let head = null;
    try {
      head = git(repoRoot, ["rev-parse", "HEAD"]);
    } catch {
      head = null;
    }
    return { root: repoRoot, bin: inRepo, source: "in-repo", sha: head || "in-repo", pinSha: sha };
  }

  const wt = ensureWorktree(repoRoot, sha);
  return { ...wt, sha, pinSha: sha };
}
