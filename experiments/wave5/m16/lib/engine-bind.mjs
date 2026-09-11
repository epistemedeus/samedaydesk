import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ENGINE_CLI, ENGINE_PATH, ENGINE_SHA, REPO_ROOT } from "./pins.mjs";
import { ensureGitObject } from "./git-stage.mjs";
import { trialTransport } from "./errors.mjs";

function gitToplevel(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    throw trialTransport("git-object-missing", `cannot resolve git toplevel from ${dir}`, {
      stderr: String(r.stderr || "").slice(0, 500),
    });
  }
  return String(r.stdout).trim();
}

function gitArchive(repoRoot, sha, pathPrefix, dest) {
  mkdirSync(dest, { recursive: true });
  const top = gitToplevel(repoRoot);
  const archive = spawnSync("git", ["-C", top, "archive", sha, pathPrefix], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    throw trialTransport(
      "engine-source-missing",
      `git archive ${sha} ${pathPrefix} failed`,
      { sha, pathPrefix, stderr: String(archive.stderr || "").slice(0, 500) },
    );
  }
  const tar = spawnSync("tar", ["-x", "-C", dest], {
    input: archive.stdout,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (tar.status !== 0) {
    throw trialTransport("engine-extract-failed", "tar extract of engine pin failed", {
      stderr: String(tar.stderr || "").slice(0, 500),
    });
  }
}

export function engineCliPath(root) {
  return join(root, ENGINE_CLI);
}

export function materializePinnedEngine({
  repoRoot = REPO_ROOT,
  engineRoot = process.env.LOCKFILE_PIN_DELTA_ROOT,
  destRoot = join(tmpdir(), `sds-w5-m16-engine-${ENGINE_SHA.slice(0, 12)}`),
} = {}) {
  if (engineRoot) {
    const cli = engineCliPath(engineRoot);
    if (!existsSync(cli)) {
      throw trialTransport("engine-cli-missing", `engine CLI not found at ${cli}`, { engineRoot, cli });
    }
    return { root: engineRoot, source: "explicit-root", sha: ENGINE_SHA, cli };
  }

  const inTree = join(repoRoot, ENGINE_PATH.replace(/\/$/, ""));
  const inTreeCli = engineCliPath(inTree);
  if (existsSync(inTreeCli) && process.env.W5_M16_PREFER_INTREE === "1") {
    return { root: inTree, source: "in-tree", sha: ENGINE_SHA, cli: inTreeCli };
  }

  ensureGitObject(repoRoot, ENGINE_SHA);
  const dest = destRoot;
  const cli = join(dest, ENGINE_PATH, ENGINE_CLI);
  if (!existsSync(cli)) {
    rmSync(dest, { recursive: true, force: true });
    gitArchive(repoRoot, ENGINE_SHA, ENGINE_PATH.replace(/\/$/, ""), dest);
  }
  if (!existsSync(cli)) {
    throw trialTransport("engine-cli-missing", `engine CLI missing after archive: ${cli}`, { dest, cli });
  }
  return { root: join(dest, ENGINE_PATH.replace(/\/$/, "")), source: "git-archive", sha: ENGINE_SHA, cli };
}

export function runEngineCli({ cli, beforePath, afterPath, outDir, extraArgs = [], timeoutMs = 30_000 }) {
  const args = [cli, "--before", beforePath, "--after", afterPath, "--out-dir", outDir, ...extraArgs];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: join(cli, "..", ".."),
  });
  let json = null;
  const stdout = String(result.stdout || "").trim();
  if (stdout) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
    json,
    args,
  };
}
