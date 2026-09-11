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
]);

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
