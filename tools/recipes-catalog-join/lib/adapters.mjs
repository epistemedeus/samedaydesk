import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PUBLISHED } from "./paths.mjs";
import { parseFamiliesMarkdown } from "./families.mjs";

async function importPublished(path) {
  return import(pathToFileURL(path).href);
}

export async function loadCatalogFromFile(path = PUBLISHED.catalog) {
  const catalog = JSON.parse(readFileSync(path, "utf8"));
  if (catalog.schema !== "useful-jobs.catalog.v1") {
    throw new Error("unsupported_catalog_schema");
  }
  if (!Array.isArray(catalog.jobs) || catalog.jobs.length === 0) {
    throw new Error("catalog_missing_jobs");
  }
  return { catalog, evidenceClass: "local-runtime-fs", path };
}

export function loadRecipeSpecsFromDir(dir = PUBLISHED.recipeSpecsDir) {
  const files = readdirSync(dir).filter((name) => name.endsWith(".recipe.json")).sort();
  const specs = files.map((name) => {
    const path = join(dir, name);
    const spec = JSON.parse(readFileSync(path, "utf8"));
    if (spec.schema !== "samedaydesk.recipe-spec.v1") {
      throw new Error(`unsupported_recipe_spec_schema:${name}`);
    }
    return { spec, path, fileName: name };
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
  const markdown = readFileSync(familiesDoc, "utf8");
  const fromDoc = parseFamiliesMarkdown(markdown);
  const discovery = JSON.parse(readFileSync(familyDiscovery, "utf8"));
  const discoveryIds = Array.isArray(discovery.families) ? discovery.families.map(String) : [];
  return {
    families: fromDoc,
    discoveryIds,
    discovery,
    evidenceClass: "local-runtime-fs",
    familiesDoc,
    familyDiscovery,
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
    reason: "neo_pr54_not_in_this_checkout",
    contract: null,
    note: "Prefer I01 integrated hash-terms if that contract is injected. Do not cherry-pick original F01 wholesale.",
  };
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`http_${res.status}:${url}`);
  }
  return res.json();
}

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`http_${res.status}:${url}`);
  }
  return res.text();
}

export async function loadCatalogFromHttp(origin) {
  const catalog = await fetchJson(`${origin}/catalog.json`);
  if (catalog.schema !== "useful-jobs.catalog.v1") {
    throw new Error("unsupported_catalog_schema");
  }
  return { catalog, evidenceClass: "local-runtime-http", path: `${origin}/catalog.json` };
}

export async function loadRecipeSpecsFromHttp(origin) {
  const index = await fetchJson(`${origin}/recipes/index.json`);
  const specs = [];
  for (const fileName of index.files) {
    const spec = await fetchJson(`${origin}/recipes/${fileName}`);
    specs.push({ spec, path: `${origin}/recipes/${fileName}`, fileName });
  }
  return { specs, evidenceClass: "local-runtime-http", dir: `${origin}/recipes` };
}

export async function loadFamiliesFromHttp(origin) {
  const markdown = await fetchText(`${origin}/families.md`);
  const discovery = await fetchJson(`${origin}/family-discovery.json`);
  return {
    families: parseFamiliesMarkdown(markdown),
    discoveryIds: Array.isArray(discovery.families) ? discovery.families.map(String) : [],
    discovery,
    evidenceClass: "local-runtime-http",
    familiesDoc: `${origin}/families.md`,
    familyDiscovery: `${origin}/family-discovery.json`,
  };
}
