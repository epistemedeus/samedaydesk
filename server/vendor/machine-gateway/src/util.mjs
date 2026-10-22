import { createHash } from "node:crypto";
import { fail } from "./errors.mjs";

export const sha256 = value => createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export const digest = value => sha256(canonical(value));
export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function boundedJson(text, maxBytes = 131072) {
  if (Buffer.byteLength(text) > maxBytes) fail("body_too_large", 413);
  let value;
  try { value = JSON.parse(text); } catch { fail("invalid_json"); }
  let nodes = 0;
  const visit = (node, depth) => {
    if (++nodes > 12000 || depth > 16) fail("json_complexity");
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) fail("unsafe_json_key");
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
  return value;
}

export function abortable(work, signal) {
  signal.throwIfAborted();
  let onAbort;
  return Promise.race([
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }),
    new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    }),
  ]).finally(() => signal.removeEventListener("abort", onAbort));
}
