import { existsSync, readFileSync } from "node:fs";
import { refuse } from "./refuse.mjs";

export function loadCatalog(pathOrObject) {
  if (pathOrObject && typeof pathOrObject === "object" && !Array.isArray(pathOrObject)) {
    return normalizeCatalog(pathOrObject);
  }
  if (typeof pathOrObject !== "string" || !existsSync(pathOrObject)) {
    throw refuse("missing-catalog", "catalog.json is required to pin catalog jobId", { path: pathOrObject || null });
  }
  return normalizeCatalog(JSON.parse(readFileSync(pathOrObject, "utf8")));
}

function normalizeCatalog(raw) {
  const jobs = Array.isArray(raw?.jobs) ? raw.jobs : [];
  if (!jobs.length) throw refuse("missing-catalog", "catalog.json has no jobs");
  const byId = new Map();
  const byOutputs = [];
  for (const job of jobs) {
    if (!job?.id || !Array.isArray(job.outputs)) continue;
    byId.set(job.id, job);
    byOutputs.push({ id: job.id, outputs: [...job.outputs].sort() });
  }
  return { raw, jobs, byId, byOutputs, package: raw.package, version: raw.version };
}

export function detectJobId(fileNames, catalog, jsonAppId = null) {
  const names = new Set(fileNames);
  if (jsonAppId && catalog.byId.has(jsonAppId)) {
    const job = catalog.byId.get(jsonAppId);
    const missing = (job.outputs || []).filter((name) => !names.has(name));
    if (!missing.length) return jsonAppId;
  }
  const matches = catalog.byOutputs.filter((job) => job.outputs.every((name) => names.has(name)));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    const exact = matches.filter((job) => job.outputs.length === names.size || job.outputs.every((name) => names.has(name)));
    if (exact.length === 1) return exact[0].id;
  }
  throw refuse("unknown-job-outputs", "in-dir files do not match a catalog jobId", {
    files: [...names].sort(),
  });
}

export function assertKnownJobId(jobId, catalog) {
  if (!catalog.byId.has(jobId)) {
    throw refuse("unknown-job-id", `catalog has no job ${jobId}`, { jobId });
  }
  return catalog.byId.get(jobId);
}

export function assertJobOutputCorrespondence({ jobId, fileNames, catalog, jsonAppId = null }) {
  const job = assertKnownJobId(jobId, catalog);
  const names = new Set(fileNames);
  const expected = [...(job.outputs || [])];
  const missing = expected.filter((name) => !names.has(name));
  if (missing.length) {
    throw refuse("job-output-mismatch", "claimed catalog job does not correspond to the output files", {
      jobId,
      missing,
      expected,
      files: [...names].sort(),
    });
  }
  if (jsonAppId && catalog.byId.has(jsonAppId) && jsonAppId !== jobId) {
    throw refuse("job-output-mismatch", "output appId does not match claimed jobId", {
      jobId,
      jsonAppId,
      expected,
      files: [...names].sort(),
    });
  }
  return job;
}
