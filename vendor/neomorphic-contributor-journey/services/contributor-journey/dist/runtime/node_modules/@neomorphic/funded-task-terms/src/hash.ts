import type { TermsVersion } from "./types.js";
import { hashTermsVersion as hashImpl } from "./hash.mjs";

export { TERMS_VERSION_PREFIX, TERMS_VERSION_RE, isTermsVersionHash, hashTermsIgnoringIntegerKey } from "./hash.mjs";

export function hashTermsVersion(input: unknown): TermsVersion {
  return hashImpl(input) as TermsVersion;
}
