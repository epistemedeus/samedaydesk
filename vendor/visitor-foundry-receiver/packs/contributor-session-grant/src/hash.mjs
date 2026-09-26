import { createHash, randomBytes } from "node:crypto";

/**
 * I01 `hashToken`: SHA-256 of utf8 plaintext, hex.
 * Not F07's `earned-work-token:` prefixed digest.
 */
export function hashToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function tokenFingerprint(token) {
  return `sha256:${hashToken(token)}`;
}

export function idempotencyKey(label = "csg") {
  return `${label}-${randomBytes(8).toString("hex")}`;
}

export function publicId(prefix = "contrib") {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}
