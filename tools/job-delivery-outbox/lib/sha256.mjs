import { createHash } from "node:crypto";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
