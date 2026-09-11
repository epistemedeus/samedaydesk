/**
 * Canonical terms hash for delivery-outbox terms.v1.
 *
 * Explicit mapping from SDS52 receipt.v1. Disclosure, kernel terms, and this
 * outbox document are different schemas. Their hashes are never forced equal.
 * Engine identity is archive sha256+bytes, not the version string.
 */
import { createHash } from "node:crypto";
import {
  TERMS_MAPPING_ID,
  TERMS_MAPPING_VERSION,
  TERMS_SCHEMA,
  F08_RECEIPT_SCHEMA,
  engineArchiveIdentity,
} from "./pins.mjs";
import { callbackDestination } from "./loopback.mjs";
import { verifyOutputsDigest } from "./receipt-shape.mjs";

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

export function hashTerms(terms) {
  return createHash("sha256").update(stableStringify(terms), "utf8").digest("hex");
}

export function hashBody(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export { sha256Bytes } from "./sha256.mjs";

function asDestination(callback) {
  if (callback && typeof callback === "object" && callback.canonical && callback.path && callback.origin) {
    return callback;
  }
  return callbackDestination(callback);
}

/**
 * Map a validated receipt.v1 onto outbox terms.v1. Destination is origin+path,
 * not origin alone. outputsDigest is the recomputed listed-output digest.
 */
export function deliveryTermsFromReceipt(receipt, callback) {
  const dest = asDestination(callback);
  const outputsDigest = verifyOutputsDigest(receipt);
  return {
    schema: TERMS_SCHEMA,
    mappingId: TERMS_MAPPING_ID,
    mappingVersion: TERMS_MAPPING_VERSION,
    sourceSchema: F08_RECEIPT_SCHEMA,
    sourceTermsVersion: Number.isInteger(receipt.termsVersion) ? receipt.termsVersion : null,
    termsVersion: TERMS_MAPPING_VERSION,
    jobId: receipt.jobId,
    engineArchiveIdentity: engineArchiveIdentity(receipt.engine || {}),
    fundingState: receipt.fundingState,
    sold: false,
    sample: Boolean(receipt.sample),
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    outputsDigest,
    callbackDestination: dest.canonical,
  };
}

export function eventIdFromTermsHash(termsHash) {
  return `evt_${termsHash}`;
}
