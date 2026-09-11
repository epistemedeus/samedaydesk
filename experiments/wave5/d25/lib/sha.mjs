import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) throw new Error(`sha256File expected a file: ${filePath}`);
  return sha256Bytes(readFileSync(filePath));
}

export function freezeFile(name, filePath) {
  const buf = readFileSync(filePath);
  return {
    name,
    path: filePath,
    bytes: buf.length,
    sha256: sha256Bytes(buf),
  };
}
