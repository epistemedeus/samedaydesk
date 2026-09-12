import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Recursively drop documented `generatedAt` keys; sort remaining object keys. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (key === "generatedAt") continue;
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export function stableJsonDigest(obj) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(obj))));
}

function fileKind(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return "bytes";
}

function bytesEqual(a, b) {
  return a.length === b.length && a.equals(b);
}

/**
 * JSON: compare stableJsonDigest (generatedAt excluded, keys sorted).
 * Markdown: require raw byte identity (no whitespace/newline normalization).
 */
export function filesEquivalent(pathA, pathB) {
  if (!existsSync(pathA) || !existsSync(pathB)) {
    return { equal: false, reason: "missing-file" };
  }
  const kindA = fileKind(pathA);
  const kindB = fileKind(pathB);
  if (kindA !== kindB) {
    return { equal: false, reason: `kind-mismatch:${kindA}!=${kindB}` };
  }
  if (kindA === "json") {
    let objA;
    let objB;
    try {
      objA = JSON.parse(readFileSync(pathA, "utf8"));
    } catch {
      return { equal: false, reason: "json-parse-a" };
    }
    try {
      objB = JSON.parse(readFileSync(pathB, "utf8"));
    } catch {
      return { equal: false, reason: "json-parse-b" };
    }
    const digestA = stableJsonDigest(objA);
    const digestB = stableJsonDigest(objB);
    if (digestA === digestB) return { equal: true, reason: "stable-json" };
    return { equal: false, reason: `stable-json-mismatch:${digestA}!=${digestB}` };
  }
  const rawA = readFileSync(pathA);
  const rawB = readFileSync(pathB);
  if (bytesEqual(rawA, rawB)) return { equal: true, reason: "byte-identity" };
  return {
    equal: false,
    reason: `byte-mismatch:${sha256Bytes(rawA)}!=${sha256Bytes(rawB)}`,
  };
}
