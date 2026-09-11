/**
 * Pins for W5-D09 / Co03. Exact current PR51 archives on SDS main are
 * authoritative. Do not copy a second useful-jobs / record-repeat kernel here.
 * D01/PR52 wrapper is an optional injected CLI, not vendored source.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const FEATURE_ID = "W5-D09";
export const FEATURE_DIR = "tools/repeat-job-binder";
export const STARTING_REF = "7c55738cc5730985b709282af6c24e10f0a8442f";
export const D01_PIN_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const D01_PIN_REF = "fable/f08-paid-wrappers";
export const D01_PIN_PR = 52;
export const D01_WRAPPER_CLI_REL = "server/paid-useful-jobs/bin/cli.mjs";

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
    parsers: Object.freeze(["openapi-used-ops", "openapi-impact", "s134-openapi-impact"]),
  },
  "pricing-row-unit": {
    catalogJob: "vendor-budget-impact",
    vendorPinFamily: "pricing-row-unit",
    requiredSlots: ["before", "after"],
    catalogOutputs: ["budget-impact.json", "budget-impact.md"],
    parsers: Object.freeze(["pricing-row-unit", "pricing-table-change", "s134-pricing-table-change"]),
  },
});

export function parserMatchesFamily(family, parser) {
  if (!parser) return true;
  const spec = SUPPORTED_FAMILIES[family];
  if (!spec) return false;
  const token = String(parser);
  return spec.parsers.includes(token);
}

export const LATER_BINDINGS = Object.freeze({
  d01ExecutionContract: {
    id: "W5-D01",
    role: "supplied-input execution/receipt contract this binder consumes",
    pin: D01_PIN_SHA,
    ref: D01_PIN_REF,
    pr: D01_PIN_PR,
    cli: D01_WRAPPER_CLI_REL,
    status: "consumed-as-optional-injected-cli",
    note: "Tested against PR52 aeef964 via --paid-wrapper-bin. D01 may amend that wrapper; this package does not claim a future sibling.",
  },
  operatorProduct: {
    id: "W4-commerce-09",
    role: "operator product that would consume this binder",
    status: "not-consumed",
    note: "Missing sibling work must not block; W5-D01 binds when it publishes.",
  },
  earnedWorkTerms: {
    id: "I01",
    source: "epistemedeus/neomorphic-io#54",
    head: I01_HEAD,
    contract: "hashTermsVersion sha256:+64hex; integer termsVersion refused as a claim key",
    kernelCopied: false,
  },
  f08PaidWrappers: {
    status: "not-copied",
    pin: D01_PIN_SHA,
    note: "Wave payments are nonsettling prototypes. This binder has no pay path and does not vendor wrapper.mjs.",
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
