/**
 * Pins for W4-commerce-03. Exact current PR51 archives on SDS main are
 * authoritative. Do not copy a second useful-jobs / record-repeat kernel here.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const FEATURE_ID = "W4-commerce-03";
export const FEATURE_DIR = "tools/repeat-job-binder";
export const STARTING_REF = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";

export const USEFUL_JOBS_ARCHIVE_REL =
  "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_ARCHIVE_SHA256 =
  "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
export const USEFUL_JOBS_ARCHIVE_BYTES = 2522418;
export const USEFUL_JOBS_ROOT_NAME = "useful-jobs-1.0.0";
export const USEFUL_JOBS_CLI = "bin/useful-jobs.mjs";
export const USEFUL_JOBS_CATALOG_REL =
  "client/public/for-agents/useful-jobs/catalog.json";
export const USEFUL_JOBS_CATALOG_PATH = join(REPO_ROOT, USEFUL_JOBS_CATALOG_REL);

export const RECORD_REPEAT_ARCHIVE_REL =
  "client/public/kit/record-repeat-job-ab84d79b0272.tar.gz";
export const RECORD_REPEAT_ARCHIVE_PATH = join(REPO_ROOT, RECORD_REPEAT_ARCHIVE_REL);
export const RECORD_REPEAT_ARCHIVE_SHA256 =
  "9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea";
export const RECORD_REPEAT_ARCHIVE_BYTES = 1253570;
export const RECORD_REPEAT_ROOT_NAME = "record-repeat-job";
export const RECORD_REPEAT_CLI = "bin/record-repeat.mjs";

export const I01_NEO_PR = 54;
export const I01_HEAD = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const I01_GOLDEN_TERMS_VERSION =
  "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";

export const MAX_LOCAL_INPUT_BYTES = 8 * 1024 * 1024;
export const ENGINE_TIMEOUT_MS = 90_000;

export const NEXT_RUN_SCHEMAS = Object.freeze([
  "s176.next-run-manifest.v1",
  "s163.next-run-manifest.v1",
]);

export const SUPPORTED_FAMILIES = Object.freeze({
  "openapi-used-ops": {
    catalogJob: "api-upgrade-brief",
    vendorPinFamily: "openapi-used-ops",
    requiredSlots: ["before", "after", "used"],
    catalogOutputs: ["upgrade-brief.json", "upgrade-brief.md"],
  },
  "pricing-row-unit": {
    catalogJob: "vendor-budget-impact",
    vendorPinFamily: "pricing-row-unit",
    requiredSlots: ["before", "after"],
    catalogOutputs: ["budget-impact.json", "budget-impact.md"],
  },
});

export const LATER_BINDINGS = Object.freeze({
  operatorProduct: {
    id: "W4-commerce-09",
    role: "operator product that would consume this binder",
    status: "not-consumed",
    note: "Missing sibling W4 work must not block; Root binds when it publishes.",
  },
  earnedWorkTerms: {
    id: "I01",
    source: "epistemedeus/neomorphic-io#54",
    head: I01_HEAD,
    contract: "hashTermsVersion sha256:+64hex; integer termsVersion refused as a claim key",
    kernelCopied: false,
  },
  f08PaidWrappers: {
    status: "not-edited",
    note: "Wave payments are nonsettling prototypes. This binder has no pay path.",
  },
});

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function pinArchive(path, bytes, sha256, rel) {
  if (!existsSync(path)) {
    return { ok: false, error: `missing archive ${rel}`, path: rel };
  }
  const size = statSync(path).size;
  const digest = sha256File(path);
  return {
    ok: size === bytes && digest === sha256,
    bytes: size,
    sha256: digest,
    path: rel,
    expectedBytes: bytes,
    expectedSha256: sha256,
  };
}

export function usefulJobsArchivePin() {
  return pinArchive(
    USEFUL_JOBS_ARCHIVE_PATH,
    USEFUL_JOBS_ARCHIVE_BYTES,
    USEFUL_JOBS_ARCHIVE_SHA256,
    USEFUL_JOBS_ARCHIVE_REL,
  );
}

export function recordRepeatArchivePin() {
  return pinArchive(
    RECORD_REPEAT_ARCHIVE_PATH,
    RECORD_REPEAT_ARCHIVE_BYTES,
    RECORD_REPEAT_ARCHIVE_SHA256,
    RECORD_REPEAT_ARCHIVE_REL,
  );
}
