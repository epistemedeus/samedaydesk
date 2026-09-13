import { existsSync, readFileSync } from "node:fs";
import { CATALOG_PATH } from "./pins.mjs";

export function loadCatalog(catalogPath = CATALOG_PATH) {
  if (!existsSync(catalogPath)) {
    const err = new Error(`catalog missing: ${catalogPath}`);
    err.code = "missing-catalog";
    throw err;
  }
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

export function jobOutputs(catalog, jobId) {
  const job = (catalog.jobs || []).find((j) => j.id === jobId);
  return job ? [...job.outputs] : [];
}

export function jobById(catalog, jobId) {
  return (catalog.jobs || []).find((j) => j.id === jobId) || null;
}
