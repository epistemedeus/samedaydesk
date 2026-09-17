import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { USEFUL_JOBS_PIN } from "./paths.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureUsefulJobsKit(root) {
  const archive = join(root, USEFUL_JOBS_PIN.archive);
  if (!existsSync(archive)) {
    const error = new Error("useful_jobs_archive_missing");
    error.detail = { archive };
    throw error;
  }
  const buf = readFileSync(archive);
  if (buf.length !== USEFUL_JOBS_PIN.bytes) {
    const error = new Error("useful_jobs_archive_bytes");
    error.detail = { bytes: buf.length, expected: USEFUL_JOBS_PIN.bytes };
    throw error;
  }
  const digest = sha256File(archive);
  if (digest !== USEFUL_JOBS_PIN.sha256) {
    const error = new Error("useful_jobs_archive_sha");
    error.detail = { sha256: digest, expected: USEFUL_JOBS_PIN.sha256 };
    throw error;
  }
  const destRoot = join(tmpdir(), `sds-corpus-${USEFUL_JOBS_PIN.version}`);
  const kit = join(destRoot, USEFUL_JOBS_PIN.rootName);
  const cli = join(kit, "bin/useful-jobs.mjs");
  if (!existsSync(cli)) {
    mkdirSync(destRoot, { recursive: true });
    const tar = spawnSync("tar", ["-xzf", archive, "-C", destRoot], { encoding: "utf8" });
    if (tar.status !== 0) {
      const error = new Error("useful_jobs_extract_failed");
      error.detail = { stderr: tar.stderr };
      throw error;
    }
  }
  if (!existsSync(cli)) {
    throw new Error("useful_jobs_cli_missing");
  }
  if (kit.startsWith(root)) {
    throw new Error("useful_jobs_extract_inside_repo");
  }
  return kit;
}
