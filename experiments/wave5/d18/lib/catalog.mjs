import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_PATH } from "./pins.mjs";

export function loadCatalog(catalogPath = CATALOG_PATH) {
  if (!existsSync(catalogPath)) {
    const err = new Error(`catalog missing: ${catalogPath}`);
    err.code = "missing-catalog";
    throw err;
  }
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

export function jobById(catalog, jobId) {
  return (catalog.jobs || []).find((j) => j.id === jobId) || null;
}

export function jobOutputs(catalog, jobId) {
  const job = jobById(catalog, jobId);
  return job ? [...job.outputs] : [];
}

export function listForeignSiblingArtifacts(root, claimedJobId, catalog) {
  const found = [];
  for (const job of catalog.jobs || []) {
    if (job.id === claimedJobId) continue;
    for (const name of job.outputs || []) {
      if (existsSync(join(root, name))) found.push({ jobId: job.id, name });
    }
  }
  return found;
}
