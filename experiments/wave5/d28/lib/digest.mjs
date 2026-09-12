import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  const st = statSync(filePath);
  if (!st.isFile()) throw new Error(`expected a regular file: ${filePath}`);
  return sha256Bytes(readFileSync(filePath));
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function stripGeneratedAt(value) {
  if (Array.isArray(value)) return value.map(stripGeneratedAt);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "generatedAt") continue;
      out[k] = stripGeneratedAt(v);
    }
    return out;
  }
  return value;
}

export function domainDigestFromJson(value) {
  return sha256Text(JSON.stringify(stripGeneratedAt(value)));
}
