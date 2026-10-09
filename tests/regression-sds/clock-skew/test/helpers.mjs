import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PACK } from "../src/paths.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

export function walkPack(out = []) {
  walk(PACK, out);
  return out;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (/\.(mjs|json|md|txt)$/.test(name)) out.push(path);
  }
}

export function readPackFile(path) {
  return readFileSync(path, "utf8");
}
