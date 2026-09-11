import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CACHE_ROOT, REPO_ROOT } from "./paths.mjs";
import { mkdirSync, rmSync } from "node:fs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ownedPath(engine) {
  return String(engine.pin.ownedPath).replace(/\/+$/, "");
}

function fetchSha(sha) {
  let delay = 4000;
  let last = null;
  for (let i = 0; i < 4; i += 1) {
    const result = spawnSync("git", ["fetch", "--depth", "1", "origin", sha], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (result.status === 0) return;
    last = result.stderr || result.stdout || `git fetch exit ${result.status}`;
    sleep(delay);
    delay *= 2;
  }
  throw new Error(`git fetch of engine pin ${sha} failed: ${last}`);
}

function archiveOwnedPath(sha, path, dest) {
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync("git", ["archive", sha, path], {
    cwd: REPO_ROOT,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    throw new Error(archive.stderr?.toString() || `git archive ${sha} ${path} failed`);
  }
  const tar = spawnSync("tar", ["-x", "-C", dest], {
    input: archive.stdout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (tar.status !== 0) {
    throw new Error(tar.stderr?.toString() || "tar extract of engine pin failed");
  }
}

function envRoots() {
  const raw = process.env.W5_M01_ENGINE_ROOTS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("W5_M01_ENGINE_ROOTS must be a JSON object of engine id to directory");
  }
}

export function engineBin(engine, root) {
  return join(root, engine.cli.relativeBin);
}

export function inTreeEngineRoot(engine) {
  return join(REPO_ROOT, ownedPath(engine));
}

export function ensureEngineRoot(engine) {
  const mapped = envRoots()[engine.id];
  if (mapped) {
    const bin = engineBin(engine, mapped);
    if (!existsSync(bin)) {
      throw new Error(`W5_M01_ENGINE_ROOTS[${engine.id}] missing ${engine.cli.relativeBin}`);
    }
    return { root: mapped, source: "env", sha: engine.pin.sha };
  }

  const inTree = inTreeEngineRoot(engine);
  const inTreeBin = engineBin(engine, inTree);
  if (existsSync(inTreeBin)) {
    return { root: inTree, source: "in-tree", sha: engine.pin.sha };
  }

  const dest = join(CACHE_ROOT, engine.pin.sha);
  const root = join(dest, ownedPath(engine));
  const bin = engineBin(engine, root);
  if (existsSync(bin)) {
    return { root, source: "git-archive-cache", sha: engine.pin.sha };
  }

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  try {
    archiveOwnedPath(engine.pin.sha, ownedPath(engine), dest);
  } catch {
    fetchSha(engine.pin.sha);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    archiveOwnedPath(engine.pin.sha, ownedPath(engine), dest);
  }
  if (!existsSync(bin)) {
    throw new Error(`engine pin ${engine.pin.sha} did not materialize ${engine.cli.relativeBin}`);
  }
  return { root, source: "git-archive", sha: engine.pin.sha };
}
