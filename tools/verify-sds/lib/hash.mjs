import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function fileBytes(path) {
  return statSync(path).size;
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function sha256Json(value) {
  return sha256Text(stableStringify(value));
}

export function verifyLocalArchive(path, expectedSha, expectedBytes) {
  const bytes = fileBytes(path);
  const sha256 = sha256File(path);
  const ok = sha256 === expectedSha && bytes === expectedBytes;
  return { ok, path, sha256, bytes, expectedSha, expectedBytes };
}
