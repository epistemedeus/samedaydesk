import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pin from "../PIN.json" with { type: "json" };

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PKG_ROOT = join(HERE, "..");

export function enginePin() {
  return pin.engine;
}

export function incomplete(message) {
  const err = new Error(message);
  err.code = "engine-incomplete";
  return err;
}

function git(args, cwd) {
  return spawnSync("git", args, { encoding: "utf8", cwd, timeout: 120_000 });
}

function repoRoot() {
  const r = git(["rev-parse", "--show-toplevel"], PKG_ROOT);
  if (r.status !== 0) {
    throw incomplete(`git repo required to fetch Co11 ${pin.engine.sha}: ${(r.stderr || r.stdout || "").trim()}`);
  }
  return r.stdout.trim();
}

function binPath(engineRoot) {
  return join(engineRoot, "bin/lockfile-delta.mjs");
}

function libIndex(engineRoot) {
  return join(engineRoot, "lib/index.mjs");
}

export function assertEngineTree(engineRoot, { requirePinSha = true } = {}) {
  if (!existsSync(binPath(engineRoot))) {
    throw incomplete(`Co11 CLI missing at ${binPath(engineRoot)}. Engine is incomplete, not a skipped pass.`);
  }
  if (!existsSync(libIndex(engineRoot))) {
    throw incomplete(`Co11 lib/index.mjs missing at ${engineRoot}`);
  }
  if (requirePinSha) {
    const head = git(["rev-parse", "HEAD"], engineRoot);
    if (head.status !== 0 || head.stdout.trim() !== pin.engine.sha) {
      throw incomplete(
        `engine HEAD ${String(head.stdout || "").trim() || "unknown"} is not pin ${pin.engine.sha}`,
      );
    }
  }
  return engineRoot;
}

function existingWorktree(sha) {
  const candidates = [
    join(tmpdir(), `w5-m07-engine-${sha.slice(0, 12)}`, "tools/lockfile-pin-delta"),
    join(tmpdir(), "w5-m07-readonly/co11-e81efc8", "tools/lockfile-pin-delta"),
  ];
  for (const root of candidates) {
    if (!existsSync(binPath(root))) continue;
    const head = git(["rev-parse", "HEAD"], root);
    if (head.status === 0 && head.stdout.trim() === sha) return root;
  }
  return null;
}

export function ensureEngineRoot() {
  const sha = pin.engine.sha;
  if (process.env.LOCKFILE_PIN_DELTA_ROOT) {
    return assertEngineTree(process.env.LOCKFILE_PIN_DELTA_ROOT);
  }
  if (process.env.W5_M07_ENGINE_ROOT) {
    return assertEngineTree(process.env.W5_M07_ENGINE_ROOT);
  }

  const already = existingWorktree(sha);
  if (already) return assertEngineTree(already);

  const repo = repoRoot();
  const dest = join(tmpdir(), `w5-m07-engine-${sha.slice(0, 12)}`);
  const engineRoot = join(dest, "tools/lockfile-pin-delta");
  if (existsSync(binPath(engineRoot))) return assertEngineTree(engineRoot);

  const fetch = git(["fetch", "--depth", "1", "origin", sha], repo);
  if (fetch.status !== 0) {
    throw incomplete(`fetch of Co11 ${sha} failed: ${(fetch.stderr || fetch.stdout || "").trim()}`);
  }

  if (!existsSync(dest)) {
    const add = git(["worktree", "add", "--detach", dest, sha], repo);
    if (add.status !== 0) {
      throw incomplete(`worktree add for Co11 ${sha} failed: ${(add.stderr || add.stdout || "").trim()}`);
    }
  }

  const head = git(["rev-parse", "HEAD"], dest);
  if (head.status !== 0 || head.stdout.trim() !== sha) {
    throw incomplete(`engine worktree HEAD ${head.stdout.trim()} is not pin ${sha}`);
  }
  return assertEngineTree(engineRoot);
}

export function engineCliPath() {
  return binPath(ensureEngineRoot());
}

export function engineLibIndexPath() {
  return libIndex(ensureEngineRoot());
}
