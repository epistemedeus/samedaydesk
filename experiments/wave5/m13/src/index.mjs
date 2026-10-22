import { existsSync } from "node:fs";
import { discoverFromDocuments, loadDocuments, DEFAULT_JOB_ID, assertUnlikeOffers } from "./discover.mjs";
import { invokeCurrentJob, listCurrentJobs } from "./invoke.mjs";
import { isUsefulDelivery } from "./classify.mjs";

export async function discoverCurrent(options = {}) {
  const docs = await loadDocuments(options);
  const discovery = discoverFromDocuments(docs, { jobId: options.jobId || DEFAULT_JOB_ID });
  discovery.unlikeChecks = assertUnlikeOffers(discovery);
  return { docs, discovery };
}

export async function discoverThenInvoke(options = {}) {
  const jobId = options.jobId || DEFAULT_JOB_ID;
  const { docs, discovery } = await discoverCurrent({ ...options, jobId });
  const cli = discovery.invoke?.cli;

  if (discovery.mcp.naiveFirstHitIsCurrent) {
    return {
      ok: false,
      failureClass: "analysis",
      outcome: "refusal",
      code: "naive-mcp-treated-as-current",
      discovery,
      invoke: null,
    };
  }

  if (!discovery.jobs.selected) {
    return {
      ok: false,
      failureClass: "analysis",
      outcome: "refusal",
      code: "unknown-job",
      error: `job ${jobId} not in useful-jobs catalog by id`,
      discovery,
      invoke: null,
    };
  }

  if (discovery.jobs.selected.id !== jobId) {
    return {
      ok: false,
      failureClass: "analysis",
      outcome: "refusal",
      code: "identity-mismatch",
      error: "discovered job id does not match requested identity",
      discovery,
      invoke: null,
    };
  }

  const listed = listCurrentJobs({ repoRoot: docs.repoRoot, cli });
  if (listed.failureClass === "transport") {
    return {
      ok: false,
      failureClass: "transport",
      outcome: listed.outcome,
      code: listed.code,
      error: listed.error,
      discovery,
      invoke: listed,
    };
  }
  const runtimeIds = listed.body?.jobs || [];
  if (!runtimeIds.includes(jobId)) {
    return {
      ok: false,
      failureClass: "analysis",
      outcome: "refusal",
      code: "runtime-catalog-mismatch",
      error: `discovered job ${jobId} is not in current wrapper list`,
      discovery,
      invoke: listed,
    };
  }

  const invoke = invokeCurrentJob({
    repoRoot: docs.repoRoot,
    cli,
    jobId,
    inputs: options.inputs || {},
    outDir: options.outDir,
    funding: options.funding,
    payment: options.payment,
    example: options.example === true,
  });

  const delivered = isUsefulDelivery(invoke);
  const outDir = options.outDir;
  const expectedOutputs = discovery.jobs.selected.outputs || [];
  const outputFiles = (outDir && delivered)
    ? expectedOutputs.map((name) => ({ name, path: `${outDir.replace(/\/$/, "")}/${name}`, exists: existsSync(`${outDir.replace(/\/$/, "")}/${name}`) }))
    : invoke.body?.outputs || [];

  return {
    ok: delivered,
    failureClass: invoke.failureClass,
    outcome: invoke.outcome,
    code: invoke.code || null,
    discovery,
    runtimeList: runtimeIds,
    invoke,
    outputFiles,
    sold: invoke.body?.sold === true,
    liveSettlement: "out-of-scope",
  };
}

export { discoverFromDocuments, loadDocuments, DEFAULT_JOB_ID, assertUnlikeOffers } from "./discover.mjs";
export { invokeCurrentJob, listCurrentJobs } from "./invoke.mjs";
export { classifySpawn, isUsefulDelivery } from "./classify.mjs";
export { selectById } from "./identity.mjs";
