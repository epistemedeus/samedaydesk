import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { M04_CLI_REL, M04_SHA, SDS_ROOT } from "./pins.mjs";

export function cliFromRoot(root) {
  const candidates = [
    join(root, M04_CLI_REL),
    join(root, "bin/route-diff.mjs"),
    join(root, "tools/route-table-diff/bin/route-diff.mjs"),
  ];
  return candidates.find((path) => existsSync(path)) || null;
}

function parseWorktrees(text) {
  const blocks = String(text || "").trim().split(/\n\n+/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const row = { path: null, head: null };
    for (const line of lines) {
      if (line.startsWith("worktree ")) row.path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) row.head = line.slice("HEAD ".length);
    }
    if (row.path) out.push(row);
  }
  return out;
}

function git(repoRoot, args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * Locate the pinned Co12 CLI without copying tools/route-table-diff into this kit.
 */
export function ensureEngine(repoRoot = SDS_ROOT) {
  const envRoot = process.env.W5_M04_ENGINE_ROOT;
  if (envRoot) {
    const cli = cliFromRoot(envRoot);
    if (cli) return { repoRoot: envRoot, cli, via: "env", sha: M04_SHA };
  }

  const inTree = cliFromRoot(repoRoot);
  if (inTree) return { repoRoot, cli: inTree, via: "in-tree", sha: M04_SHA };

  const listed = git(repoRoot, ["worktree", "list", "--porcelain"]);
  if (listed.status === 0) {
    for (const row of parseWorktrees(listed.stdout)) {
      if (row.head === M04_SHA) {
        const cli = cliFromRoot(row.path);
        if (cli) return { repoRoot: row.path, cli, via: "worktree", sha: M04_SHA };
      }
    }
  }

  const cached = join(tmpdir(), `w5-m17-m04-${M04_SHA.slice(0, 12)}`);
  const cachedCli = cliFromRoot(cached);
  if (cachedCli) return { repoRoot: cached, cli: cachedCli, via: "cached-worktree", sha: M04_SHA };

  const fetched = git(repoRoot, ["fetch", "origin", M04_SHA]);
  if (fetched.status !== 0) {
    const err = new Error(`cannot fetch M04 pin ${M04_SHA}: ${fetched.stderr || fetched.stdout}`);
    err.code = "m04-engine-missing";
    throw err;
  }
  mkdirSync(tmpdir(), { recursive: true });
  const added = git(repoRoot, ["worktree", "add", "--detach", cached, M04_SHA]);
  if (added.status !== 0) {
    const retry = cliFromRoot(cached);
    if (retry) return { repoRoot: cached, cli: retry, via: "cached-worktree", sha: M04_SHA };
    const err = new Error(`cannot materialize M04 worktree: ${added.stderr || added.stdout}`);
    err.code = "m04-engine-missing";
    throw err;
  }
  const cli = cliFromRoot(cached);
  if (!cli) {
    const err = new Error(`M04 worktree missing ${M04_CLI_REL}`);
    err.code = "m04-engine-missing";
    throw err;
  }
  return { repoRoot: cached, cli, via: "fetched-worktree", sha: M04_SHA };
}
