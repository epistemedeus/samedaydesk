import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PUBLISHED } from "./paths.mjs";
import { parseFamiliesMarkdown } from "./families.mjs";

async function importPublished(path) {
  return import(pathToFileURL(path).href);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCatalog(bytes) {
  const catalog = JSON.parse(bytes.toString("utf8"));
  if (catalog.schema !== "useful-jobs.catalog.v1") {
    throw new Error("unsupported_catalog_schema");
  }
  if (!Array.isArray(catalog.jobs) || catalog.jobs.length === 0) {
    throw new Error("catalog_missing_jobs");
  }
  return catalog;
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`http_${res.status}:${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function loadCatalogFromFile(path = PUBLISHED.catalog) {
  const bytes = readFileSync(path);
  const catalog = parseCatalog(bytes);
  return { catalog, evidenceClass: "local-runtime-fs", path, bytes, sha256: sha256Bytes(bytes) };
}

export function loadRecipeSpecsFromDir(dir = PUBLISHED.recipeSpecsDir) {
  const files = readdirSync(dir).filter((name) => name.endsWith(".recipe.json")).sort();
  const specs = files.map((name) => {
    const path = join(dir, name);
    const bytes = readFileSync(path);
    const spec = JSON.parse(bytes.toString("utf8"));
    if (spec.schema !== "samedaydesk.recipe-spec.v1") {
      throw new Error(`unsupported_recipe_spec_schema:${name}`);
    }
    return { spec, path, fileName: name, bytes, sha256: sha256Bytes(bytes) };
  });
  return { specs, evidenceClass: "local-runtime-fs", dir };
}

export async function loadRunnerRecipes(runnerPath = PUBLISHED.recipeRunner) {
  const mod = await importPublished(runnerPath);
  if (typeof mod.listRecipes !== "function") {
    throw new Error("recipe_runner_missing_listRecipes");
  }
  return {
    recipes: mod.listRecipes(),
    evidenceClass: "local-runtime-fs",
    path: runnerPath,
  };
}

export function loadFamiliesFromFiles({
  familiesDoc = PUBLISHED.familiesDoc,
  familyDiscovery = PUBLISHED.familyDiscovery,
} = {}) {
  const familiesBytes = readFileSync(familiesDoc);
  const discoveryBytes = readFileSync(familyDiscovery);
  const fromDoc = parseFamiliesMarkdown(familiesBytes.toString("utf8"));
  const discovery = JSON.parse(discoveryBytes.toString("utf8"));
  const discoveryIds = Array.isArray(discovery.families) ? discovery.families.map(String) : [];
  return {
    families: fromDoc,
    discoveryIds,
    discovery,
    evidenceClass: "local-runtime-fs",
    familiesDoc,
    familyDiscovery,
    familiesSha256: sha256Bytes(familiesBytes),
    discoverySha256: sha256Bytes(discoveryBytes),
  };
}

export async function loadRouter(routerPath = PUBLISHED.offerRouter) {
  const mod = await importPublished(routerPath);
  if (typeof mod.routeJob !== "function" || typeof mod.routeJobFromFile !== "function") {
    throw new Error("offer_router_missing_routeJob");
  }
  return mod;
}

export function defaultHashTerms() {
  return {
    owner: "I01",
    surface: "neomorphic-io PR54 earned-work core",
    available: false,
    importedKernel: false,
    originalF01Wholesale: false,
    binding: "later-integration",
    synthetic: true,
    reason: "neo_pr54_not_in_this_checkout",
    contract: null,
    note: "Prefer I01 integrated hash-terms if that contract is injected. Do not cherry-pick original F01 wholesale. Synthetic later-integration is not an I01 pin.",
  };
}

export async function fetchJson(url) {
  const bytes = await fetchBytes(url);
  return JSON.parse(bytes.toString("utf8"));
}

export async function fetchText(url) {
  const bytes = await fetchBytes(url);
  return bytes.toString("utf8");
}

export async function loadCatalogFromHttp(origin) {
  const path = `${origin}/catalog.json`;
  const bytes = await fetchBytes(path);
  const catalog = parseCatalog(bytes);
  return { catalog, evidenceClass: "local-runtime-http", path, bytes, sha256: sha256Bytes(bytes) };
}

export async function loadRecipeSpecsFromHttp(origin) {
  const index = await fetchJson(`${origin}/recipes/index.json`);
  const specs = [];
  for (const fileName of index.files) {
    const path = `${origin}/recipes/${fileName}`;
    const bytes = await fetchBytes(path);
    const spec = JSON.parse(bytes.toString("utf8"));
    if (spec.schema !== "samedaydesk.recipe-spec.v1") {
      throw new Error(`unsupported_recipe_spec_schema:${fileName}`);
    }
    specs.push({ spec, path, fileName, bytes, sha256: sha256Bytes(bytes) });
  }
  return { specs, evidenceClass: "local-runtime-http", dir: `${origin}/recipes` };
}

export async function loadFamiliesFromHttp(origin) {
  const familiesDoc = `${origin}/families.md`;
  const familyDiscovery = `${origin}/family-discovery.json`;
  const familiesBytes = await fetchBytes(familiesDoc);
  const discoveryBytes = await fetchBytes(familyDiscovery);
  const discovery = JSON.parse(discoveryBytes.toString("utf8"));
  return {
    families: parseFamiliesMarkdown(familiesBytes.toString("utf8")),
    discoveryIds: Array.isArray(discovery.families) ? discovery.families.map(String) : [],
    discovery,
    evidenceClass: "local-runtime-http",
    familiesDoc,
    familyDiscovery,
    familiesSha256: sha256Bytes(familiesBytes),
    discoverySha256: sha256Bytes(discoveryBytes),
  };
}
