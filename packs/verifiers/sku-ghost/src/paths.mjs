import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTHORITATIVE_REL, CLIENT_CATALOG_REL, LLMS_REL } from "./constants.mjs";

export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, AUTHORITATIVE_REL)) &&
      existsSync(join(dir, CLIENT_CATALOG_REL)) &&
      existsSync(join(dir, LLMS_REL))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function committedPaths(repoRoot) {
  return {
    pricing: join(repoRoot, AUTHORITATIVE_REL),
    catalog: join(repoRoot, CLIENT_CATALOG_REL),
    llms: join(repoRoot, LLMS_REL),
  };
}
