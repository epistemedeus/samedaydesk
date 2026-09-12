/**
 * W5-D16 engine lifecycle contract.
 * Tested against SDS PR52 paid wrappers at the pinned SHA below.
 * D01 owns wrapper/engine.mjs. This package does not reimplement jobs.
 */
export const SCHEMA = "samedaydesk.wave5.d16.engine-lifecycle.v1";

export const PINNED_IMPLEMENTATION = Object.freeze({
  repo: "epistemedeus/samedaydesk",
  sha: "aeef964fa188443078958d9d6d393afae1d542ee",
  ref: "fable/f08-paid-wrappers",
  pr: 52,
  module: "server/paid-useful-jobs",
  wrapperCli: "server/paid-useful-jobs/bin/cli.mjs",
  engineModule: "server/paid-useful-jobs/lib/engine.mjs",
});

export const INTEGRATION_OWNER = "W5-D01";

export const LIFECYCLE_KINDS = Object.freeze({
  ENGINE_RAN: "engine-ran",
  INSTALL_FAILURE: "engine-install-failure",
  START_FAILURE: "engine-start-failure",
  TIMEOUT: "engine-timeout",
  NONZERO_EXIT: "engine-nonzero-exit",
  MISSING_JSON: "engine-missing-json",
  INVALID_JSON: "engine-invalid-json",
  ENGINE_REFUSED_JSON: "engine-refused-json",
  MISSING_OUTPUTS: "engine-missing-outputs",
  HIDDEN_BY_WRAPPER: "broken-engine-hidden-by-wrapper-success",
  WRAPPER_UNCAUGHT: "wrapper-uncaught",
});

export const REMAINING_D01_BINDING = Object.freeze([
  "Catch ensureUsefulJobsKit failures inside runPaidOffer and return a structured rejection instead of throwing before the try block.",
  "Treat engine.json.ok === true as the success predicate, not merely ok !== false.",
  "Parse engine stdout as a whole JSON document. A sliced object inside noise must not count as engine success.",
  "Return spawn error.code and signal from runEngineJob so timeout and ENOENT are distinct from a generic engine-refused.",
  "On engine timeout, kill the useful-jobs child and its app grandchild. spawnSync timeout currently leaves the app CLI running.",
  "Do not set wrapper.ok true when required output files are missing. D03 owns completeness identity; D16 only requires lifecycle not to hide a broken engine.",
]);

export function acceptEngineLifecycle(classified) {
  return classified?.kind === LIFECYCLE_KINDS.ENGINE_RAN && classified.accepted === true;
}
