/**
 * Deterministic JSON for hashing (JCS-subset for this pack's types).
 * Objects: lexicographic keys. Arrays: order preserved. Integers only.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalize(value) {
  return writeCanonical(value);
}

function writeCanonical(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error("canonical JSON rejects non-integer numbers");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => writeCanonical(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${writeCanonical(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error("canonical JSON rejects this value type");
}

export { isPlainObject };
