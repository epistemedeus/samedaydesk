import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CASES_DIR, CATALOG_PATH, SCHEMA_PATH } from "./paths.mjs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadCatalog() {
  const catalog = readJson(CATALOG_PATH);
  if (catalog.schemaVersion !== 1) throw new Error("catalog_schema");
  if (catalog.repo !== "samedaydesk") throw new Error("catalog_repo");
  if (!Array.isArray(catalog.cases) || catalog.cases.length === 0) {
    throw new Error("catalog_empty");
  }
  return catalog;
}

export function discoverCaseIds() {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((name) => statSync(join(CASES_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(CASES_DIR, name, "case.json")))
    .sort();
}

export function loadCase(id) {
  const dir = join(CASES_DIR, id);
  const spec = readJson(join(dir, "case.json"));
  if (spec.id !== id) throw new Error(`case_id_mismatch:${id}`);
  if (spec.schemaVersion !== 1) throw new Error(`case_schema:${id}`);
  if (spec.repo !== "samedaydesk") throw new Error(`case_repo:${id}`);
  if (spec.boundary?.paymentSent !== false || spec.boundary?.toolsCalled !== false) {
    throw new Error(`case_boundary:${id}`);
  }
  return { id, dir, spec };
}

export function loadCorpus() {
  const catalog = loadCatalog();
  const schema = readJson(SCHEMA_PATH);
  const diskIds = discoverCaseIds();
  const catalogIds = catalog.cases.map((row) => row.id);
  const missingOnDisk = catalogIds.filter((id) => !diskIds.includes(id));
  const extraOnDisk = diskIds.filter((id) => !catalogIds.includes(id));
  if (missingOnDisk.length || extraOnDisk.length) {
    const error = new Error("catalog_disk_mismatch");
    error.detail = { missingOnDisk, extraOnDisk };
    throw error;
  }
  const cases = catalogIds.map((id) => {
    const loaded = loadCase(id);
    const row = catalog.cases.find((item) => item.id === id);
    if (row.surface !== loaded.spec.surface || row.feature !== loaded.spec.feature) {
      throw new Error(`catalog_row_mismatch:${id}`);
    }
    return loaded;
  });
  return { catalog, schema, cases };
}
