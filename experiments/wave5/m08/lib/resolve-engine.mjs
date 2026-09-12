import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGINE_CLI, ENGINE_PATH, ENGINE_SHA, REPO_ROOT } from "./pin.mjs";
import { refused } from "./errors.mjs";

function git(args, extra = {}) {
  return spawnSync("git", ["-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...extra,
  });
}

function objectExists(sha) {
  const result = git(["cat-file", "-t", sha]);
  return result.status === 0 && String(result.stdout).trim() === "commit";
}

function ensureFetched(sha) {
  if (objectExists(sha)) return;
  const fetched = git(["fetch", "origin", sha]);
  if (fetched.status !== 0 || !objectExists(sha)) {
    refused(
      "engine_unavailable",
      `Cannot load pinned route-table-diff ${sha}. git fetch failed or the object is missing.`,
      { sha, stderr: fetched.stderr || null },
      { analysis: "engine-failure" },
    );
  }
}

function worktreesForSha(sha) {
  const listed = git(["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return [];
  const found = [];
  let current = null;
  for (const line of String(listed.stdout).split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), head: null };
      found.push(current);
    } else if (line.startsWith("HEAD ") && current) {
      current.head = line.slice("HEAD ".length);
    }
  }
  return found.filter((item) => item.head === sha && item.path);
}

export function resolveEngine(options = {}) {
  const envRoot = options.root || process.env.ROUTE_TABLE_DIFF_ROOT;
  if (envRoot) {
    const cli = join(envRoot, ENGINE_CLI);
    if (!existsSync(cli)) {
      refused(
        "engine_unavailable",
        `ROUTE_TABLE_DIFF_ROOT has no ${ENGINE_CLI}`,
        { root: envRoot, cli },
        { analysis: "engine-failure" },
      );
    }
    return {
      root: envRoot,
      cli,
      sha: ENGINE_SHA,
      source: "env",
      path: ENGINE_PATH,
    };
  }

  const inTreeCli = join(REPO_ROOT, ENGINE_PATH, ENGINE_CLI);
  ensureFetched(ENGINE_SHA);

  const existing = worktreesForSha(ENGINE_SHA);
  for (const item of existing) {
    const cli = join(item.path, ENGINE_PATH, ENGINE_CLI);
    if (existsSync(cli)) {
      return {
        root: join(item.path, ENGINE_PATH),
        cli,
        sha: ENGINE_SHA,
        source: "worktree",
        path: ENGINE_PATH,
      };
    }
  }

  if (existsSync(inTreeCli)) {
    const head = git(["rev-parse", "HEAD"]);
    return {
      root: join(REPO_ROOT, ENGINE_PATH),
      cli: inTreeCli,
      sha: String(head.stdout || "").trim() || "in-tree",
      source: "in-tree",
      path: ENGINE_PATH,
    };
  }

  const dest = join(tmpdir(), `pilot-w5-m08-co12-${ENGINE_SHA}`);
  const destCli = join(dest, ENGINE_PATH, ENGINE_CLI);
  if (!existsSync(destCli)) {
    const added = git(["worktree", "add", "--detach", dest, ENGINE_SHA]);
    if (added.status !== 0 && !existsSync(destCli)) {
      refused(
        "engine_unavailable",
        `git worktree add failed for pinned Co12 ${ENGINE_SHA}`,
        { dest, stderr: added.stderr || null },
        { analysis: "engine-failure" },
      );
    }
  }
  if (!existsSync(destCli)) {
    refused(
      "engine_unavailable",
      `Pinned Co12 CLI missing after worktree materialization`,
      { dest, cli: destCli },
      { analysis: "engine-failure" },
    );
  }
  return {
    root: join(dest, ENGINE_PATH),
    cli: destCli,
    sha: ENGINE_SHA,
    source: "worktree",
    path: ENGINE_PATH,
  };
}
