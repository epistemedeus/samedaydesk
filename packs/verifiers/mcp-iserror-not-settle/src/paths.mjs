import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_REL } from "./rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(HERE, "..");

export function findRepoRoot(start = HERE) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, MCP_REL))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function committedPaths(repoRoot) {
  return {
    mcp: join(repoRoot, MCP_REL),
  };
}
