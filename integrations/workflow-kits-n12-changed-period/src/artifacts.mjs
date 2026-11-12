/** Paths and sha256 of the packaged Make and n8n artifacts. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const KIT_ARTIFACTS = Object.freeze({ make: "make/changed-period.blueprint.json", n8n: "n8n/changed-period.workflow.json" });

export function kitPath(rel) {
  return join(root, rel);
}

export function artifactDigests() {
  return Object.fromEntries(Object.entries(KIT_ARTIFACTS).map(([name, rel]) => {
    const bytes = readFileSync(kitPath(rel));
    return [name, { path: rel, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }];
  }));
}
