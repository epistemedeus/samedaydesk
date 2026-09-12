import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DEFAULT_LIMITS, ERROR_CODES } from "./constants.mjs";
import { sha256Hex } from "./hash-terms.mjs";
import { looksLikeFetchUrl } from "./refuse.mjs";

export function readBoundedFile(path, maxBytes = DEFAULT_LIMITS.maxBytes) {
  if (looksLikeFetchUrl(path)) {
    const error = new Error("live fetch URL input is refused; supply already-held local extract-batch JSON files");
    error.code = ERROR_CODES.LIVE_FETCH_URL;
    throw error;
  }
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (size > maxBytes) {
      const error = new Error(`input exceeds the ${maxBytes}-byte limit`);
      error.code = ERROR_CODES.INPUT_BOUNDS;
      throw error;
    }
    const bytes = readFileSync(descriptor);
    return { bytes, sha256: sha256Hex(bytes), byteLength: bytes.length, path };
  } finally {
    closeSync(descriptor);
  }
}

export function readBoundedJson(path, maxBytes = DEFAULT_LIMITS.maxBytes) {
  const file = readBoundedFile(path, maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(file.bytes.toString("utf8"));
  } catch {
    const error = new Error("input is not JSON");
    error.code = ERROR_CODES.UNRECOGNIZED_BATCH;
    throw error;
  }
  return { ...file, parsed };
}

export function resolveJobPath(jobDir, value) {
  if (looksLikeFetchUrl(value)) {
    const error = new Error("live fetch URL input is refused; supply already-held local extract-batch JSON files");
    error.code = ERROR_CODES.LIVE_FETCH_URL;
    throw error;
  }
  return isAbsolute(value) ? value : resolve(jobDir, value);
}

export function writeOutputs(outDir, jsonText, mdText) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "page-change.json");
  const mdPath = resolve(outDir, "page-change.md");
  writeFileSync(jsonPath, jsonText);
  writeFileSync(mdPath, mdText);
  return { jsonPath, mdPath };
}

export function jobDir(jobPath) {
  return dirname(resolve(jobPath));
}
