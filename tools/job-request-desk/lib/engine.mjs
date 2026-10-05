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
import { refuse } from "./refuse.mjs";
import { runViaSds52 } from "./sds52.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cacheRoot() {
  return join(tmpdir(), `sds-job-request-desk-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

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
    throw refuse("engine-extract-timeout", "timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
      if (buf.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
        throw refuse(
          "engine-pin-mismatch",
          `useful-jobs archive size ${buf.length} != ${USEFUL_JOBS_ARCHIVE_BYTES}`,
          { bytes: buf.length, expected: USEFUL_JOBS_ARCHIVE_BYTES },
        );
      }
      const digest = sha256Bytes(buf);
      if (digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
        throw refuse(
          "engine-pin-mismatch",
          `useful-jobs archive sha256 ${digest} != ${USEFUL_JOBS_ARCHIVE_SHA256}`,
          { sha256: digest, expected: USEFUL_JOBS_ARCHIVE_SHA256 },
        );
      }
      const tar = spawnSync("tar", ["-xzf", USEFUL_JOBS_ARCHIVE_PATH, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) throw refuse("engine-extract-failed", tar.stderr || "tar extract failed");
    }
    writeFileSync(ready, `${USEFUL_JOBS_ARCHIVE_SHA256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function runEngineJob(jobId, opts = {}) {
  return runViaSds52(jobId, opts);
}
