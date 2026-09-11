import { PREFLIGHT_CONTRACT_SCHEMA, TESTED_D01 } from "./constants.mjs";

export const PREFLIGHT_CONTRACT = Object.freeze({
  schema: PREFLIGHT_CONTRACT_SCHEMA,
  owner: "W5-D02",
  entry: "tools/job-input-preflight/bin/preflight.mjs",
  library: "tools/job-input-preflight/lib/preflight.mjs#preflight",
  wrapperRequest: "tools/job-input-preflight/lib/contract.mjs#toWrapperRequest",
  testedD01: TESTED_D01,
  remainingIntegrationBinding:
    "W5-D01 had not published a Wave5 export when this adapter was tested. Pass toWrapperRequest(preflight).inputs file paths into runPaidOffer({ jobId, inputs }) at SDS52 aeef964f. That pin's inspectSample misses inline JSON strings; this CLI refuses those. D01 still enforces its 1 MiB cap after bind; this adapter uses the kit 8 MiB cap. Do not assume a future D01 head.",
});

/**
 * Map a successful preflight onto the current D01 runPaidOffer request shape.
 * Staged file paths are the bytes that were inspected. Inline JSON is emitted
 * as a JSON string, which D01 materializeInputs accepts.
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
    if (rec.stagedPath) {
      inputs[key] = rec.stagedPath;
      continue;
    }
    if (rec.inline && rec.text) {
      inputs[key] = rec.text;
      continue;
    }
    if (rec.path) inputs[key] = rec.path;
  }
  return {
    jobId: result.job,
    inputs,
    example: false,
  };
}
