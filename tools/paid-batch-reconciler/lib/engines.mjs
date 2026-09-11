import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
} from "./pins.mjs";
import { sha256Bytes } from "./digest.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cacheRoot() {
  return join(tmpdir(), `sds-paid-batch-reconciler-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

/**
 * Extract the committed public useful-jobs archive (PR51). Reuses engines.
 */
export function ensureUsefulJobsKit() {
  const dest = cacheRoot();
  const kit = kitPath(dest);
  const ready = join(dest, ".ready");
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (existsSync(ready) && existsSync(cli)) return kit;

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (existsSync(ready) && existsSync(cli)) return kit;
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (existsSync(cli)) return kit;
    throw new Error("timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
      if (buf.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
        throw new Error(`useful-jobs archive size ${buf.length} != ${USEFUL_JOBS_ARCHIVE_BYTES}`);
      }
      const digest = sha256Bytes(buf);
      if (digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
        throw new Error(`useful-jobs archive sha256 ${digest} != ${USEFUL_JOBS_ARCHIVE_SHA256}`);
      }
      const tar = spawnSync("tar", ["-xzf", USEFUL_JOBS_ARCHIVE_PATH, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
    }
    writeFileSync(ready, `${USEFUL_JOBS_ARCHIVE_SHA256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function parseEngineJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function runEngineJob(engineId, { files = {}, example = false, outDir, timeoutMs = 120_000 } = {}) {
  const kit = ensureUsefulJobsKit();
  const cli = join(kit, USEFUL_JOBS_CLI);
  const args = ["run", engineId];
  if (example) args.push("--example");
  else {
    for (const [key, filePath] of Object.entries(files)) {
      if (!filePath) continue;
      args.push(`--${key}`, filePath);
    }
  }
  if (outDir) args.push("--out-dir", outDir);

  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: kit,
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: parseEngineJson(result.stdout),
    kit,
    cli,
    args,
    runner: "useful-jobs",
  };
}
