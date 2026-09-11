import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  RECORD_REPEAT_ARCHIVE_PATH,
  RECORD_REPEAT_ARCHIVE_SHA256,
  RECORD_REPEAT_CLI,
  RECORD_REPEAT_ROOT_NAME,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_ROOT_NAME,
  recordRepeatArchivePin,
  usefulJobsArchivePin,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";

function extractTar(archivePath, destDir) {
  const r = spawnSync("tar", ["-xzf", archivePath, "-C", destDir], { encoding: "utf8" });
  if (r.status !== 0) {
    throw refuse("archive-extract-failed", `tar extract failed: ${r.stderr || r.status}`, {
      archivePath,
    });
  }
}

function cacheRoot() {
  return join(
    tmpdir(),
    `w4-repeat-job-binder-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 12)}-${RECORD_REPEAT_ARCHIVE_SHA256.slice(0, 12)}`,
  );
}

/**
 * Extract pinned PR51 archives into a read-only-use cache. Never copies a
 * competing kernel into ownedPaths. Tests and the CLI share this cache.
 */
export function extractPinnedKits({ usefulJobsRoot, recordRepeatBin, paidWrapperBin = null } = {}) {
  if (usefulJobsRoot && recordRepeatBin) {
    return {
      usefulJobsRoot,
      usefulJobsCli: join(usefulJobsRoot, USEFUL_JOBS_CLI),
      recordRepeatRoot: null,
      recordRepeatBin,
      paidWrapperBin,
      cached: true,
    };
  }

  const ujPin = usefulJobsArchivePin();
  if (!ujPin.ok) {
    throw refuse("missing-useful-jobs-archive", ujPin.error || "useful-jobs archive pin failed", ujPin);
  }
  const rrPin = recordRepeatArchivePin();
  if (!rrPin.ok) {
    throw refuse(
      "missing-record-repeat-archive",
      rrPin.error || "record-repeat archive pin failed",
      rrPin,
    );
  }

  const cache = cacheRoot();
  const ujRoot = usefulJobsRoot || join(cache, USEFUL_JOBS_ROOT_NAME);
  const rrRoot = join(cache, RECORD_REPEAT_ROOT_NAME);
  const marker = join(cache, "PIN-OK");

  if (!existsSync(marker) || !existsSync(join(ujRoot, USEFUL_JOBS_CLI)) || !existsSync(join(rrRoot, RECORD_REPEAT_CLI))) {
    mkdirSync(cache, { recursive: true });
    if (!existsSync(join(ujRoot, USEFUL_JOBS_CLI))) {
      extractTar(USEFUL_JOBS_ARCHIVE_PATH, cache);
    }
    if (!existsSync(join(rrRoot, RECORD_REPEAT_CLI))) {
      extractTar(RECORD_REPEAT_ARCHIVE_PATH, cache);
    }
    writeFileSync(
      marker,
      JSON.stringify(
        {
          usefulJobs: ujPin,
          recordRepeat: rrPin,
          extractedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  const ujCli = join(ujRoot, USEFUL_JOBS_CLI);
  const rrBin = recordRepeatBin || join(rrRoot, RECORD_REPEAT_CLI);
  if (!existsSync(ujCli)) {
    throw refuse("useful-jobs-cli-missing", "extracted useful-jobs CLI missing", { ujCli });
  }
  if (!existsSync(rrBin)) {
    throw refuse("record-repeat-cli-missing", "extracted record-repeat CLI missing", { rrBin });
  }

  return {
    usefulJobsRoot: ujRoot,
    usefulJobsCli: ujCli,
    recordRepeatRoot: rrRoot,
    recordRepeatBin: rrBin,
    paidWrapperBin,
    cached: true,
    cache,
  };
}

export function kitSample(kit, ...parts) {
  return join(kit.usefulJobsRoot, "samples", ...parts);
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
