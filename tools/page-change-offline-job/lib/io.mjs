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

// Compare decimal meanings, allowing 19.9900 == 1.999e1. Refuse a token that
// JavaScript would silently round, overflow, or underflow instead of certifying
// the rounded value as an unchanged held fact. This is not arbitrary precision.
function decimalIdentity(literal) {
  const [coefficient, exponent = "0"] = literal.toLowerCase().split("e");
  const fractionLength = coefficient.split(".")[1]?.length ?? 0;
  let digits = coefficient.replace(/[-.]/g, "").replace(/^0+/, "");
  if (!digits) return "0";
  const trailingZeros = digits.match(/0+$/)?.[0].length ?? 0;
  digits = digits.slice(0, digits.length - trailingZeros);
  const power = Number(exponent) - fractionLength + trailingZeros;
  if (!Number.isSafeInteger(power)) return null;
  return `${coefficient.startsWith("-") ? "-" : ""}${digits}e${power}`;
}

export function readBoundedJson(path, maxBytes = DEFAULT_LIMITS.maxBytes) {
  const file = readBoundedFile(path, maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(file.bytes.toString("utf8"), (key, value, context) => {
      if (typeof value === "number" && (!Number.isFinite(value)
          || decimalIdentity(context.source) !== decimalIdentity(String(value)))) {
        throw Object.assign(new Error("input JSON number loses decimal precision in this runtime; supply an exact string fact instead"), {
          code: ERROR_CODES.INPUT_PRECISION,
        });
      }
      return value;
    });
  } catch (cause) {
    if (cause.code === ERROR_CODES.INPUT_PRECISION) throw cause;
    const error = new Error("input is not JSON");
    error.code = ERROR_CODES.UNRECOGNIZED_BATCH;
    throw error;
  }
  return { ...file, parsed };
}

export function inMemoryJson(body, maxBytes, path = null) {
  const text = JSON.stringify(body, (key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw Object.assign(new Error("input JSON numbers must be finite"), { code: ERROR_CODES.INPUT_PRECISION });
    }
    if (["undefined", "bigint", "function", "symbol"].includes(typeof value)) {
      throw Object.assign(new Error("input must contain only JSON values"), { code: ERROR_CODES.UNRECOGNIZED_BATCH });
    }
    return value;
  });
  const byteLength = Buffer.byteLength(text);
  if (byteLength > maxBytes) {
    throw Object.assign(new Error(`input exceeds the ${maxBytes}-byte limit`), { code: ERROR_CODES.INPUT_BOUNDS });
  }
  return { parsed: body, byteLength, path, sha256: sha256Hex(Buffer.from(text)) };
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
