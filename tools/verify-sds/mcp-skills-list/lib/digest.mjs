import { createHash } from "node:crypto";

export function sha256Hex(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Uri(bytes) {
  return `sha256:${sha256Hex(bytes)}`;
}

export function byteSize(bytes) {
  return Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(bytes);
}
