import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

/** Accept `sha256:<hex>` or bare 64-char hex. Return lowercase hex or null. */
export function parseDigest(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const prefixed = /^sha256:([0-9a-f]{64})$/i.exec(trimmed);
  if (prefixed) return prefixed[1].toLowerCase();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function formatDigest(hex) {
  return `sha256:${String(hex).toLowerCase()}`;
}
