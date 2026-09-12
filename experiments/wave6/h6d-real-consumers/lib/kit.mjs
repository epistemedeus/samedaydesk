import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const EXPERIMENT_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(EXPERIMENT_ROOT, "../../..");

export const USEFUL_JOBS = Object.freeze({
  version: "1.4.0",
  archiveRel: "client/public/kit/useful-jobs-1.4.0.tar.gz",
  mirrorRel: "client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
  sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
  bytes: 2575215,
  rootName: "useful-jobs-1.4.0",
  cliRel: "bin/useful-jobs.mjs",
});

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function publishedArchivePath(repoRoot = REPO_ROOT) {
  return join(repoRoot, USEFUL_JOBS.archiveRel);
}

export function verifyPublishedArchive(repoRoot = REPO_ROOT) {
  const archive = publishedArchivePath(repoRoot);
  const mirror = join(repoRoot, USEFUL_JOBS.mirrorRel);
  if (!existsSync(archive)) {
    const err = new Error(`missing published archive ${archive}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(archive);
  if (st.size !== USEFUL_JOBS.bytes) {
    const err = new Error(`archive bytes ${st.size} != ${USEFUL_JOBS.bytes}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== USEFUL_JOBS.sha256) {
    const err = new Error(`archive sha256 ${digest} != ${USEFUL_JOBS.sha256}`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  if (existsSync(mirror)) {
    const mst = statSync(mirror);
    const mdig = sha256File(mirror);
    if (mst.size !== st.size || mdig !== digest) {
      const err = new Error("kit archive and for-agents mirror are not byte-identical");
      err.code = "archive-mirror-mismatch";
      throw err;
    }
  }
  return { archive, digest, bytes: st.size, version: USEFUL_JOBS.version };
}

export function extractKit({ destDir, repoRoot = REPO_ROOT } = {}) {
  const verified = verifyPublishedArchive(repoRoot);
  const dest = resolve(destDir);
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xzf", verified.archive, "-C", dest], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const err = new Error(`tar extract failed: ${r.stderr || r.status}`);
    err.code = "extract-failed";
    throw err;
  }
  const root = join(dest, USEFUL_JOBS.rootName);
  const cli = join(root, USEFUL_JOBS.cliRel);
  if (!existsSync(cli)) {
    const err = new Error(`extracted kit missing ${cli}`);
    err.code = "extract-incomplete";
    throw err;
  }
  return { ...verified, root, cli };
}

export function runUsefulJob({
  cli,
  jobId,
  args = [],
  cwd,
  timeoutMs = 60_000,
} = {}) {
  const env = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=768",
  };
  const r = spawnSync(process.execPath, [cli, "run", jobId, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  let stdoutJson = null;
  const text = String(r.stdout || "").trim();
  if (text) {
    try {
      stdoutJson = JSON.parse(text);
    } catch {
      stdoutJson = null;
    }
  }
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function removeDir(path) {
  rmSync(path, { recursive: true, force: true });
}
