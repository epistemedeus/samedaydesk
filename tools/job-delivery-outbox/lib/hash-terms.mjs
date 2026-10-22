/**
 * Canonical terms hash (I01 integrated contract).
 *
 * I01/S275 hashes a stable-sorted JSON of terms and binds reservations to
 * termsVersion. Original F01-style "hash the whole order including caller input
 * bytes" is rejected here: inputs stay off the terms object. Engine identity
 * is archive sha256+bytes (W4-I02), not the version string.
 *
 * This module does not copy the earned-work kernel.
 */
import { createHash } from "node:crypto";
import { engineArchiveIdentity, TERMS_SCHEMA } from "./pins.mjs";

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

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Delivery terms: job + engine archive identity + funding labels + output digest
 * + loopback origin. Never caller file contents, payment payloads, or secrets.
 */
export function deliveryTermsFromReceipt(receipt, callbackOrigin) {
  return {
    schema: TERMS_SCHEMA,
    jobId: receipt.jobId,
    engineArchiveIdentity: engineArchiveIdentity(receipt.engine || {}),
    fundingState: receipt.fundingState,
    sold: false,
    sample: Boolean(receipt.sample),
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    outputsDigest: receipt.outputsDigest,
    callbackOrigin,
    termsVersion: Number.isInteger(receipt.termsVersion) ? receipt.termsVersion : 1,
  };
}

export function eventIdFromTermsHash(termsHash) {
  return `evt_${termsHash}`;
}
