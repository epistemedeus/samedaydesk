import { EXECUTABLE_PAYLOAD_KEYS } from "./constants.js";
import { isPlainObject } from "./money.js";

const FORBIDDEN = new Set(
  EXECUTABLE_PAYLOAD_KEYS.map((key) => key.toLowerCase().replace(/[-_]/g, "")),
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

/**
 * Walk a terms document and reject execution hints / inline untrusted code.
 * `execute` is allowed only at the document root, and only as the literal false.
 */
export function findExecutablePayload(
  input: unknown,
  path: Array<string | number> = [],
): { path: Array<string | number>; key: string } | null {
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      const found = findExecutablePayload(input[i], [...path, i]);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(input)) return null;

  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeKey(key);
    const atRoot = path.length === 0;
    if (normalized === "execute") {
      if (!atRoot || value !== false) {
        return { path: [...path, key], key };
      }
      continue;
    }
    if (FORBIDDEN.has(normalized)) {
      return { path: [...path, key], key };
    }
    const found = findExecutablePayload(value, [...path, key]);
    if (found) return found;
  }
  return null;
}
