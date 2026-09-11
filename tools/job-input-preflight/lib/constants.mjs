/** Aligned with useful-jobs 1.0.0 `lib/validate-next-run.mjs` (PR51 archive). Not F08's 1 MiB wrapper cap. */
export const MAX_LOCAL_INPUT_BYTES = 8 * 1024 * 1024;

export const CATALOG_SCHEMA = "useful-jobs.catalog.v1";

/** I01 / funded-task-terms public digest form (`sha256:` + 64 hex). Integer identity is rejected. */
export const DIGEST_PREFIX = "sha256:";
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const BARE_HEX_RE = /^[0-9a-f]{64}$/i;

export const CONTROL_FLAGS = Object.freeze([
  "catalog",
  "declared-inputs",
  "input-root",
  "out-dir",
  "job",
  "json",
  "help",
  "example",
  "d01-root",
  "kit-root",
]);

/** Published useful-jobs 1.0.0 input schema ids. Not a copy of those engines. */
export const EVIDENCE_PACKET_SCHEMA = "s137.consumer-evidence.packet.v1";
export const LISTING_REPAIR_INPUT_SCHEMA = "pilot.s185.distribution_repair_input.v1";
export const NEXT_RUN_MANIFEST_SCHEMAS = Object.freeze([
  "s176.next-run-manifest.v1",
  "s163.next-run-manifest.v1",
]);

export const STAGED_DIR_NAME = "staged";
export const PREFLIGHT_CONTRACT_SCHEMA = "samedaydesk.job-input-preflight.v1";

/** Current pinned D01 implementation this adapter was tested against. */
export const TESTED_D01 = Object.freeze({
  owner: "W5-D01",
  repo: "epistemedeus/samedaydesk",
  sha: "aeef964fa188443078958d9d6d393afae1d542ee",
  ref: "fable/f08-paid-wrappers",
  pr: 52,
  entry: "server/paid-useful-jobs/lib/wrapper.mjs#runPaidOffer",
  inspectSample: "server/paid-useful-jobs/lib/sample-guard.mjs#inspectSample",
  materializeInputs: "server/paid-useful-jobs/lib/input-guard.mjs#materializeInputs",
  maxInputBytes: 1_048_576,
});

/** Engine artifacts this preflight must never write. */
export const ENGINE_OUTPUT_NAMES = Object.freeze([
  "upgrade-brief.json",
  "upgrade-brief.md",
  "budget-impact.json",
  "budget-impact.md",
  "agenda.json",
  "agenda.ics",
  "annotations.json",
  "annotations.md",
  "repair-packet.json",
  "repair-packet.md",
  "repeat-job.json",
  "repeat-job.md",
]);

export const PREFLIGHT_RESULT_NAME = "preflight.json";
