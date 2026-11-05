import { createHash } from "node:crypto";
import { PAYLOAD_MAX_BYTES } from "./limits.mjs";

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

export function digestPayload(payload) {
  const text = stableStringify(payload ?? {});
  if (Buffer.byteLength(text, "utf8") > PAYLOAD_MAX_BYTES) {
    const err = new Error(`payload exceeds ${PAYLOAD_MAX_BYTES} bytes`);
    err.code = "OVERSIZE";
    throw err;
  }
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export function pickFields(payload, fields) {
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload ?? {}, field)) {
      out[field] = payload[field];
    }
  }
  return out;
}
