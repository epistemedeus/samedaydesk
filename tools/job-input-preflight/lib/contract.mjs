import {
  EXECUTION_CONTRACT_VERSION,
  EXECUTION_MAX_INPUT_BYTES,
  KIT_MAX_LOCAL_INPUT_BYTES,
  PREFLIGHT_CONTRACT_SCHEMA,
  TESTED_D01,
} from "./constants.mjs";

export const PREFLIGHT_CONTRACT = Object.freeze({
  schema: PREFLIGHT_CONTRACT_SCHEMA,
  owner: "W5-D02",
  entry: "tools/job-input-preflight/bin/preflight.mjs",
  library: "tools/job-input-preflight/lib/preflight.mjs#preflight",
  wrapperRequest: "tools/job-input-preflight/lib/contract.mjs#toWrapperRequest",
  executionContractVersion: EXECUTION_CONTRACT_VERSION,
  testedD01: TESTED_D01,
  remainingIntegrationBinding:
    "Pass toWrapperRequest(preflight).inputs staged file paths into this tree's createExecutor/runPaidOffer (execution.v1). D01 also validates vendor-budget-impact pricing-row schema at service entry; this preflight still gates first. Execution cap is 1 MiB (input-oversize); kit cap remains 8 MiB (input-too-large). This package never claims spend, tool cost, or settlement.",
});

/**
 * Map a successful preflight onto D01 runPaidOffer.
 * Always file paths of the exact staged bytes. Never re-stringify inline JSON.
 */
export function toWrapperRequest(result) {
  if (!result || result.ok !== true) {
    throw new Error("toWrapperRequest requires preflight ok:true");
  }
  const inputs = {};
  for (const [key, rec] of Object.entries(result.inputs || {})) {
    if (!rec) continue;
    if (rec.kind === "directory") {
      inputs[key] = rec.path;
      continue;
    }
    if (!rec.stagedPath) {
      throw new Error(`toWrapperRequest missing stagedPath for ${key}; preflight must stage exact bytes`);
    }
    inputs[key] = rec.stagedPath;
  }
  return {
    jobId: result.job,
    inputs,
    example: false,
  };
}

export { EXECUTION_CONTRACT_VERSION, EXECUTION_MAX_INPUT_BYTES, KIT_MAX_LOCAL_INPUT_BYTES };
