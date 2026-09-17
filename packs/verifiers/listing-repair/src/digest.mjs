import { createHash } from "node:crypto";

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function digestOf(value) {
  return `sha256:${sha256Hex(canonicalStringify(value))}`;
}

export function normalizeDigest(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  return s.startsWith("sha256:") ? s : `sha256:${s}`;
}

export function jsonEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return canonicalStringify(a) === canonicalStringify(b);
}

export function snapshotDigest(snapshot) {
  if (snapshot == null) return null;
  return digestOf(snapshot);
}

/** Engine packet.digest is a 16-char hex prefix, not sha256:<64>. */
export function normalizePacketDigest(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  return s.startsWith("sha256:") ? s.slice("sha256:".length) : s;
}
