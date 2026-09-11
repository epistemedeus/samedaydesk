import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { REPO_ROOT } from "./paths.mjs";

export const D01_SHA = "6bed72dd22a396134aa5c957933b42c3a5746698";
export const D01_KERNEL_SHA = "bccf34b3816ebe20d43823d0978308fd10f9bb33";
export const D01_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";

function git(args, cwd = REPO_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 120_000 });
}

function worktreeHead(root) {
  const result = git(["rev-parse", "HEAD"], root);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

export function ensureD01Root() {
  if (process.env.W5_D01_ROOT) {
    const root = process.env.W5_D01_ROOT;
    if (!existsSync(join(root, "server/paid-useful-jobs/lib/wrapper.mjs"))) {
      throw new Error(`W5_D01_ROOT missing D01 wrapper at ${root}`);
    }
    return { root, source: "env", sha: worktreeHead(root) || "unverified-env" };
  }

  const existing = join(tmpdir(), "w5-m01-ro", "d01");
  if (existsSync(join(existing, "server/paid-useful-jobs/lib/wrapper.mjs"))) {
    const sha = worktreeHead(existing);
    if (!sha || sha === D01_SHA) {
      return { root: existing, source: "worktree", sha: sha || D01_SHA };
    }
  }

  const dest = join(tmpdir(), `w5-m01-d01-${D01_SHA.slice(0, 12)}`);
  if (!existsSync(join(dest, "server/paid-useful-jobs/lib/wrapper.mjs"))) {
    const type = git(["cat-file", "-t", D01_SHA]);
    if (type.status !== 0) {
      const fetched = git(["fetch", "origin", D01_SHA]);
      if (fetched.status !== 0) {
        throw new Error(`incomplete: cannot fetch D01 ${D01_SHA}: ${fetched.stderr}`);
      }
    }
    mkdirSync(tmpdir(), { recursive: true });
    const added = git(["worktree", "add", "--detach", dest, D01_SHA]);
    if (added.status !== 0 && !existsSync(join(dest, "server/paid-useful-jobs/lib/wrapper.mjs"))) {
      throw new Error(`incomplete: cannot materialize D01 worktree: ${added.stderr}`);
    }
  }
  return { root: dest, source: "worktree", sha: D01_SHA };
}

export async function importD01(root = ensureD01Root().root) {
  const base = join(root, "server/paid-useful-jobs");
  const [wrapper, jobs, contract, index] = await Promise.all([
    import(pathToFileURL(join(base, "lib/wrapper.mjs")).href),
    import(pathToFileURL(join(base, "lib/jobs.mjs")).href),
    import(pathToFileURL(join(base, "lib/contract.mjs")).href),
    import(pathToFileURL(join(base, "index.mjs")).href),
  ]);
  return { root, wrapper, jobs, contract, index };
}
