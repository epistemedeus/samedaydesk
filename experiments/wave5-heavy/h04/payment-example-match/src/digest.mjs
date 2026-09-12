/**
 * Reproduce paidEvidenceRequestDigest from merchant pin
 * a143898dd1ec35c097ca7eb0b472f30dad1ee319 commerce-events.mjs
 * (not credential fingerprints).
 */
import { createHash } from "node:crypto";

export const PRODUCTION_PIN = "a143898dd1ec35c097ca7eb0b472f30dad1ee319";
export const PAID_EVIDENCE_REQUEST_DOMAIN =
  "samedaydesk.commerce-paid-success-evidence.request.v1\0";

export const OBSERVED = Object.freeze({
  triple: "2f7eb0c0de992712235554d87055c72386555b312017623406340683d237a670",
  fourth: "6312daa4489344e3d144e25ba53da4940279e96492dd6a85316dff1802d962ad",
});

export function updateLengthFramed(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length);
  hash.update(bytes);
}

/**
 * @param {string} method canonical HTTP method (Express req.method, e.g. GET)
 * @param {string} target Express originalUrl if string else url (path+query, not absolute)
 * @param {Buffer} rawBody empty GET → Buffer.alloc(0) when rawBody known empty
 */
export function paidEvidenceRequestDigest(method, target, rawBody) {
  const hash = createHash("sha256");
  hash.update(PAID_EVIDENCE_REQUEST_DOMAIN, "utf8");
  updateLengthFramed(hash, method);
  updateLengthFramed(hash, target);
  updateLengthFramed(hash, rawBody);
  return hash.digest("hex");
}

export function emptyGetBody() {
  return Buffer.alloc(0);
}

/** Path+query from a published absolute HTTPS URL. Encoding is preserved. */
export function targetFromPublishedUrl(publishedUrl) {
  const u = new URL(publishedUrl);
  return `${u.pathname}${u.search}`;
}
