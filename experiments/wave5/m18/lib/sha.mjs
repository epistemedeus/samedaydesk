import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(path) {
  return sha256Hex(readFileSync(path));
}
