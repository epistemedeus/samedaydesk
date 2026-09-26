import { TERMS_VERSION_RE } from "./constants.mjs";
import { ERROR_CODE } from "./constants.mjs";
import { fail } from "./errors.mjs";

/**
 * I01 parseClaimTermsVersion. Original F01 integer is rejected, not adapted.
 */
export function parseClaimTermsVersion(value) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    fail(
      ERROR_CODE.INTEGER_TERMS_VERSION,
      "integer termsVersion is rejected; use the sha256 content hash (I01 / F17). Original F01 integer residual is not a consumer default.",
    );
  }
  if (typeof value !== "string" || !TERMS_VERSION_RE.test(value)) {
    fail(
      ERROR_CODE.INVALID_TERMS_VERSION,
      "termsVersion must be sha256: followed by 64 lowercase hex characters",
    );
  }
  return value;
}

export function isTermsVersionHash(value) {
  return typeof value === "string" && TERMS_VERSION_RE.test(value);
}
