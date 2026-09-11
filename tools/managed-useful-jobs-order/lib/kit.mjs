import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "./digest.mjs";
import { USEFUL_JOBS_CLI, USEFUL_JOBS_ROOT_NAME, loadPins } from "./pins.mjs";
import { OrderRefuse } from "./errors.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function verifyArchiveFile(pins = loadPins()) {
  if (!existsSync(pins.archivePath)) {
    throw new OrderRefuse("archive-missing", `useful-jobs archive is not at ${pins.archivePath}`, {
      falsifier: "F-PIN",
    });
  }
  const buf = readFileSync(pins.archivePath);
  const digest = sha256Bytes(buf);
  if (buf.length !== pins.archiveBytes || digest !== pins.archiveSha256) {
    throw new OrderRefuse(
      "f-pin",
      "on-disk archive sha256/bytes do not match the published useful-jobs pin",
      {
        falsifier: "F-PIN",
        detail: {
          path: pins.archivePath,
          actual: { sha256: digest, bytes: buf.length },
          expected: { sha256: pins.archiveSha256, bytes: pins.archiveBytes },
        },
      },
    );
  }
  return { sha256: digest, bytes: buf.length };
}

export function cacheRoot(pins = loadPins()) {
  return join(tmpdir(), `sds-managed-useful-jobs-${pins.archiveSha256.slice(0, 16)}`);
}

export function kitPath(root, pins = loadPins()) {
  return join(root, pins.rootName || USEFUL_JOBS_ROOT_NAME);
}

/**
 * Extract the committed public useful-jobs archive. Reuses engines; does not reimplement jobs.
 */
export function ensureUsefulJobsKit(pins = loadPins()) {
  verifyArchiveFile(pins);
  const dest = cacheRoot(pins);
  const kit = kitPath(dest, pins);
  const ready = join(dest, ".ready");
  const cli = join(kit, pins.cli || USEFUL_JOBS_CLI);
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
    throw new OrderRefuse("kit-extract-timeout", "timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const tar = spawnSync("tar", ["-xzf", pins.archivePath, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) {
        throw new OrderRefuse("kit-extract-failed", tar.stderr || "tar extract failed");
      }
    }
    if (!existsSync(cli)) {
      throw new OrderRefuse("kit-cli-missing", `extracted kit missing ${pins.cli}`);
    }
    writeFileSync(ready, `${pins.archiveSha256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function hashBuffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
