import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./pins.mjs";

const catalog = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json"), "utf8"),
);

export const JOBS = Object.freeze(
  catalog.jobs.map((job) =>
    Object.freeze({
      id: job.id,
      title: job.title,
      summary: job.summary,
      requiredInputs: Object.freeze([...job.requiredInputs]),
      optionalInputs: Object.freeze([...(job.optionalInputs || [])]),
      outputs: Object.freeze([...job.outputs]),
      exampleFlag: job.exampleFlag || "--example",
      notes: job.notes || "",
    }),
  ),
);

export const JOB_BY_ID = Object.freeze(Object.fromEntries(JOBS.map((job) => [job.id, job])));

export const JOB_IDS = Object.freeze(JOBS.map((job) => job.id));

const FLAG_TO_KEY = {
  "--before": "before",
  "--after": "after",
  "--used": "used",
  "--input": "input",
  "--next-run": "next-run",
  "--input-root": "input-root",
};

export function flagToKey(flag) {
  return FLAG_TO_KEY[flag] || String(flag).replace(/^--/, "");
}

export function requiredKeys(job) {
  return job.requiredInputs.map(flagToKey);
}

export function optionalKeys(job) {
  return (job.optionalInputs || []).map(flagToKey);
}

export function getJob(jobId) {
  const job = JOB_BY_ID[jobId];
  if (!job) {
    const err = new Error(`unknown job ${jobId}`);
    err.code = "unknown-job";
    throw err;
  }
  return job;
}
