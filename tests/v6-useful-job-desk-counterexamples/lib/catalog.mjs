import { existsSync, readFileSync } from "node:fs";
import { CATALOG_PATH } from "./paths.mjs";

let cached = null;

export function loadCommittedCatalog(catalogPath = CATALOG_PATH) {
  if (cached && catalogPath === CATALOG_PATH) return cached;
  if (!existsSync(catalogPath)) {
    throw new Error(`committed useful-jobs catalog missing: ${catalogPath}`);
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalog?.schema !== "useful-jobs.catalog.v1" || catalog?.package !== "useful-jobs") {
    throw new Error("committed catalog is not useful-jobs.catalog.v1");
  }
  if (!Array.isArray(catalog.jobs) || catalog.jobs.length === 0) {
    throw new Error("committed catalog has no jobs");
  }
  if (catalogPath === CATALOG_PATH) cached = catalog;
  return catalog;
}

export function jobFromCatalog(jobId, catalog = loadCommittedCatalog()) {
  return catalog.jobs.find((row) => row.id === jobId) || null;
}

export function promisedOutputs(jobId, report = null, catalog = loadCommittedCatalog()) {
  const job = jobId ? jobFromCatalog(jobId, catalog) : null;
  if (job && Array.isArray(job.outputs) && job.outputs.length) {
    return [...job.outputs];
  }
  if (Array.isArray(report?.outputs) && report.outputs.length) {
    return [...report.outputs];
  }
  if (Array.isArray(report?.delivery?.expected) && report.delivery.expected.length) {
    return [...report.delivery.expected];
  }
  return [];
}
