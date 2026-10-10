import {
  hashTermsVersion as pinnedHashTermsVersion,
  hashTermsIgnoringIntegerKey,
  isTermsVersionHash,
} from "../vendor/i01-hash-terms/hash.mjs";
import { IDENTITY_SCHEMA } from "./pins.mjs";
import { toSha256Prefixed } from "./digest.mjs";

export function createHashTermsAdapter(injected = {}) {
  return {
    hashTermsVersion: injected.hashTermsVersion || pinnedHashTermsVersion,
    hashTermsIgnoringIntegerKey: injected.hashTermsIgnoringIntegerKey || hashTermsIgnoringIntegerKey,
    isTermsVersionHash: injected.isTermsVersionHash || isTermsVersionHash,
  };
}

export function integerTermsVersionRejected(value) {
  if (typeof value === "number" && Number.isInteger(value)) return true;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return true;
  return false;
}

export function identityDocument({ jobId, outputs, outputsDigest, engineArchiveSha256 }) {
  const rows = [...(outputs || [])]
    .map((e) => ({
      name: e.name,
      bytes: e.bytes ?? null,
      sha256: toSha256Prefixed(e.sha256) || e.sha256 || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    schema: IDENTITY_SCHEMA,
    jobId: jobId || null,
    outputs: rows,
    outputsDigest: outputsDigest || null,
    engineArchiveSha256: engineArchiveSha256 || null,
  };
}
