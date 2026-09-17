import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FEATURES_DIR = dirname(fileURLToPath(import.meta.url));
export const SCHEMA = "samedaydesk.verify-sds.feature-map.v1";
export const REQUIRED_FAMILIES = Object.freeze(["useful-jobs", "packs", "mcp"]);
export const SEEDED_MISSING_SURFACE = "missing-surface";
export const PRIMARY_MISSING_SURFACE = "mcp.tools.list";

export function defaultRepoRoot() {
  return resolve(FEATURES_DIR, "../../..");
}

export function defaultCatalogPath() {
  return join(FEATURES_DIR, "catalog.json");
}

export function seededMapDir() {
  return join(FEATURES_DIR, "fixtures", "seeded-missing-surface");
}

export function loadCatalog(catalogPath = defaultCatalogPath()) {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!raw || raw.schema !== SCHEMA) {
    throw new Error(`catalog_invalid_schema:${catalogPath}`);
  }
  if (!Array.isArray(raw.surfaces) || raw.surfaces.length === 0) {
    throw new Error("catalog_empty");
  }
  const families = Array.isArray(raw.families) ? raw.families : REQUIRED_FAMILIES;
  for (const family of REQUIRED_FAMILIES) {
    if (!families.includes(family)) {
      throw new Error(`catalog_missing_family:${family}`);
    }
  }
  return raw;
}

export function parseSurfacesFromMarkdown(text) {
  const ids = new Set();
  const lines = String(text).split(/\r?\n/);
  let inSurfaces = false;
  for (const line of lines) {
    if (/^##\s+Surfaces\b/.test(line)) {
      inSurfaces = true;
      continue;
    }
    if (inSurfaces && /^##\s+/.test(line)) break;
    if (!inSurfaces) continue;
    const match = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (!match) continue;
    const id = match[1].trim();
    if (!id || id === "id") continue;
    ids.add(id);
  }
  return ids;
}

export function listMapMarkdownFiles(mapDir) {
  const names = readdirSync(mapDir, { withFileTypes: true });
  return names
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(mapDir, entry.name))
    .sort();
}

export function documentedSurfaceIds(mapDir) {
  const ids = new Set();
  for (const file of listMapMarkdownFiles(mapDir)) {
    const text = readFileSync(file, "utf8");
    for (const id of parseSurfacesFromMarkdown(text)) ids.add(id);
  }
  return ids;
}

function probeRepoPaths(repoRoot, repoPaths) {
  const missing = [];
  for (const rel of repoPaths || []) {
    const abs = isAbsolute(rel) ? rel : join(repoRoot, rel);
    if (!existsSync(abs)) missing.push(rel);
  }
  return missing;
}

export function checkFeatureMap({
  repoRoot = defaultRepoRoot(),
  mapDir = FEATURES_DIR,
  catalogPath = defaultCatalogPath(),
  seed = null,
} = {}) {
  const catalog = loadCatalog(catalogPath || defaultCatalogPath());
  const documented = documentedSurfaceIds(mapDir);
  const missing = [];
  const missingRepo = [];
  const familyHits = Object.fromEntries(REQUIRED_FAMILIES.map((f) => [f, 0]));

  for (const surface of catalog.surfaces) {
    const id = surface.id;
    const family = surface.family;
    if (REQUIRED_FAMILIES.includes(family) && documented.has(id)) {
      familyHits[family] += 1;
    }
    if (!documented.has(id)) missing.push(id);
    const repoMiss = probeRepoPaths(repoRoot, surface.repoPaths);
    if (repoMiss.length) {
      missingRepo.push({ id, paths: repoMiss });
    }
  }

  const missingFamilies = REQUIRED_FAMILIES.filter((family) => familyHits[family] === 0);
  const ok = missing.length === 0 && missingRepo.length === 0 && missingFamilies.length === 0;
  const primaryMissing =
    missing.find((id) => id === PRIMARY_MISSING_SURFACE) || missing[0] || missingFamilies[0] || null;

  const result = {
    schema: SCHEMA,
    ok,
    seed: seed || null,
    mapDir,
    catalogPath,
    families: { ...familyHits },
    requiredFamilies: [...REQUIRED_FAMILIES],
    documented: [...documented].sort(),
    documentedCount: documented.size,
    requiredCount: catalog.surfaces.length,
    missing,
    missingRepo,
    missingFamilies,
  };

  if (!ok) {
    const seeded = Boolean(seed);
    result.error = {
      code: seeded ? "SEED_REJECT" : "missing_surface",
      productCode: "missing_surface",
      surface: primaryMissing,
      message: seeded
        ? `seeded missing surface flagged: ${primaryMissing}`
        : `missing surface flagged: ${primaryMissing}`,
    };
  }

  return result;
}

export function resolveSeed(seed) {
  if (!seed) return { seed: null, mapDir: FEATURES_DIR };
  if (seed !== SEEDED_MISSING_SURFACE) {
    const err = new Error(`unknown_seed:${seed}`);
    err.code = "unknown_seed";
    throw err;
  }
  return { seed, mapDir: seededMapDir() };
}
