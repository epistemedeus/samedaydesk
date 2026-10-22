import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ARCHIVE_META_PATH, ARCHIVE_PATH } from "./paths.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function loadArchiveMeta() {
  const meta = JSON.parse(readFileSync(ARCHIVE_META_PATH, "utf8"));
  if (!meta?.sha256 || !meta?.bytes || !meta?.name) {
    throw new Error("committed useful-jobs archive meta missing sha256/bytes/name");
  }
  return meta;
}

/**
 * Extract the committed public useful-jobs archive into a temp cache.
 * Spawn the packaged CLI as a black-box; do not import engines.
 */
export function extractCommittedKit() {
  const meta = loadArchiveMeta();
  const dest = join(tmpdir(), `v6-useful-jobs-${meta.sha256.slice(0, 16)}`);
  const kit = join(dest, meta.name);
  const cli = join(kit, "bin/useful-jobs.mjs");
  const ready = join(dest, ".ready");
  if (existsSync(ready) && existsSync(cli)) return { kit, cli, meta };

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (existsSync(ready) && existsSync(cli)) return { kit, cli, meta };
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (existsSync(ready) && existsSync(cli)) return { kit, cli, meta };
    throw new Error("timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!(existsSync(ready) && existsSync(cli))) {
      if (existsSync(kit)) rmSync(kit, { recursive: true, force: true });
      rmSync(ready, { force: true });
      const buf = readFileSync(ARCHIVE_PATH);
      if (buf.length !== meta.bytes) {
        throw new Error(`useful-jobs archive size ${buf.length} != ${meta.bytes}`);
      }
      const digest = sha256(buf);
      if (digest !== meta.sha256) {
        throw new Error(`useful-jobs archive sha256 ${digest} != ${meta.sha256}`);
      }
      const tar = spawnSync("tar", ["-xzf", ARCHIVE_PATH, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
      if (!existsSync(cli)) throw new Error("useful-jobs extract missing CLI");
      writeFileSync(ready, `${meta.sha256}\n`);
    }
    return { kit, cli, meta };
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function runUsefulJobs(args, { cwd, timeoutMs = 120_000 } = {}) {
  const { kit, cli } = extractCommittedKit();
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: cwd || kit,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env },
  });
}
