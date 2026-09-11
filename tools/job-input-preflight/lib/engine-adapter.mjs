/**
 * Injected engine adapter. Preflight must not run useful-jobs / F08 wrappers.
 * Bind createExecutor / runPaidOffer from the pinned execution.v1 export.
 */
import { EXECUTION_CONTRACT_VERSION, TESTED_D01 } from "./constants.mjs";

export function createNullEngineAdapter() {
  const calls = [];
  return {
    name: "null-not-invoked",
    calls,
    invoke(request) {
      calls.push(request);
      throw new Error("job-input-preflight must not invoke the useful-jobs engine");
    },
  };
}

export const LATER_ENGINE_BINDING = Object.freeze({
  owner: "W5-D01",
  testedImplementation: TESTED_D01,
  publishedCli: ["node", "server/paid-useful-jobs/bin/cli.mjs", "run", "<job-id>"],
  remaining:
    "Feed toWrapperRequest staged file paths into this tree's runPaidOffer/createExecutor (execution.v1). D01 now pricing-row schema-checks at service entry; this adapter still refuses first. 1 MiB execution cap is enforced here as input-oversize so preflight cannot go green past the wrapper. This package never claims spend, tool cost, or settlement.",
});

export { bindExecutionV1 } from "./d01-bind.mjs";
export { EXECUTION_CONTRACT_VERSION };
