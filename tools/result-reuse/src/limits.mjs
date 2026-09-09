import { PAYLOAD_MAX_BYTES } from "./pins.mjs";

export const INPUT_MAX_BYTES = 1_048_576;
export const JSON_MAX_DEPTH = 24;
export const JSON_MAX_ARRAY_ITEMS = 1_000;
export const JSON_MAX_OBJECT_KEYS = 1_000;
export const JSON_MAX_NODES = 20_000;
export const JSON_MAX_STRING_BYTES = 65_536;

export function checkInputBounds(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") throw new BoundsError("input must be JSON data");
    const encoded = Buffer.byteLength(json, "utf8");
    if (encoded > INPUT_MAX_BYTES) throw new BoundsError("input exceeds the 1048576-byte limit");

    let nodes = 0;
    const visit = (item, depth) => {
      nodes += 1;
      if (nodes > JSON_MAX_NODES) throw new BoundsError("input exceeds the 20000-node limit");
      if (depth > JSON_MAX_DEPTH) throw new BoundsError("input exceeds the 24-level depth limit");
      if (typeof item === "string" && Buffer.byteLength(item, "utf8") > JSON_MAX_STRING_BYTES) {
        throw new BoundsError("input contains a string over the 65536-byte limit");
      }
      if (Array.isArray(item)) {
        if (item.length > JSON_MAX_ARRAY_ITEMS) throw new BoundsError("input array exceeds the 1000-item limit");
        for (const child of item) visit(child, depth + 1);
      } else if (item && typeof item === "object") {
        const entries = Object.entries(item);
        if (entries.length > JSON_MAX_OBJECT_KEYS) throw new BoundsError("input object exceeds the 1000-key limit");
        for (const [key, child] of entries) {
          if (Buffer.byteLength(key, "utf8") > JSON_MAX_STRING_BYTES) {
            throw new BoundsError("input contains an oversized object key");
          }
          visit(child, depth + 1);
        }
      }
    };
    visit(value, 0);
    return { ok: true, bytes: encoded, nodes };
  } catch (error) {
    if (error instanceof BoundsError) return failure(error.message);
    return failure("input cannot be bounded safely");
  }
}

export function checkPayloadBytes(payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  return bytes <= PAYLOAD_MAX_BYTES
    ? { ok: true, bytes }
    : failure("selected payload exceeds the 32768-byte export limit");
}

class BoundsError extends Error {}

function failure(message) {
  return { ok: false, message };
}
