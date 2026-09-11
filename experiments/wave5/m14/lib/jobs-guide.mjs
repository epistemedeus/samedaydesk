import { JOBS, JOB_BY_ID, JOB_IDS, getJob } from "../../../../server/paid-useful-jobs/lib/jobs.mjs";
import { loadCatalog, loadOutcomes, loadPin } from "./paths.mjs";

export { JOBS, JOB_BY_ID, JOB_IDS, getJob };

export const SHARED_LIMITS = Object.freeze([
  "sold is always false. This wrapper is not a live sale.",
  "Live settlement is out of scope. Fixture funding is labelled and cannot settle.",
  "SAMPLE and --example produce labeled sample output. They are not a paid sale.",
  "A complete no-change, partial, or refused analysis report can be useful delivery. It is not a crash.",
  "missing-required-inputs, unknown-job, and other wrapper codes mean analysis did not run.",
  "Engine crash, timeout, missing JSON, and missing expected files are not valid analysis reports.",
  "Engine digest, receipt inputsDigest, and output file sha256 are different hashes. Do not treat them as equal.",
  "Fixture wrapper prices are not live extract 0.005 USDC or seller-integrity-audit 0.01 USDC.",
]);

export function outcomeFor(jobId) {
  const outcomes = loadOutcomes();
  return (outcomes.jobs || []).find((j) => j.id === jobId) || null;
}

export function limitsFor(jobId) {
  const job = JOB_BY_ID[jobId];
  const outcome = outcomeFor(jobId);
  const rows = [...SHARED_LIMITS];
  if (job?.notes) rows.push(job.notes);
  if (outcome?.outcome) rows.push(outcome.outcome);
  return rows;
}

export function jobGuide(jobId) {
  const job = getJob(jobId);
  const outcome = outcomeFor(jobId);
  return {
    id: job.id,
    title: job.title,
    summary: job.summary,
    requiredInputs: [...job.requiredInputs],
    optionalInputs: [...(job.optionalInputs || [])],
    outputs: [...job.outputs],
    exampleFlag: job.exampleFlag || "--example",
    notes: job.notes || "",
    outcome: outcome?.outcome || job.summary,
    requiredFiles: outcome?.requiredFiles || [],
    limits: limitsFor(jobId),
  };
}

export function catalogJobs() {
  const catalog = loadCatalog();
  return catalog.jobs.map((job) => ({
    id: job.id,
    title: job.title,
    summary: job.summary,
    requiredInputs: [...job.requiredInputs],
    optionalInputs: [...(job.optionalInputs || [])],
    outputs: [...job.outputs],
    notes: job.notes || "",
  }));
}

export function testedRecord() {
  const pin = loadPin();
  return {
    repo: pin.testedImplementation.repo,
    sha: pin.testedImplementation.sha,
    ref: pin.testedImplementation.ref,
    pr: pin.testedImplementation.pr,
    remainingBinding: {
      D01: pin.d01ContractReadOnly,
      M01: pin.m01,
      D24: pin.d24,
    },
  };
}
