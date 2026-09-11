import { createHash } from "node:crypto";

/**
 * I01/F17 content-hash terms contract (not original F01 integer termsVersion).
 * Shape: `sha256:` + 64 lowercase hex over canonical JSON.
 * Golden F17 fixture hash is Neo-owned; this module hashes SDS honesty terms only.
 */
export class HashTermsRefuse extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "HashTermsRefuse";
    this.code = code;
    this.detail = detail;
  }
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function hashTermsVersion(terms) {
  if (isIntegerTermsVersion(terms)) {
    throw new HashTermsRefuse(
      "integer_terms_version_rejected",
      "F01 integer termsVersion is rejected; I01 uses sha256: content hash",
      { terms },
    );
  }
  const digest = createHash("sha256").update(canonicalJson(terms), "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function isIntegerTermsVersion(value) {
  if (typeof value === "number" && Number.isInteger(value)) return true;
  if (typeof value === "string" && /^\d+$/.test(value)) return true;
  return false;
}

export function assertHashTermsVersion(value) {
  if (isIntegerTermsVersion(value)) {
    throw new HashTermsRefuse(
      "integer_terms_version_rejected",
      "integer termsVersion is not the I01 hashTermsVersion contract",
      { value },
    );
  }
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new HashTermsRefuse(
      "invalid_hash_terms_version",
      "termsVersion must be sha256: + 64 lowercase hex",
      { value },
    );
  }
  return value;
}
