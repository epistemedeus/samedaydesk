import {
  hashTermsVersion as pinnedHashTermsVersion,
  isTermsVersionHash,
  TERMS_VERSION_RE,
} from "../vendor/i01-hash-terms/hash.mjs";

/**
 * Injected adapter for I01 content-hash termsVersion.
 * Default: pinned hasher from Neo PR54. Root may later bind the live pack.
 */
export function createHashTermsAdapter(injected = {}) {
  const hashTermsVersion = injected.hashTermsVersion || pinnedHashTermsVersion;
  return {
    hashTermsVersion,
    isTermsVersionHash: injected.isTermsVersionHash || isTermsVersionHash,
    TERMS_VERSION_RE: injected.TERMS_VERSION_RE || TERMS_VERSION_RE,
  };
}

export function rejectIntegerTermsVersion(value) {
  return typeof value === "number" && Number.isFinite(value);
}
