import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replayRefuse } from "./args.mjs";
import { sha256Bytes } from "./digest.mjs";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
} from "./pins.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cacheRoot(archiveSha256 = USEFUL_JOBS_ARCHIVE_SHA256) {
  return join(tmpdir(), `sds-output-replay-harness-${archiveSha256.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

export function verifyArchiveBuffer(buf, { expectedBytes = USEFUL_JOBS_ARCHIVE_BYTES, expectedSha256 = USEFUL_JOBS_ARCHIVE_SHA256 } = {}) {
  if (buf.length !== expectedBytes) {
    throw replayRefuse("wrong-size", `useful-jobs archive size ${buf.length} != ${expectedBytes}`, {
      bytes: buf.length,
      expectedBytes,
    });
  }
  const digest = sha256Bytes(buf);
  if (digest !== expectedSha256) {
    throw replayRefuse("wrong-digest", `useful-jobs archive sha256 ${digest} != ${expectedSha256}`, {
      sha256: digest,
      expectedSha256,
    });
  }
  return digest;
}

export function fetchHttpBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(
          replayRefuse("bad-status", `archive HTTP status ${res.statusCode}`, {
            status: res.statusCode,
            url,
          }),
        );
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function extractArchive(archivePath, dest) {
  const tar = spawnSync("tar", ["-xzf", archivePath, "-C", dest], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw replayRefuse("extract-failed", tar.stderr || "tar extract failed", { archivePath, dest });
  }
}

/**
 * Extract the committed public useful-jobs archive. Reuses PR51 engines;
 * does not reimplement jobs.
 */
export function ensureUsefulJobsKit({
  archivePath = USEFUL_JOBS_ARCHIVE_PATH,
  expectedBytes = USEFUL_JOBS_ARCHIVE_BYTES,
  expectedSha256 = USEFUL_JOBS_ARCHIVE_SHA256,
  dest = cacheRoot(expectedSha256),
} = {}) {
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
    throw replayRefuse("extract-timeout", "timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const buf = readFileSync(archivePath);
      verifyArchiveBuffer(buf, { expectedBytes, expectedSha256 });
      extractArchive(archivePath, dest);
    }
    writeFileSync(ready, `${expectedSha256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export async function ensureUsefulJobsKitFromHttp({
  url,
  expectedBytes = USEFUL_JOBS_ARCHIVE_BYTES,
  expectedSha256 = USEFUL_JOBS_ARCHIVE_SHA256,
  dest = cacheRoot(`${expectedSha256}-http`),
} = {}) {
  const kit = kitPath(dest);
  const ready = join(dest, ".ready");
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (existsSync(ready) && existsSync(cli)) return kit;

  mkdirSync(dest, { recursive: true });
  const buf = await fetchHttpBuffer(url);
  verifyArchiveBuffer(buf, { expectedBytes, expectedSha256 });
  const archivePath = join(dest, "useful-jobs-1.0.0.tar.gz");
  writeFileSync(archivePath, buf);
  extractArchive(archivePath, dest);
  writeFileSync(ready, `${expectedSha256}\n`);
  return kit;
}
