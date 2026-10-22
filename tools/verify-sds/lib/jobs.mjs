import { JOB_IDS } from "./pins.mjs";
import { envelope, failError } from "./envelope.mjs";
import { digestResult, makeReceipt } from "./receipt.mjs";
import { currentPin, inputDigestFor } from "./stale.mjs";
import { runUsefulJobs } from "../jobs/useful-jobs.mjs";
import { runPacks } from "../jobs/packs.mjs";
import { runMcp } from "../jobs/mcp.mjs";

const RUNNERS = {
  "useful-jobs": runUsefulJobs,
  packs: runPacks,
  mcp: runMcp,
};

export function listJobs() {
  return [...JOB_IDS];
}

export async function runOneJob(jobId, ctx) {
  const runner = RUNNERS[jobId];
  if (!runner) {
    return envelope({
      ok: false,
      command: "run",
      job: jobId,
      status: "usage",
      error: failError("USAGE", `unknown job ${jobId}; known: ${JOB_IDS.join(", ")}`),
    });
  }
  return runner(ctx);
}

export async function runJobs(jobIds, ctx) {
  const ids = jobIds.length ? jobIds : [...JOB_IDS];
  const unknown = ids.filter((id) => !JOB_IDS.includes(id));
  if (unknown.length) {
    return envelope({
      ok: false,
      command: "run",
      status: "usage",
      error: failError("USAGE", `unknown job ${unknown[0]}; known: ${JOB_IDS.join(", ")}`),
    });
  }

  if (ids.length === 1) return runOneJob(ids[0], ctx);

  const results = [];
  const evidence = [];
  for (const id of ids) {
    const env = await runOneJob(id, ctx);
    results.push(env);
    evidence.push({ kind: "job", id, ok: env.ok, error: env.error });
    if (!env.ok) {
      return envelope({
        ok: false,
        command: "run",
        job: "all",
        jobs: ids,
        evidence,
        error: env.error,
        result: {
          failed: id,
          jobs: Object.fromEntries(results.map((item) => [item.job, { ok: item.ok, error: item.error }])),
        },
      });
    }
  }

  const summary = Object.fromEntries(
    results.map((item) => [item.job, { ok: item.ok, result: item.result, receipt: item.receipt }]),
  );
  const receipt = ctx.dryRun
    ? undefined
    : makeReceipt({
        jobId: "all",
        clock: ctx.clock,
        pin: currentPin(),
        inputDigest: inputDigestFor("all", ctx.root),
        resultDigest: digestResult(
          Object.fromEntries(results.map((item) => [item.job, item.receipt?.resultDigest])),
        ),
        ok: true,
      });
  return envelope({
    ok: true,
    command: "run",
    job: "all",
    jobs: ids,
    evidence,
    result: summary,
    receipt,
  });
}
