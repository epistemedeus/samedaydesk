import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

// Reconstruct an authenticated create retry without storing its bearer token.
// The bootstrap secret stays outside the database; grant rows store only hashes.
export function deriveOwnerToken(adminSecret: string, idempotencyKey: string): string {
  return `neo_own_${createHmac("sha256", adminSecret)
    .update(JSON.stringify(["neomorphic.owner.v1", idempotencyKey]))
    .digest("base64url")}`;
}

export function issueToken(prefix: string): string {
  return `${prefix}_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokensEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
