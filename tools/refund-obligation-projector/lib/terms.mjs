/**
 * I01 / Neo PR54 content-hash termsVersion adapter.
 *
 * Pin: epistemedeus/neomorphic-io PR54 head 819fa637ecf5e5177c84efc16fcaa18d57017631
 * Pack: packs/funded-task-terms (`hashTermsVersion`, `isTermsVersionHash`).
 * Kind: `sha256:` + 64 lowercase hex. schemaVersion stays the integer shape version.
 * Integer termsVersion is rejected (original F01 dual-key is not adopted).
 *
 * This module does not copy the earned-work kernel or the hasher. Root can later
 * inject Neo `hashTermsVersion` through createTermsAdapter({ hashTermsVersion }).
 */

export const I01_TERMS_PIN = Object.freeze({
  repo: "epistemedeus/neomorphic-io",
  pull: 54,
  sha: "819fa637ecf5e5177c84efc16fcaa18d57017631",
  import: "packs/funded-task-terms/src/hash.mjs",
  golden: "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f",
});

export const TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;

export function isTermsVersionHash(value) {
  return typeof value === "string" && TERMS_VERSION_RE.test(value);
}

export function isIntegerTermsVersion(value) {
  if (typeof value === "number" && Number.isInteger(value)) return true;
  if (typeof value === "bigint") return true;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return true;
  return false;
}

export function createTermsAdapter(overrides = {}) {
  return {
    pin: I01_TERMS_PIN,
    isTermsVersionHash,
    isIntegerTermsVersion,
    assertKind(value) {
      if (value == null) {
        return { ok: true, termsVersion: null };
      }
      if (isIntegerTermsVersion(value)) {
        return {
          ok: false,
          code: "integer_terms_version",
          message: "I01 content-hash termsVersion required; integer termsVersion is rejected",
        };
      }
      if (!isTermsVersionHash(value)) {
        return {
          ok: false,
          code: "invalid_terms_version",
          message: "termsVersion must be sha256: plus 64 lowercase hex",
        };
      }
      return { ok: true, termsVersion: value };
    },
    hashTermsVersion: overrides.hashTermsVersion ?? null,
    ...overrides,
  };
}
