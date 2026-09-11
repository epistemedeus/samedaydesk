import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./pins.mjs";

const catalog = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json"), "utf8"),
);

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

function freezeJob(job) {
  return Object.freeze({
    id: job.id,
    title: job.title,
    summary: job.summary,
    requiredInputs: Object.freeze([...(job.requiredInputs || [])]),
    optionalInputs: Object.freeze([...(job.optionalInputs || [])]),
    outputs: Object.freeze([...(job.outputs || [])]),
    exampleFlag: job.exampleFlag || "--example",
    notes: job.notes || "",
  });
}

/**
 * Smallest engine-catalog injection seam. M01 is not on this tree.
 * createExecutor({ catalog }) / createExecutor({ getJob }) bind a lookup
 * without waiting on a later catalog owner.
 */
export function createJobLookup(source) {
  const jobsRaw = Array.isArray(source?.jobs) ? source.jobs : Array.isArray(source) ? source : [];
  const jobs = Object.freeze(jobsRaw.map((job) => freezeJob(job)));
  const byId = Object.freeze(Object.fromEntries(jobs.map((job) => [job.id, job])));
  return {
    JOBS: jobs,
    JOB_BY_ID: byId,
    JOB_IDS: Object.freeze(jobs.map((job) => job.id)),
    getJob(jobId) {
      const job = byId[jobId];
      if (!job) {
        const err = new Error(`unknown job ${jobId}`);
        err.code = "unknown-job";
        throw err;
      }
      return job;
    },
  };
}

const defaultLookup = createJobLookup(catalog);

export const JOBS = defaultLookup.JOBS;
export const JOB_BY_ID = defaultLookup.JOB_BY_ID;
export const JOB_IDS = defaultLookup.JOB_IDS;

export function getJob(jobId) {
  return defaultLookup.getJob(jobId);
}
