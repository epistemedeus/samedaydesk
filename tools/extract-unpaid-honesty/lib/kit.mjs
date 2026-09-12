import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REPO_ROOT,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_REL,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
} from "./pins.mjs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function archivePath(repoRoot = REPO_ROOT) {
  return join(repoRoot, USEFUL_JOBS_ARCHIVE_REL);
}

export function verifyArchive(repoRoot = REPO_ROOT) {
  const path = archivePath(repoRoot);
  const buf = readFileSync(path);
  if (buf.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
    throw new Error(`useful-jobs archive size ${buf.length} != ${USEFUL_JOBS_ARCHIVE_BYTES}`);
  }
  const digest = sha256Bytes(buf);
  if (digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
    throw new Error(`useful-jobs archive sha256 ${digest} != ${USEFUL_JOBS_ARCHIVE_SHA256}`);
  }
  return { path, bytes: buf.length, sha256: digest };
}

export function ensureUsefulJobsKit(repoRoot = REPO_ROOT) {
  const pin = verifyArchive(repoRoot);
  const dest = join(tmpdir(), `sds-honesty-uj-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 16)}`);
  const kit = join(dest, USEFUL_JOBS_ROOT_NAME);
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (!existsSync(cli)) {
    mkdirSync(dest, { recursive: true });
    const tar = spawnSync("tar", ["-xzf", pin.path, "-C", dest], { encoding: "utf8" });
    if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
    if (!existsSync(cli)) throw new Error(`missing ${USEFUL_JOBS_CLI} after extract`);
  }

  const extractedCliSha256 = existsSync(cli) ? sha256Bytes(readFileSync(cli)) : null;
  return {
    kit,
    cli,
    cacheKind: "shared-tmpdir",
    cacheMutable: true,
    archiveVerified: true,
    extractedContentsVerified: false,
    extractedCliSha256,
    ...pin,
  };
}
