import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kitMeta = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const USEFUL_JOBS_PACKAGE = kitMeta.packageId;
export const USEFUL_JOBS_VERSION = kitMeta.version;
export const USEFUL_JOBS_ROOT_NAME = kitMeta.rootName;
export const USEFUL_JOBS_CLI = kitMeta.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kitMeta.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kitMeta.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kitMeta.purchaseAuthority === true;
export const USEFUL_JOBS_ARCHIVE_REL = String(kitMeta.archive).replace(/^\//, "");
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_PUBLIC_CATALOG = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);
export const USEFUL_JOBS_SOURCE_REPO = kitMeta.sourceRepo;
export const USEFUL_JOBS_SOURCE_COMMIT = kitMeta.sourceCommit;
export const USEFUL_JOBS_ARCHIVE_FREEZE = kitMeta.archiveFreeze;
export const USEFUL_JOBS_NODE = kitMeta.node;

export const I01_PIN = JSON.parse(
  readFileSync(join(HARNESS_ROOT, "vendor/funded-task-terms/PIN.json"), "utf8"),
);

export const GOLDEN_TERMS_VERSION = I01_PIN.goldenTermsVersion;
export const GOLDEN_TERMS_PATH = join(
  HARNESS_ROOT,
  "vendor/funded-task-terms/fixtures/golden/complete.terms.json",
);

/** Catalog JSON envelope timestamp written by useful-jobs 1.0.0. Not identity. */
export const NON_IDENTITY_JSON_KEYS = Object.freeze(["generatedAt"]);
