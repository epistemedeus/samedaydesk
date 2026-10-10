import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { replayRefuse } from "./args.mjs";
import { USEFUL_JOBS_PUBLIC_CATALOG } from "./pins.mjs";

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadPublicCatalog() {
  return loadJson(USEFUL_JOBS_PUBLIC_CATALOG);
}

export function loadKitCatalog(kitRoot) {
  const catalogPath = join(kitRoot, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw replayRefuse("missing-kit-catalog", "Extracted kit has no catalog.json", { catalogPath });
  }
  return loadJson(catalogPath);
}

export function catalogJobs(catalog) {
  return Array.isArray(catalog?.jobs) ? catalog.jobs : [];
}

export function findJob(catalog, jobId) {
  const job = catalogJobs(catalog).find((j) => j.id === jobId);
  if (!job) {
    throw replayRefuse("unknown-job", `Unknown catalog job ${jobId}`, {
      jobId,
      known: catalogJobs(catalog).map((j) => j.id),
    });
  }
  return job;
}

export function catalogOutputNames(job) {
  return [...(job.outputs || [])];
}

export function requiredInputKeys(job) {
  return (job.requiredInputs || []).map((flag) => String(flag).replace(/^--/, ""));
}

export function optionalInputKeys(job) {
  return (job.optionalInputs || []).map((flag) => String(flag).replace(/^--/, ""));
}

export function assertPublicCatalogMatchesKit(publicCatalog, kitCatalog) {
  const pubIds = catalogJobs(publicCatalog).map((j) => j.id);
  const kitIds = catalogJobs(kitCatalog).map((j) => j.id);
  if (JSON.stringify(pubIds) !== JSON.stringify(kitIds)) {
    throw replayRefuse("catalog-job-mismatch", "Public catalog job ids differ from the archive catalog", {
      public: pubIds,
      kit: kitIds,
    });
  }
  for (const kitJob of catalogJobs(kitCatalog)) {
    const pub = catalogJobs(publicCatalog).find((j) => j.id === kitJob.id);
    if (!pub) continue;
    if (JSON.stringify(pub.outputs || []) !== JSON.stringify(kitJob.outputs || [])) {
      throw replayRefuse("catalog-output-mismatch", `Catalog outputs differ for ${kitJob.id}`, {
        jobId: kitJob.id,
        public: pub.outputs,
        kit: kitJob.outputs,
      });
    }
  }
}
