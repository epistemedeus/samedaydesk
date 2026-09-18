import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SLICE_DIR = resolve(here, "..");
export const MAP_PATH = join(SLICE_DIR, "map.json");
export const PIN_PATH = join(SLICE_DIR, "PIN.json");
export const MATRIX_PATH = join(SLICE_DIR, "matrix.json");
export const FIXTURE_ROOT = join(SLICE_DIR, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const SEEDED_FIXTURES = join(FIXTURE_ROOT, "seeded");
export const SEEDED_MANIFEST = join(SEEDED_FIXTURES, "manifest.json");

function looksLikeRepoRoot(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.name !== "samedaydesk") return false;
  } catch {
    return false;
  }
  return existsSync(join(dir, "fixtures/presence/catalog/x402.json"));
}

export function findRepoRoot(start) {
  const starts = [];
  if (start) starts.push(resolve(start));
  starts.push(process.cwd(), SLICE_DIR);
  for (const origin of starts) {
    let dir = origin;
    for (let i = 0; i < 12; i += 1) {
      if (looksLikeRepoRoot(dir)) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export function catalogPath(root) {
  return join(root, "fixtures/presence/catalog/x402.json");
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
