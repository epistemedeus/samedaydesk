import { SDS52_SHA, D01_SHA, EXECUTION_CONTRACT_VERSION } from "./kernels.mjs";

export const CONTRACT_SCHEMA = "samedaydesk.wave5.d15.input-execute-race.v1";

export const REFUSE_CODE = "input-changed-after-preflight";

export const BIND = Object.freeze({
  FROZEN: "frozen",
  VERIFY_LIVE: "verify-live",
  LIVE_OBSERVE: "live-observe",
});

export const KIND = Object.freeze({
  FROZEN_CONSUMED: "frozen-consumed",
  ACCURATE_REFUSE: "accurate-refuse",
  RACE_CONSUMED_MUTATED: "race-consumed-mutated",
  WRAPPER_REFUSE: "wrapper-refuse",
  ENGINE_FAILURE: "engine-failure",
  TRANSPORT_FAILURE: "transport-failure",
});

export const WRAPPER_REFUSE_CODES = Object.freeze([
  "unknown-job",
  "missing-job",
  "missing-required-inputs",
  "input-malformed",
  "input-missing-file",
  "input-not-file",
  "input-oversize",
  "input-root-not-directory",
]);

export function contractRecord() {
  return {
    schema: CONTRACT_SCHEMA,
    outcome: "Deterministic input/execute race harness",
    executionContract: EXECUTION_CONTRACT_VERSION,
    testedImplementation: {
      repo: "epistemedeus/samedaydesk",
      sha: D01_SHA,
      paths: ["server/paid-useful-jobs/"],
      note: "execution.v1 kernel replayed from a read-only worktree. Freeze-shim runs are not product acceptance.",
    },
    negativeBaseline: {
      repo: "epistemedeus/samedaydesk",
      sha: SDS52_SHA,
      ref: "fable/f08-paid-wrappers",
      pr: 52,
    },
    integrationOwner: "W5-D01",
    refuseCode: REFUSE_CODE,
    bind: Object.values(BIND),
    remainingBinding:
      "D01 copies caller files at materialize time. Mutating after that copy is frozen-consumed with a matching receipt. Mutating after inspectSample's first read and before copy still executes the new bytes; receipt follows the staged copy, not the inspected hash. Concurrent caller outDir last-writer-wins on published outputs while isolated runOutDir stays distinct. D01 owns kernel fixes.",
  };
}
