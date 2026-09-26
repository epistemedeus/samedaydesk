import { createHash } from "node:crypto";
import { canonicalTerms, stableStringify } from "./canonical.mjs";

export function hashTerms(terms) {
  const digest = createHash("sha256").update(stableStringify(canonicalTerms(terms)), "utf8").digest("hex");
  return `sha256:${digest}`;
}

export { isI01TermsVersion, isIntegerTermsVersion } from "./terms-version.mjs";
