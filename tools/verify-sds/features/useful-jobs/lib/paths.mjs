import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SLICE_DIR = resolve(here, "..");
export const MAP_PATH = join(SLICE_DIR, "map.json");
export const PIN_PATH = join(SLICE_DIR, "PIN.json");

function looksLikeRepoRoot(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.name !== "samedaydesk") return false;
  } catch {
    return false;
  }
  return existsSync(join(dir, "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz"));
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

export function repoPaths(root, map) {
  const publicArchive = join(root, "client/public", map.surfaces.publicArchive.replace(/^\//, ""));
  const kitArchive = join(root, "client/public", map.surfaces.kitArchive.replace(/^\//, ""));
  return {
    root,
    publicArchive,
    kitArchive,
    discovery: join(root, "client/public", map.surfaces.discovery.replace(/^\//, "")),
    catalog: join(root, "client/public", map.surfaces.catalog.replace(/^\//, "")),
    outcomes: join(root, "client/public", map.surfaces.outcomes.replace(/^\//, "")),
    sha256Json: join(root, "client/public", map.surfaces.sha256Json.replace(/^\//, "")),
    kitJson: join(root, map.surfaces.kitJson),
    obtainBin: join(root, map.surfaces.obtainBin),
  };
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
