import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_NAME } from "./pins.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = resolve(HERE, "..");
const MODULE_REPO_ROOT = resolve(HERE, "../..");

export function packRoot() {
  return PACK_ROOT;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function resolveRoot(explicit) {
  if (explicit) {
    const root = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
    return root;
  }
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = readJson(pkgPath);
        if (pkg.name === REPO_NAME) return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return MODULE_REPO_ROOT;
}

export function rel(root, ...parts) {
  return join(root, ...parts);
}

export function hasNodeModules(root) {
  return existsSync(join(root, "node_modules"));
}

export function hasClientDist(root) {
  return existsSync(join(root, "client/dist/index.html"));
}
