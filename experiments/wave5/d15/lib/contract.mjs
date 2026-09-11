import { TESTED_WRAPPER_SHA } from "./paths.mjs";

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
    testedImplementation: {
      repo: "epistemedeus/samedaydesk",
      sha: TESTED_WRAPPER_SHA,
      ref: "fable/f08-paid-wrappers",
      pr: 52,
      paths: ["server/paid-useful-jobs/"],
    },
    integrationOwner: "W5-D01",
    refuseCode: REFUSE_CODE,
    bind: Object.values(BIND),
    remainingBinding:
      "materializeInputs aliases caller file paths into runEngineJob. D01 should copy inspected bytes into the work directory at materialize time, or refuse when live digest drifts before execute. This harness does not claim a future D01 freeze.",
  };
}
