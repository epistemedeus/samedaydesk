import { readFileSync } from "node:fs";
import { CATALOG_PATH } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

const FLAG_TO_KEY = {
  "--before": "before",
  "--after": "after",
  "--used": "used",
  "--input": "input",
  "--next-run": "next-run",
  "--input-root": "input-root",
};

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

export function flagToKey(flag) {
  return FLAG_TO_KEY[flag] || String(flag).replace(/^--/, "");
}

export function keyToFlag(key) {
  const found = Object.entries(FLAG_TO_KEY).find(([, k]) => k === key);
  return found ? found[0] : `--${key}`;
}

export function requiredKeys(job) {
  return job.requiredInputs.map(flagToKey);
}

export function optionalKeys(job) {
  return (job.optionalInputs || []).map(flagToKey);
}

export function getJob(engineId) {
  const job = JOB_BY_ID[engineId];
  if (!job) {
    throw refuse("unknown-job", `unknown job ${engineId}`, { engineId, known: JOB_IDS });
  }
  return job;
}
