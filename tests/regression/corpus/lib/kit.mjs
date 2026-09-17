import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./root.mjs";

export const USEFUL_JOBS_PIN = Object.freeze({
  version: "1.4.7",
  rootName: "useful-jobs-1.4.7",
  archive: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
});

export const USEFUL_JOBS_NEGATIVE_110 = Object.freeze({
  version: "1.1.0",
  archive: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  bytes: 2577606,
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureUsefulJobsKit() {
  const archive = join(REPO_ROOT, USEFUL_JOBS_PIN.archive);
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
    const tar = spawnSync("tar", ["-xzf", archive, "-C", destRoot], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (tar.status !== 0) {
      const error = new Error("useful_jobs_extract_failed");
      error.detail = { stderr: tar.stderr };
      throw error;
    }
  }
  if (!existsSync(cli)) {
    throw new Error("useful_jobs_cli_missing");
  }
  if (kit.startsWith(REPO_ROOT) || !kit.startsWith(`${destRoot}${sep}`)) {
    throw new Error("useful_jobs_extract_inside_repo");
  }
  return kit;
}
