import { createHash } from "node:crypto";
import { BARE_HEX_RE, DIGEST_PREFIX, DIGEST_RE } from "./constants.mjs";
import { refuse } from "./refuse.mjs";

/**
 * Parse a declared identity digest.
 * Prefers I01 `sha256:<64 hex>`. Bare 64-hex from validate-next-run currentInputs is accepted.
 * Integer values (original F01 termsVersion style) are rejected, not coerced.
 */
export function parseDigest(value, { field = "digest" } = {}) {
  if (value == null || value === false || value === "") {
    return null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    throw refuse("invalid-digest", "Integer digest is rejected; use sha256:<64 hex> (I01 hash terms)", {
      field,
      got: value,
    });
  }
  if (typeof value !== "string") {
    throw refuse("invalid-digest", "digest must be sha256:<64 hex> or 64-hex", {
      field,
      gotType: typeof value,
    });
  }
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed) && !BARE_HEX_RE.test(trimmed)) {
    throw refuse("invalid-digest", "Integer digest is rejected; use sha256:<64 hex> (I01 hash terms)", {
      field,
      got: trimmed,
    });
  }
  const lower = trimmed.toLowerCase();
  if (DIGEST_RE.test(lower)) return lower.slice(DIGEST_PREFIX.length);
  if (BARE_HEX_RE.test(lower)) return lower;
  throw refuse("invalid-digest", "digest must be sha256:<64 hex> (I01) or 64-char hex (validate-next-run)", {
    field,
    got: trimmed,
  });
}

export function formatDigest(hex) {
  if (typeof hex !== "string" || !BARE_HEX_RE.test(hex)) {
    throw refuse("invalid-digest", "internal sha256 hex is not 64 chars", { got: hex });
  }
  return `${DIGEST_PREFIX}${hex.toLowerCase()}`;
}

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function declaredIdentity(slot) {
  if (slot == null) return { digestHex: null, bytes: null };
  if (typeof slot !== "object" || Array.isArray(slot)) {
    throw refuse("invalid-declared-inputs", "declaredInputs entries must be objects", { got: slot });
  }
  const digestRaw = slot.digest ?? slot.sha256 ?? null;
  const digestHex = parseDigest(digestRaw, { field: digestRaw != null && "digest" in slot ? "digest" : "sha256" });
  if (slot.digest != null && slot.sha256 != null) {
    const a = parseDigest(slot.digest, { field: "digest" });
    const b = parseDigest(slot.sha256, { field: "sha256" });
    if (a !== b) {
      throw refuse("invalid-digest", "digest and sha256 fields disagree", { digest: slot.digest, sha256: slot.sha256 });
    }
  }
  let bytes = slot.bytes ?? null;
  if (bytes != null) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) {
      throw refuse("invalid-declared-inputs", "declared bytes must be a non-negative number", { bytes });
    }
    bytes = n;
  }
  return { digestHex, bytes };
}
