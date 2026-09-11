import fs from "node:fs";
import { CATALOG_SCHEMA } from "./constants.mjs";
import { looksJsonl } from "./jsonl.mjs";
import { refuse } from "./refuse.mjs";

export function parseCatalog(raw, { source = null } = {}) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw refuse("catalog-schema-mismatch", "catalog must be a JSON object", { source });
  }
  if (typeof raw.$schema === "string" && raw.schema !== CATALOG_SCHEMA) {
    throw refuse("catalog-schema-mismatch", "JSON Schema documents are not useful-jobs catalogs", {
      got: raw.schema ?? null,
      jsonSchema: raw.$schema,
      source,
    });
  }
  if (raw.schema !== CATALOG_SCHEMA) {
    throw refuse("catalog-schema-mismatch", `catalog schema must be ${CATALOG_SCHEMA}`, {
      got: raw.schema ?? null,
      source,
    });
  }
  if (!Array.isArray(raw.jobs) || raw.jobs.length === 0) {
    throw refuse("catalog-schema-mismatch", "catalog.jobs must be a non-empty array", { source });
  }
  for (const job of raw.jobs) {
    if (!job || typeof job !== "object" || typeof job.id !== "string" || !job.id) {
      throw refuse("catalog-schema-mismatch", "catalog job is missing id", { source });
    }
    if (!Array.isArray(job.requiredInputs) || job.requiredInputs.some((f) => typeof f !== "string" || !f.startsWith("--"))) {
      throw refuse("catalog-schema-mismatch", `job ${job.id} requiredInputs must be --flags`, {
        job: job.id,
        requiredInputs: job.requiredInputs ?? null,
      });
    }
    if (!Array.isArray(job.outputs) || job.outputs.length === 0 || job.outputs.some((n) => typeof n !== "string" || !n)) {
      throw refuse("catalog-schema-mismatch", `job ${job.id} outputs must be a non-empty string array`, {
        job: job.id,
        outputs: job.outputs ?? null,
      });
    }
  }
  return raw;
}

export function findJob(catalog, jobId) {
  const job = catalog.jobs.find((j) => j.id === jobId);
  if (!job) {
    throw refuse("unknown-job", `unknown job ${jobId}`, {
      job: jobId,
      known: catalog.jobs.map((j) => j.id),
    });
  }
  return job;
}

export async function loadCatalog(source) {
  if (!source || typeof source !== "string") {
    throw refuse("catalog-unavailable", "catalog source is required");
  }
  if (/^https?:\/\//i.test(source)) {
    let res;
    try {
      res = await fetch(source);
    } catch (err) {
      throw refuse("catalog-unavailable", "catalog HTTP fetch failed", {
        source,
        error: String(err?.message || err),
      });
    }
    if (!res.ok) {
      throw refuse("catalog-unavailable", `catalog HTTP ${res.status}`, { source, status: res.status });
    }
    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw refuse("catalog-schema-mismatch", "catalog HTTP body is not JSON", {
        source,
        error: String(err?.message || err),
      });
    }
    return parseCatalog(json, { source });
  }
  let text;
  try {
    text = fs.readFileSync(source, "utf8");
  } catch {
    throw refuse("catalog-unavailable", "catalog file not found", { source });
  }
  if (looksJsonl(text)) {
    throw refuse("catalog-jsonl-not-document", "catalog must be one JSON document, not JSONL", {
      source,
    });
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw refuse("catalog-schema-mismatch", "catalog file is not JSON", {
      source,
      error: String(err?.message || err),
    });
  }
  return parseCatalog(json, { source });
}
