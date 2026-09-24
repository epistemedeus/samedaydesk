import { getAtPointer, isLocalRef, pointerFromLocalRef } from "./pointer.mjs";

const MAX_REF_DEPTH = 8;

export function collectRefs(node, acc = [], seen = new Set(), depth = 0) {
  if (depth > 16 || node === null || typeof node !== "object") return acc;
  if (seen.has(node)) return acc;
  seen.add(node);
  if (typeof node.$ref === "string") acc.push(node.$ref);
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, acc, seen, depth + 1);
    return acc;
  }
  for (const value of Object.values(node)) collectRefs(value, acc, seen, depth + 1);
  return acc;
}

export function remoteRefsInNode(node) {
  return collectRefs(node).filter((ref) => !isLocalRef(ref));
}

export function resolveLocalRef(doc, ref, depth = 0, stack = []) {
  if (!isLocalRef(ref)) {
    return { ok: false, remote: true, ref };
  }
  if (depth > MAX_REF_DEPTH) {
    return { ok: false, truncated: true, ref };
  }
  if (stack.includes(ref)) {
    return { ok: false, cycle: true, ref };
  }
  const pointer = pointerFromLocalRef(ref);
  const hit = getAtPointer(doc, pointer);
  if (!hit.present) {
    return { ok: false, missing: true, ref };
  }
  if (hit.value && typeof hit.value === "object" && typeof hit.value.$ref === "string") {
    return resolveLocalRef(doc, hit.value.$ref, depth + 1, [...stack, ref]);
  }
  return { ok: true, ref, value: hit.value };
}
