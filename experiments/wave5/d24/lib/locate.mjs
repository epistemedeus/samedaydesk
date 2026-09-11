import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PINS, sdsRepoRootFromHere } from "./pins.mjs";

const FETCH_DELAYS_MS = [4000, 8000, 16000, 32000];

export function defaultTreeCache() {
  return process.env.W5_D24_TREE_CACHE || join(tmpdir(), "w5-d24-consumer-trees");
}

export function sdsRepoRoot() {
  return process.env.SAMEDAYDESK_CHECKOUT || sdsRepoRootFromHere();
}

function git(repo, args, extra = {}) {
  return spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...extra,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fetchSha(repo, sha) {
  const have = git(repo, ["cat-file", "-t", sha]);
  if (have.status === 0 && String(have.stdout).trim() === "commit") return true;
  for (const delay of FETCH_DELAYS_MS) {
    const fetched = git(repo, ["fetch", "--depth=1", "origin", sha]);
    if (fetched.status === 0) return true;
    sleep(delay);
  }
  return false;
}

export function existingWorktreeForSha(repo, sha) {
  const listed = git(repo, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return null;
  const blocks = String(listed.stdout).split("\n\n");
  for (const block of blocks) {
    const worktree = block.match(/^worktree (.+)$/m)?.[1];
    const head = block.match(/^HEAD ([0-9a-f]{40})$/m)?.[1];
    if (worktree && head === sha && existsSync(worktree)) return worktree;
  }
  return null;
}

/**
 * Read-only sibling tree for one exact SHA. Copies happen at install time;
 * this consumer does not commit those trees.
 */
export function ensurePinnedTree({ sha, envKey, fallbackPaths = [] }) {
  if (envKey && process.env[envKey] && existsSync(process.env[envKey])) {
    return process.env[envKey];
  }
  for (const path of fallbackPaths) {
    if (path && existsSync(path)) return path;
  }
  const repo = sdsRepoRoot();
  const already = existingWorktreeForSha(repo, sha);
  if (already) return already;
  if (!fetchSha(repo, sha)) {
    throw new Error(`missing git object ${sha}; fetch from origin failed`);
  }
  const dest = join(defaultTreeCache(), sha);
  if (existsSync(dest)) {
    const head = git(dest, ["rev-parse", "HEAD"]);
    if (head.status === 0 && String(head.stdout).trim() === sha) return dest;
  }
  mkdirSync(defaultTreeCache(), { recursive: true });
  if (existsSync(dest)) {
    const head = git(dest, ["rev-parse", "HEAD"]);
    if (head.status === 0 && String(head.stdout).trim() === sha) return dest;
  }
  const added = git(repo, ["worktree", "add", "--detach", dest, sha]);
  if (added.status !== 0) {
    const head = existsSync(dest) ? git(dest, ["rev-parse", "HEAD"]) : null;
    if (head && head.status === 0 && String(head.stdout).trim() === sha) return dest;
    throw new Error(`git worktree add ${sha} failed: ${added.stderr || added.stdout}`);
  }
  return dest;
}

export function siblingTrees() {
  const fallbackRoot = "/tmp/w5-d24-readonly";
  return {
    d01: ensurePinnedTree({
      sha: PINS.tested.d01.sha,
      envKey: "W5_D01_TREE",
      fallbackPaths: [join(fallbackRoot, "d01")],
    }),
    d07: ensurePinnedTree({
      sha: PINS.tested.d07.sha,
      envKey: "W5_D07_TREE",
      fallbackPaths: [join(fallbackRoot, "d07")],
    }),
    d08: ensurePinnedTree({
      sha: PINS.tested.d08.sha,
      envKey: "W5_D08_TREE",
      fallbackPaths: [join(fallbackRoot, "co14")],
    }),
  };
}

export function pinAssetPaths(repoRoot = sdsRepoRoot()) {
  return {
    archive: join(repoRoot, PINS.archive.rel),
    catalog: join(repoRoot, PINS.archive.catalogRel),
    kit: join(repoRoot, PINS.archive.kitRel),
  };
}

export function requirePinAssets(repoRoot = sdsRepoRoot()) {
  const assets = pinAssetPaths(repoRoot);
  for (const [name, path] of Object.entries(assets)) {
    if (!existsSync(path)) throw new Error(`missing pin asset ${name} at ${path}`);
  }
  const buf = readFileSync(assets.archive);
  if (buf.length !== PINS.archive.bytes) {
    throw new Error(`archive bytes ${buf.length} != ${PINS.archive.bytes}`);
  }
  return assets;
}
