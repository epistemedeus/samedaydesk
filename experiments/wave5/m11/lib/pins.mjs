import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_SOURCE_COMMIT,
  USEFUL_JOBS_SOURCE_REPO,
} from "../../../../server/paid-useful-jobs/lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export { REPO_ROOT };

export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const CONTRACT_PATH = join(OWNED_DIR, "contract/samedaydesk.caller-example-corpus.v1.json");
export const DEFAULT_CORPUS = join(OWNED_DIR, "caller-corpora");
export const SCHEMA_ID = "samedaydesk.caller-example-corpus.v1";
export const SDS52_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";

export function enginePin() {
  return {
    repo: "epistemedeus/samedaydesk",
    sha: SDS52_SHA,
    wrapperCli: "server/paid-useful-jobs/bin/cli.mjs",
    archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
    archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    sourceRepo: USEFUL_JOBS_SOURCE_REPO,
    sourceCommit: USEFUL_JOBS_SOURCE_COMMIT,
  };
}
