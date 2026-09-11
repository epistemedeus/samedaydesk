import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, SIBLING_SLOTS } from "./pins.mjs";

export function scanSiblingSlots({ repoRoot = REPO_ROOT } = {}) {
  return SIBLING_SLOTS.map((slot) => {
    const path = join(repoRoot, slot.rel);
    const present = existsSync(path);
    return {
      id: `sibling-${slot.id}`,
      kind: "sibling-receipt",
      slot: slot.id,
      present,
      path: present ? path : slot.rel,
    };
  });
}
