import { createHash } from "node:crypto";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function sha256Json(obj) {
  return sha256Canonical(obj);
}

export function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj));
}

export function sha256Canonical(obj) {
  return sha256Text(canonicalJson(obj));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export function opaqueTaskId(adapter, nativeId) {
  const hex = sha256Text(`${adapter}|${nativeId ?? ""}`).slice(0, 32);
  return `bty_${hex}`;
}
