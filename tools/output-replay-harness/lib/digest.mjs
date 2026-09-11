import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function contentHashBytes(buf) {
  return `sha256:${sha256Bytes(buf)}`;
}

export function contentHashFile(filePath) {
  return contentHashBytes(readFileSync(filePath));
}
