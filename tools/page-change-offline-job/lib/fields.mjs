import { ERROR_CODES, SUPPORTED_FIELDS } from "./constants.mjs";
import { isPlainObject } from "./canonical.mjs";

export function normalizeFields(input) {
  if (input === undefined || input === null) {
    const error = new Error("fields must be an explicit non-empty unique subset of supported extraction fields");
    error.code = ERROR_CODES.FIELDS_REQUIRED;
    throw error;
  }
  const list = typeof input === "string"
    ? input.split(",").map((part) => part.trim()).filter(Boolean)
    : input;
  if (!Array.isArray(list) || list.length === 0) {
    const error = new Error("fields must be an explicit non-empty unique subset of supported extraction fields");
    error.code = ERROR_CODES.FIELDS_REQUIRED;
    throw error;
  }
  const unique = [...new Set(list)];
  if (unique.length !== list.length) {
    const error = new Error("fields must not contain duplicates");
    error.code = ERROR_CODES.FIELDS_REQUIRED;
    throw error;
  }
  for (const field of unique) {
    if (!SUPPORTED_FIELDS.includes(field)) {
      const error = new Error(`unsupported field: ${field}`);
      error.code = ERROR_CODES.UNSUPPORTED_FIELD;
      throw error;
    }
  }
  return Object.freeze(unique);
}

export function normalizeTitleFact(value) {
  if (typeof value !== "string") return value;
  return value.normalize("NFC").replace(/[ \t]+/g, " ").trim();
}

export function pickPresent(data, fields) {
  if (!isPlainObject(data)) return { present: {}, absent: [...fields] };
  const present = Object.create(null);
  const absent = [];
  for (const field of fields) {
    if (!Object.hasOwn(data, field)) {
      absent.push(field);
      continue;
    }
    const value = data[field];
    present[field] = field === "title" ? normalizeTitleFact(value) : value;
  }
  return { present, absent };
}
