import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildJobContract, computeRequestDigest, evidenceDigest } from "../job-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function loadJson(name) {
  return JSON.parse(readFileSync(join(here, name), "utf8"));
}

export function syntheticJobInput() {
  const job = loadJson("synthetic-page-change-job.json");
  const requestDigest = computeRequestDigest({ request: job.request, target: job.target });
  return {
    ...job,
    quote: {
      ...job.quote,
      boundRequestDigest: requestDigest,
    },
  };
}

export function syntheticJobContract() {
  return buildJobContract(syntheticJobInput());
}

export function syntheticDeliveries() {
  return loadJson("synthetic-page-change-deliveries.json");
}

export function usefulDelivery(contract, { committed = true, input = null, result = null } = {}) {
  const fixtures = syntheticDeliveries();
  return {
    requestDigest: contract.requestDigest,
    committed,
    input: input || { ...contract.request.body },
    result: result || fixtures.usefulResult,
    evidence: fixtures.evidence,
  };
}

export { evidenceDigest };
