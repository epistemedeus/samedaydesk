import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { D09_SHA, REPO_ROOT } from "./repo.mjs";
import { parseJsonStdout, runNode } from "./spawn.mjs";

export const D09_BINDER_REL = "tools/repeat-job-binder";
export const D09_CLI_REL = "tools/repeat-job-binder/bin/bind.mjs";

function binderFromRoot(root) {
  if (!root) return null;
  const abs = resolve(root);
  if (existsSync(join(abs, "bin/bind.mjs"))) return abs;
  if (existsSync(join(abs, D09_CLI_REL))) return join(abs, D09_BINDER_REL);
  return null;
}

function fetchD09Worktree(dest) {
  const fetch = spawnSync("git", ["fetch", "origin", D09_SHA], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (fetch.status !== 0) {
    throw new Error(`git fetch D09 ${D09_SHA} failed: ${fetch.stderr || fetch.status}`);
  }
  if (existsSync(join(dest, D09_CLI_REL))) return;
  const add = spawnSync("git", ["worktree", "add", "--detach", dest, D09_SHA], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (add.status !== 0 && !existsSync(join(dest, D09_CLI_REL))) {
    throw new Error(`git worktree add D09 failed: ${add.stderr || add.stdout || add.status}`);
  }
}

/**
 * Locate the pinned D09 binder without copying it into ownedPaths.
 * Missing binder is an incomplete dependency, not a passing skip.
 */
export function ensureD09Binder() {
  const fromEnv = binderFromRoot(process.env.W5_D09_ROOT);
  if (fromEnv) return { root: fromEnv, sha: D09_SHA, source: "env" };
  const dest = process.env.W5_D09_WORKTREE || join(tmpdir(), "w5-d25-readonly-d09");
  if (!existsSync(join(dest, D09_CLI_REL))) {
    fetchD09Worktree(dest);
  }
  const root = binderFromRoot(dest);
  if (!root) {
    throw new Error(`D09 binder missing after fetch at ${dest}; dependency incomplete`);
  }
  return { root, sha: D09_SHA, source: "worktree", worktree: dest };
}

export function runD09Bind({
  ticket,
  before,
  after,
  used,
  declareAfterSha256,
  outDir,
  inputRoot,
  usefulJobsRoot,
  engine = "catalog",
  extraArgs = [],
} = {}) {
  const binder = ensureD09Binder();
  const cli = join(binder.root, "bin/bind.mjs");
  const args = [
    cli,
    "--ticket",
    resolve(ticket),
    "--before",
    resolve(before),
    "--after",
    resolve(after),
    "--declare-after-sha256",
    String(declareAfterSha256),
    "--engine",
    engine,
  ];
  if (used) args.push("--used", resolve(used));
  if (inputRoot) args.push("--input-root", resolve(inputRoot));
  if (outDir) args.push("--out-dir", resolve(outDir));
  if (usefulJobsRoot) args.push("--useful-jobs-root", resolve(usefulJobsRoot));
  args.push(...extraArgs);
  const proc = runNode(args, { cwd: binder.root });
  const parsed = parseJsonStdout(proc);
  return { binder, proc, parsed, args };
}
