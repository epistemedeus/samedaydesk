/**
 * RFC 6901 JSON Pointer. Local $ref uses the same pointer after '#'.
 */

export function parseJsonPointer(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string") {
    return { ok: false, code: "invalid-json-pointer", pointer };
  }
  if (!pointer.startsWith("/")) {
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

export function isLocalRef(ref) {
  return typeof ref === "string" && ref.startsWith("#");
}

export function pointerFromLocalRef(ref) {
  if (!isLocalRef(ref)) return null;
  const hash = ref.slice(1);
  return hash === "" ? "" : hash;
}
