import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../..");
export const BIN = resolve(PACK_ROOT, "bin/check-desk-report.mjs");
export const FIXTURES = resolve(PACK_ROOT, "fixtures");
export const SEEDED_REPORT = resolve(
  FIXTURES,
  "missing-output-reported-delivered/report.json",
);

export const PUBLIC_USEFUL_JOBS = resolve(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs",
);
export const CATALOG_PATH = resolve(PUBLIC_USEFUL_JOBS, "catalog.json");
export const ARCHIVE_PATH = resolve(PUBLIC_USEFUL_JOBS, "useful-jobs-1.4.7.tar.gz");
export const ARCHIVE_META_PATH = resolve(
  PUBLIC_USEFUL_JOBS,
  "useful-jobs-1.4.7.sha256.json",
);
