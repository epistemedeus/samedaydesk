import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}
