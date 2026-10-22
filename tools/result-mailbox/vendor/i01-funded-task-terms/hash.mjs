/**
 * Pinned from epistemedeus/neomorphic-io@819fa637ecf5e5177c84efc16fcaa18d57017631
 * packs/funded-task-terms/src/hash.mjs (I01 / F17). Do not fork a second hasher.
 */
import { createHash } from "node:crypto";
import { canonicalize, isPlainObject } from "./canonical.mjs";

export const TERMS_VERSION_PREFIX = "sha256:";
export const TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;

function termsBody(input) {
  const copy = { ...input };
  delete copy.termsVersion;
  return copy;
}

export function hashTermsVersion(input) {
  if (!isPlainObject(input)) {
    throw new Error("hashTermsVersion requires a terms object");
  }
  const body = canonicalize(termsBody(input));
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  return `${TERMS_VERSION_PREFIX}${digest}`;
}

export function isTermsVersionHash(value) {
  return typeof value === "string" && TERMS_VERSION_RE.test(value);
}

/**
 * One-way adapter: never a public claim key.
 * Drops an integer (or any) termsVersion field and hashes the remaining body.
 */
export function hashTermsIgnoringIntegerKey(input) {
  if (!isPlainObject(input)) {
    throw new Error("hashTermsIgnoringIntegerKey requires a terms object");
  }
  return hashTermsVersion(input);
}
