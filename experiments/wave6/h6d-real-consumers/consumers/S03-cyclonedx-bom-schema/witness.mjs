/**
 * Independent used-JSON-Pointer witness.
 * Literal equality at caller pointers. Does not import kit compare/oracle.
 */
import fs from "node:fs";

export function parseJsonPointer(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { ok: false, code: "invalid-json-pointer", pointer };
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  return { ok: true, tokens };
}

export function getAtPointer(doc, pointer) {
  const parsed = parseJsonPointer(pointer);
  if (!parsed.ok) {
    return { present: false, invalid: true, code: parsed.code, pointer };
  }
  let cur = doc;
  for (const token of parsed.tokens) {
    if (cur === null || typeof cur !== "object") {
      return { present: false, pointer };
    }
    if (!Object.prototype.hasOwnProperty.call(cur, token)) {
      return { present: false, pointer };
    }
    cur = cur[token];
  }
  return { present: true, value: cur, pointer };
}

function readJsonMaybe(input) {
  if (input == null) return input;
  if (typeof input === "object") return input;
  if (typeof input !== "string") {
    throw new Error("witness input must be object, JSON text, or file path");
  }
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return JSON.parse(fs.readFileSync(input, "utf8"));
}

function asUsed(used) {
  if (used == null) return { pointers: [] };
  if (Array.isArray(used)) return { pointers: used };
  const doc = typeof used === "string" ? readJsonMaybe(used) : used;
  if (doc && Array.isArray(doc.pointers)) return { pointers: doc.pointers };
  throw new Error("used must be { pointers: string[] } or string[]");
}

function stable(value) {
  return JSON.stringify(value);
}

function clip(value, n = 160) {
  const text = typeof value === "string" ? value : stable(value);
  if (text.length <= n) return text;
  return `${text.slice(0, n)}…`;
}

function lastToken(pointer) {
  if (!pointer) return "";
  const parts = pointer.split("/");
  return parts[parts.length - 1] || "";
}

const ANNOTATION_TOKENS = new Set(["description", "title", "$comment", "examples", "default"]);

/**
 * @param {object|string} before
 * @param {object|string} after
 * @param {object|string|string[]} [used]
 * @returns {{fact: string, changed: object[], unchanged: object[], added: object[], removed: object[], unknown: object[]}}
 */
export function witness(before, after, used) {
  const beforeDoc = readJsonMaybe(before);
  const afterDoc = readJsonMaybe(after);
  const { pointers } = asUsed(used);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];

  for (const pointer of pointers) {
    if (typeof pointer !== "string") {
      unknown.push({ pointer, reason: "malformed-used-entry" });
      continue;
    }
    const beforeHit = getAtPointer(beforeDoc, pointer);
    const afterHit = getAtPointer(afterDoc, pointer);
    if (beforeHit.invalid || afterHit.invalid) {
      unknown.push({ pointer, reason: "invalid-json-pointer" });
      continue;
    }
    if (!beforeHit.present && !afterHit.present) {
      unknown.push({ pointer, reason: "absent-in-both" });
      continue;
    }
    const annotation = ANNOTATION_TOKENS.has(lastToken(pointer));
    if (!beforeHit.present && afterHit.present) {
      added.push({ pointer, after: clip(afterHit.value), annotation });
      continue;
    }
    if (beforeHit.present && !afterHit.present) {
      removed.push({ pointer, before: clip(beforeHit.value), annotation });
      continue;
    }
    if (stable(beforeHit.value) === stable(afterHit.value)) {
      unchanged.push({ pointer, annotation });
    } else {
      changed.push({
        pointer,
        annotation,
        before: clip(beforeHit.value),
        after: clip(afterHit.value),
      });
    }
  }

  const factParts = [];
  if (changed.length) factParts.push(`${changed.length} changed`);
  if (added.length) factParts.push(`${added.length} added`);
  if (removed.length) factParts.push(`${removed.length} removed`);
  if (unchanged.length) factParts.push(`${unchanged.length} unchanged`);
  if (unknown.length) factParts.push(`${unknown.length} unknown`);
  const fact = factParts.length
    ? `used JSON Pointer literal delta: ${factParts.join(", ")}`
    : "no used pointers";

  return { fact, changed, unchanged, added, removed, unknown };
}

export default witness;
