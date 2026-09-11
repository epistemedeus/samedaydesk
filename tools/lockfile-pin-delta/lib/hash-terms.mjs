import { createHash } from "node:crypto";

/**
 * Integrated pin-terms hash.
 *
 * I01 (earned-work) hashes whole terms, not one field. Original F01
 * (API-upgrade brief) is a different job and is not copied here. When that
 * I01 hasher is published, inject it through createHashTermsAdapter; until
 * then this local contract is canonical JSON of {name, version, integrity}
 * then SHA-256 hex. Integrity-only edits therefore change the hash.
 */
export function canonicalPinTerms(triple = {}) {
  return {
    name: normalizeTerm(triple.name),
    version: normalizeTerm(triple.version),
    integrity: normalizeIntegrity(triple.integrity),
  };
}

export function defaultHashPinTerms(triple) {
  return createHash("sha256").update(stableStringify(canonicalPinTerms(triple)), "utf8").digest("hex");
}

export function createHashTermsAdapter(hashPinTerms = defaultHashPinTerms) {
  if (typeof hashPinTerms !== "function") {
    throw new TypeError("hashPinTerms adapter must be a function");
  }
  return {
    hashPinTerms(triple) {
      return String(hashPinTerms(canonicalPinTerms(triple)));
    },
  };
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function normalizeTerm(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizeIntegrity(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
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
