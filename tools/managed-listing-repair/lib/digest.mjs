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

export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

/** Evidence digest binds the source observation, not the suggestion. */
export function bindEvidenceDigest(source) {
  return sha256Text(`evidence\n${canonical(source)}`);
}

export function bindSuggestionDigest({ evidenceDigest, changes, engineDigest }) {
  return sha256Text(
    `suggestion\nevidence=${evidenceDigest}\nengine=${engineDigest || ""}\n${canonical(changes)}`,
  );
}
