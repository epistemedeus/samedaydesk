import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const D14_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");

export const EXECUTION_CONTRACT_VERSION = "samedaydesk.paid-useful-jobs.execution.v1";
export const CATALOG_VERSION = "1.4.3";
export const RUNTIME_PIN = "8a811bbadba7edc6c926b319b0839cd2f01e5896";

/** Historical D01 pin. Spawn must not git-fetch this. */
export const D01_PIN = "6bed72dd22a396134aa5c957933b42c3a5746698";
export const D01_KERNEL_PIN = "bccf34b3816ebe20d43823d0978308fd10f9bb33";
export const D01_BRANCH = "codex/w5-d01-20260911";
export const D01_PR = 74;
export const SDS52_PIN = "aeef964fa188443078958d9d6d393afae1d542ee";

export const EXECUTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const MAX_HTTP_BODY_BYTES = 8 * 1024 * 1024;
export const SERVE_EXECUTION_REL = "server/paid-useful-jobs/bin/serve-execution.mjs";

export const JOB_EXPECTED_OUTPUTS = Object.freeze({
  "lockfile-pin-delta": Object.freeze(["pin-delta.json", "pin-delta.md"]),
  "json-schema-webhook-drift": Object.freeze(["drift-brief.json", "drift-brief.md"]),
  "route-table-diff": Object.freeze(["route-diff.json", "route-diff.md"]),
  "page-change-offline-job": Object.freeze(["page-change.json", "page-change.md"]),
  "api-upgrade-brief": Object.freeze(["upgrade-brief.json", "upgrade-brief.md"]),
  "vendor-budget-impact": Object.freeze(["budget-impact.json", "budget-impact.md"]),
  "feed-agenda": Object.freeze(["agenda.json", "agenda.ics"]),
  "evidence-ci-annotation": Object.freeze(["annotations.json", "annotations.md"]),
  "listing-repair-packet": Object.freeze(["repair-packet.json", "repair-packet.md"]),
  "repeat-job-record": Object.freeze(["repeat-job.json", "repeat-job.md"]),
});
