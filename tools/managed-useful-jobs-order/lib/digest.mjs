import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function fileDigest(filePath) {
  const buf = readFileSync(filePath);
  return { bytes: buf.length, sha256: sha256Bytes(buf) };
}

export function statBytes(filePath) {
  return statSync(filePath).size;
}

export function normalizeSha256(value) {
  const hex = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!HEX64.test(hex)) return null;
  return hex;
}

export function assertSha256(value, label = "sha256") {
  const hex = normalizeSha256(value);
  if (!hex) {
    throw new Error(`${label} must be 64 lowercase hex characters`);
  }
  return hex;
}

/**
 * I01-style canonical terms hash: sorted-key JSON, SHA-256 hex.
 * Binds engine pin and input digests, not filesystem paths.
 */
export function hashTerms(terms) {
  return sha256Text(stableStringify(terms));
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}
