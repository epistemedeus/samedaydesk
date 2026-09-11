import { createHash } from "node:crypto";
import { S275_HASH_TERMS_PATH, S275_HASH_TERMS_PIN } from "./pins.mjs";

/**
 * I01 integrated hash-terms contract (S275 crypto.hashRequest).
 * Stable-key JSON, then SHA-256 hex. Do not substitute a F01 managed-brief
 * envelope hash. Neo PR54 owns the earned-work kernel; this is the published
 * hash function only, not a competing kernel copy.
 */
export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

export function hashRequest(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function hashTermsProvenance() {
  return {
    owner: "I01",
    sourcePin: S275_HASH_TERMS_PIN,
    sourcePath: S275_HASH_TERMS_PATH,
    algorithm: "sha256",
    encoding: "utf8",
    canonicalization: "sorted-keys-json",
    competingKernelCopied: false,
  };
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(buf) {
  return {
    sha256: sha256Bytes(buf),
    bytes: buf.length,
  };
}
