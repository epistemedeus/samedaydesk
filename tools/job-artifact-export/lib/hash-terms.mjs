import {
  hashTermsIgnoringIntegerKey,
  hashTermsVersion as pinnedHashTermsVersion,
  isTermsVersionHash,
} from "../vendor/funded-task-terms-hash/hash.mjs";
import { HASH_TERMS_GOLDEN, HASH_TERMS_PIN, HASH_TERMS_PR, HASH_TERMS_REPO } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

/**
 * Injected adapter surface. Default is the I01/PR54 hasher pin.
 * Root may later bind @neomorphic/funded-task-terms/hash.
 */
export function createHashTermsAdapter(injected = {}) {
  const hashTermsVersion = injected.hashTermsVersion || pinnedHashTermsVersion;
  return {
    hashTermsVersion,
    isTermsVersionHash: injected.isTermsVersionHash || isTermsVersionHash,
    hashTermsIgnoringIntegerKey: injected.hashTermsIgnoringIntegerKey || hashTermsIgnoringIntegerKey,
    pin: {
      repo: HASH_TERMS_REPO,
      sha: HASH_TERMS_PIN,
      pr: HASH_TERMS_PR,
      golden: HASH_TERMS_GOLDEN,
      kind: "content-hash",
    },
  };
}

export function assertNotIntegerTermsVersion(value) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    throw refuse("integer-terms-version", "integer termsVersion is rejected; I01 uses sha256: plus 64 hex", {
      valueType: typeof value,
    });
  }
  if (value != null && !isTermsVersionHash(value)) {
    throw refuse("invalid-terms-version", "termsVersion must be sha256: plus 64 lowercase hex");
  }
}

export { pinnedHashTermsVersion as hashTermsVersion, isTermsVersionHash };
