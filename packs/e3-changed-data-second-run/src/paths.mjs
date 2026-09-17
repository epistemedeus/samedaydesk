import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../..");

export const JOB_ID = "page-change-offline-job";
export const PAIR_SCHEMA = "samedaydesk.e3-changed-data-second-run.v1";
export const PROMISED_OUTPUTS = Object.freeze(["page-change.json", "page-change.md"]);

export const ARCHIVE_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz";
export const ARCHIVE_META_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.sha256.json";

export function archivePath(repoRoot = REPO_ROOT) {
  return join(repoRoot, ARCHIVE_REL);
}

export function archiveMetaPath(repoRoot = REPO_ROOT) {
  return join(repoRoot, ARCHIVE_META_REL);
}

export const PAIR_FILES = Object.freeze({
  ownerQa: join(PACK_ROOT, "fixtures/pairs/owner-qa-second-run.json"),
  ownerQaVsIndependent: join(PACK_ROOT, "fixtures/pairs/owner-qa-vs-independent.json"),
  seededSameFixtureRepeatDemand: join(PACK_ROOT, "fixtures/pairs/same-fixture-repeat-demand.json"),
});

export function findRepoRoot(start = REPO_ROOT) {
  let dir = resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, ARCHIVE_REL)) && existsSync(join(dir, ARCHIVE_META_REL))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(join(REPO_ROOT, ARCHIVE_REL)) ? REPO_ROOT : null;
}
