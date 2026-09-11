import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { ENGINE_BIN_REL, ENGINE_TREE_PATH, KIT_ROOT, loadPins } from "./pins.mjs";

export class IncompleteEngine extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "IncompleteEngine";
    this.code = code;
    this.detail = detail;
  }
}

export function engineBin(engineRoot) {
  return join(engineRoot, ENGINE_BIN_REL);
}

export function findGitDir(start = KIT_ROOT) {
  let cur = resolve(start);
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(cur, ".git"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export function stageEngine({
  dest,
  env = process.env,
  gitDir = env.M15_SDS_GIT || findGitDir(),
  sha = loadPins().m02.sha,
} = {}) {
  if (env.M15_ENGINE_ROOT) {
    const root = resolve(String(env.M15_ENGINE_ROOT));
    const bin = engineBin(root);
    if (!existsSync(bin)) {
      throw new IncompleteEngine("missing-engine", "M15_ENGINE_ROOT does not contain bin/webhook-drift.mjs", {
        root,
        bin,
      });
    }
    return { root, method: "env", sha: env.M15_ENGINE_SHA || sha, bin };
  }

  if (!dest) {
    throw new IncompleteEngine("missing-stage-dest", "stageEngine requires dest when M15_ENGINE_ROOT is unset");
  }
  if (!gitDir) {
    throw new IncompleteEngine("missing-git-dir", "Cannot locate samedaydesk git dir to archive the M02 pin");
  }
  if (!sha) {
    throw new IncompleteEngine("missing-engine-sha", "M02 sha pin is required");
  }

  const resolvedDest = resolve(dest);
  mkdirSync(resolvedDest, { recursive: true });
  const archive = spawnSync("git", ["-C", gitDir, "archive", sha, ENGINE_TREE_PATH], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
  });
  if (archive.status !== 0) {
    throw new IncompleteEngine("engine-archive-failed", "git archive of the M02 pin failed", {
      sha,
      gitDir,
      status: archive.status,
      stderr: String(archive.stderr || archive.stdout || "").slice(0, 500),
    });
  }

  rmSync(join(resolvedDest, ENGINE_TREE_PATH), { recursive: true, force: true });
  const tar = spawnSync("tar", ["-x", "-C", resolvedDest], {
    input: archive.stdout,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (tar.status !== 0) {
    throw new IncompleteEngine("engine-extract-failed", "tar extract of the M02 pin failed", {
      stderr: String(tar.stderr || "").slice(0, 500),
    });
  }

  const root = join(resolvedDest, ENGINE_TREE_PATH);
  const bin = engineBin(root);
  if (!existsSync(bin)) {
    throw new IncompleteEngine("missing-engine", "Staged M02 tree is missing bin/webhook-drift.mjs", {
      root,
      bin,
      sha,
    });
  }
  return { root, method: "git-archive", sha, bin, gitDir };
}
