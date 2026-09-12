import { existsSync } from "node:fs";
import { replayRefuse } from "./args.mjs";
import { contentHashFile } from "./digest.mjs";
import {
  hashTermsIgnoringIntegerKey,
  hashTermsVersion as pinnedHashTermsVersion,
  isTermsVersionHash,
} from "../vendor/funded-task-terms/hash.mjs";
import {
  GOLDEN_TERMS_VERSION,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_PACKAGE,
  USEFUL_JOBS_VERSION,
} from "./pins.mjs";

export { hashTermsVersion, isTermsVersionHash, hashTermsIgnoringIntegerKey } from "../vendor/funded-task-terms/hash.mjs";

/**
 * I01 content-hash termsVersion contract. Integer termsVersion is dropped
 * before hashing and is never copied onto the public report.
 */
export function defaultHashTermsVersion(input) {
  return pinnedHashTermsVersion(input);
}

export function fileInputHashes(inputs = {}) {
  const hashed = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value !== "string" || !value) continue;
    if (!existsSync(value)) continue;
    hashed[key] = contentHashFile(value);
  }
  return hashed;
}

export function buildReplayTerms({
  jobId,
  catalogOutputs,
  inputs,
  inputHashes,
  inputHashesB,
  sample,
  example,
}) {
  return {
    schema: "samedaydesk.output-replay-harness.terms.v1",
    schemaVersion: 1,
    jobId,
    catalogOutputs: [...catalogOutputs],
    inputs: inputHashes || fileInputHashes(inputs),
    ...(inputHashesB ? { inputsB: inputHashesB } : {}),
    engine: {
      package: USEFUL_JOBS_PACKAGE,
      version: USEFUL_JOBS_VERSION,
      archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
      archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
      purchaseAuthority: false,
    },
    sample: Boolean(sample),
    example: Boolean(example),
    purchaseAuthority: false,
  };
}

export function assertPublicTermsVersion(value) {
  if (typeof value === "number") {
    throw replayRefuse("integer-terms-version", "Integer termsVersion is not a public claim key", {
      termsVersion: value,
    });
  }
  if (!isTermsVersionHash(value)) {
    throw replayRefuse("invalid-terms-version", "termsVersion must be sha256: + 64 lowercase hex", {
      termsVersion: value,
    });
  }
  return value;
}

export function hashReplayTerms(terms, hashTermsVersion = defaultHashTermsVersion) {
  const hashed = hashTermsVersion(terms);
  return assertPublicTermsVersion(hashed);
}

export { GOLDEN_TERMS_VERSION };
