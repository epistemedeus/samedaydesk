import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const PIN = JSON.parse(readFileSync(join(MODULE_ROOT, "PIN.json"), "utf8"));

const ARCHIVE_NAME = "useful-jobs-1.2.0.tar.gz";
const PACKAGE_DIR = "useful-jobs-1.2.0";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function kitUnavailable(reason) {
  const err = new Error(reason);
  err.code = "kit_unavailable";
  return err;
}

function looksLikeKit(root) {
  return existsSync(join(root, "bin", "useful-jobs.mjs")) && existsSync(join(root, "apps", "route-table-diff", "cli.mjs"));
}

function candidateArchives() {
  return [
    process.env.USEFUL_JOBS_ARCHIVE,
    "/tmp/readonly-worktrees/pr114-9ae0febd/client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz",
    "/tmp/readonly-worktrees/d01-46f2b7f/client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz",
  ].filter(Boolean);
}

function candidateRoots() {
  return [process.env.USEFUL_JOBS_KIT_ROOT, "/tmp/w5-m08-kit/extract/useful-jobs-1.2.0"].filter(Boolean);
}

function extractArchive(archive) {
  const dest = join(tmpdir(), "w5-m08-final-engine-inputs-kit");
  const root = join(dest, PACKAGE_DIR);
  if (!looksLikeKit(root)) {
    mkdirSync(dest, { recursive: true });
    const result = spawnSync("tar", ["-xzf", archive, "-C", dest], { encoding: "utf8" });
    if (result.status !== 0) {
      throw kitUnavailable(`tar extract failed: ${result.stderr || result.stdout || result.status}`);
    }
  }
  if (!looksLikeKit(root)) {
    throw kitUnavailable(`extract missing ${PACKAGE_DIR}/bin/useful-jobs.mjs`);
  }
  return root;
}

/**
 * Locate the pinned public 1.2.0 kit. Missing kit is incomplete, never a skipped pass.
 */
export function resolveKit() {
  for (const root of candidateRoots()) {
    if (looksLikeKit(root)) {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (pkg.version !== PIN.publicKit.packageVersion) {
        throw kitUnavailable(`kit version ${pkg.version} != ${PIN.publicKit.packageVersion}`);
      }
      return {
        root,
        bin: join(root, "bin", "useful-jobs.mjs"),
        via: "extracted-root",
        archive: null,
        sha256: PIN.publicKit.sha256,
      };
    }
  }

  for (const archive of candidateArchives()) {
    if (!existsSync(archive)) continue;
    const hash = sha256File(archive);
    if (hash !== PIN.publicKit.sha256) {
      throw kitUnavailable(`archive ${archive} sha256 ${hash} != pin ${PIN.publicKit.sha256}`);
    }
    const root = extractArchive(archive);
    return {
      root,
      bin: join(root, "bin", "useful-jobs.mjs"),
      via: "archive",
      archive,
      sha256: hash,
    };
  }

  throw kitUnavailable(
    `Pinned ${ARCHIVE_NAME} (${PIN.publicKit.sha256}) not found. Set USEFUL_JOBS_KIT_ROOT or USEFUL_JOBS_ARCHIVE.`,
  );
}
