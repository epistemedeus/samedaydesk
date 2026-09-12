import { SDS52_SHA, D01_SHA, D01_PREV_SHA, EXECUTION_CONTRACT_VERSION } from "./kernels.mjs";

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
    previousKernel: {
      repo: "epistemedeus/samedaydesk",
      sha: D01_PREV_SHA,
      note: "Inspect-to-materialize still consumed mutated bytes. Kept as a runnable negative pin.",
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
      "Product pin e2f951ca snapshots file bytes before inspect. Inspect-to-execute, post-stage, and outDir-getter caller mutation consumed those bytes with a matching receipt and stable domain. 6bed72dd still executes inspect-window mutations. SDS52 aeef964 still aliases live caller paths. Concurrent caller outDir last-writer-wins on the published copy; receipts at e2f951ca bind runOutDir. Freeze-shim runs are not product acceptance.",
  };
}
