import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { trialRefuse, trialTransport } from "./errors.mjs";

function gitToplevel(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) return dir;
  return String(r.stdout).trim();
}

function git(repoRoot, args, { encoding = null, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return spawnSync("git", ["-C", gitToplevel(repoRoot), ...args], {
    encoding,
    maxBuffer,
  });
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function ensureGitObject(repoRoot, sha) {
  const probe = git(repoRoot, ["cat-file", "-t", sha], { encoding: "utf8" });
  if (probe.status === 0 && String(probe.stdout).trim() === "commit") return;
  const fetched = git(repoRoot, ["fetch", "--no-tags", "origin", sha], { encoding: "utf8" });
  if (fetched.status !== 0) {
    throw trialTransport(
      "git-object-missing",
      `git object ${sha} is not in this checkout and fetch failed`,
      { sha, stderr: String(fetched.stderr || "").slice(0, 500) },
    );
  }
  const again = git(repoRoot, ["cat-file", "-t", sha], { encoding: "utf8" });
  if (again.status !== 0) {
    throw trialTransport("git-object-missing", `git object ${sha} still missing after fetch`, { sha });
  }
}

export function gitShowFile(repoRoot, sha, filePath) {
  ensureGitObject(repoRoot, sha);
  const r = git(repoRoot, ["show", `${sha}:${filePath}`]);
  if (r.status !== 0) {
    throw trialRefuse(
      "git-path-missing",
      `git show ${sha}:${filePath} failed`,
      { sha, filePath, stderr: String(r.stderr || "").slice(0, 500) },
    );
  }
  return Buffer.from(r.stdout);
}

export function stageLockPair({ repoRoot, beforeRef, afterRef, lockPath, destDir }) {
  mkdirSync(join(destDir, "before"), { recursive: true });
  mkdirSync(join(destDir, "after"), { recursive: true });
  const beforeBytes = gitShowFile(repoRoot, beforeRef, lockPath);
  const afterBytes = gitShowFile(repoRoot, afterRef, lockPath);
  const beforePath = join(destDir, "before", "package-lock.json");
  const afterPath = join(destDir, "after", "package-lock.json");
  writeFileSync(beforePath, beforeBytes);
  writeFileSync(afterPath, afterBytes);
  return {
    beforePath,
    afterPath,
    beforeSha256: sha256Bytes(beforeBytes),
    afterSha256: sha256Bytes(afterBytes),
    beforeBytes: beforeBytes.length,
    afterBytes: afterBytes.length,
  };
}

export function stageCopiedFiles({ beforePath, afterPath, destDir }) {
  if (!existsSync(beforePath)) {
    throw trialRefuse("missing-input-file", `before not found: ${beforePath}`, { path: beforePath });
  }
  if (!existsSync(afterPath)) {
    throw trialRefuse("missing-input-file", `after not found: ${afterPath}`, { path: afterPath });
  }
  mkdirSync(destDir, { recursive: true });
  return { beforePath, afterPath };
}
