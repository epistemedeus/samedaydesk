import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pinsPath } from "./paths.mjs";

export function loadPins(path = pinsPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyAssets(root, path = join(root, "PINS.json")) {
  const pins = JSON.parse(readFileSync(path, "utf8"));
  const mismatches = [];
  for (const item of pins.files) {
    const file = join(root, item.path);
    let got = null;
    let bytes = null;
    try {
      const body = readFileSync(file);
      got = createHash("sha256").update(body).digest("hex");
      bytes = body.length;
    } catch {
      mismatches.push({ path: item.path, expected: item.sha256, got: null });
      continue;
    }
    if (got !== item.sha256 || bytes !== item.bytes) {
      mismatches.push({ path: item.path, expected: item.sha256, got, bytes, expectedBytes: item.bytes });
    }
  }
  return { ok: mismatches.length === 0, mismatches, pins };
}
