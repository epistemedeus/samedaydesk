/**
 * Isolated I01 hash-terms contract (Neo PR54 packs/funded-task-terms).
 * Prefer this content-hash termsVersion when original F01 used an integer key.
 * Earned-work kernel is not copied.
 *
 * Pin: epistemedeus/neomorphic-io@819fa637ecf5e5177c84efc16fcaa18d57017631
 * File: packs/funded-task-terms/src/hash.mjs
 * Golden: sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f
 */
import { createHash } from "node:crypto";
import { canonicalize, isPlainObject } from "./canonical.mjs";
import { refuse } from "./refuse.mjs";

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

export function hashTermsIgnoringIntegerKey(input) {
  if (!isPlainObject(input)) {
    throw new Error("hashTermsIgnoringIntegerKey requires a terms object");
  }
  return hashTermsVersion(input);
}

export function isIntegerTermsVersion(value) {
  if (typeof value === "number") return Number.isInteger(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return true;
  return false;
}

export function assertTermsVersionClaim(raw) {
  const candidates = [
    raw?.termsVersion,
    raw?.repeatJob?.termsVersion,
    raw?.nextRunManifest?.termsVersion,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    if (isIntegerTermsVersion(v)) {
      throw refuse(
        "integer-terms-version",
        "Integer termsVersion is not a public claim key; I01 requires sha256:+64hex",
        { got: v },
      );
    }
    if (!isTermsVersionHash(v)) {
      throw refuse(
        "invalid-terms-version",
        "termsVersion must be sha256: plus 64 lowercase hex (I01 contract)",
        { got: v },
      );
    }
  }
}
