/**
 * Locate and hash the packaged importable artifacts, so an installed consumer can find
 * the Make blueprint and n8n workflow without knowing the install layout.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const KIT_ARTIFACTS = Object.freeze({
  make: "make/record-to-accepted-output.blueprint.json",
  n8n: "n8n/record-to-accepted-output.workflow.json",
});

/** Absolute path of a packaged file, relative to the kit root. */
export function kitPath(rel) {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

/** Raw bytes, byte count and sha256 of each packaged importable artifact. */
export function artifactDigests() {
  const out = {};
  for (const [name, rel] of Object.entries(KIT_ARTIFACTS)) {
    const bytes = readFileSync(kitPath(rel));
    out[name] = { path: rel, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return out;
}
