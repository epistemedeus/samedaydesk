/**
 * Projection pin of hashTermsVersion from Work Exchange PR 463, not a terms store.
 *
 * Source: epistemedeus/neomorphic-io
 *   commit 585c80b91a15d7cf6fd97a5afc085d246efead7d
 *   path packs/earned-work-sdk/src/terms-hash.mjs
 *   blob 90dbbb241265da0ee99dea3ae809810a95de3214
 * Documented there as @neomorphic/funded-task-terms/hash#hashTermsVersion.
 * The function body is unchanged. This file keeps no task or terms history.
 *
 * F17/I01 terms-version hash contract (read-only extract).
 * Integer keys are never a public claim key.
 * License: MIT, @neomorphic/funded-task-terms on I01 346bbd3c.
 */
import { createHash } from "node:crypto";

export const TERMS_VERSION_PREFIX = "sha256:";
export const TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;

/** F17 complete-fixture golden. Shared by F01/F02/F07/F12/F17/I01 agreement tests. */
export const F17_GOLDEN_TERMS_VERSION =
  "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeCanonical(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error("canonical JSON rejects non-integer numbers");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => writeCanonical(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${writeCanonical(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error("canonical JSON rejects this value type");
}

export function canonicalize(value) {
  return writeCanonical(value);
}

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

export { isPlainObject };
