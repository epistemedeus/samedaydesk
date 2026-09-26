/**
 * BOT-S162 — Pilot Capability Delivery R2 integrated journey constants.
 *
 * Assembles Cap01/04/05/07/08 (native) + Cap02/03/06 (Heavy S146 pin) into one
 * eight-component install/import/CLI journey. Preserves unknown/partial;
 * never claims readyForRelease from TAP text alone (S161 / BOT-INTEGRATION).
 */

export const SCHEMA = "pilot.r2.capabilities.journey_s162.v1";

/** Exact Heavy pin consumed from epistemedeus/pilot. */
export const HEAVY_PIN = "8a6716482b2f240078f7b17a3cf5547f1d122302";

export const HEAVY_LANE = "S164";

export const HEAVY_DIRS = Object.freeze([
  "experiments/s138-capability-evidence",
  "experiments/s146-capability-consumer-gates",
]);

export const JOURNEY_STATUS = Object.freeze({
  /** Heavy wired; one or more Heavy stages returned partial / not_ready / untested / empty. */
  INTEGRATED_PARTIAL: "integrated_partial",
  /** Heavy wired; stages ran without hard reject/fail — still not release-ready. */
  INTEGRATED: "integrated",
  FAILED: "failed",
  REJECTED: "rejected",
  PARTIAL_INPUT: "partial_input",
  NOT_ACCEPTED: "not_accepted",
});

export const ACCEPTANCE = Object.freeze({
  NOT_ACCEPTED: "not_accepted",
  /** Heavy present but unknown/partial/gaps preserved; not release-ready. */
  GAPS_PRESERVED: "gaps_preserved",
});

export const STAGE_STATUS = Object.freeze({
  OK: "ok",
  FAILED: "failed",
  REJECTED: "rejected",
  PARTIAL_INPUT: "partial_input",
  PARTIAL: "partial",
  NOT_READY: "not_ready",
  UNTESTED_DECLARATION: "untested_declaration",
  EMPTY: "empty",
  SKIPPED: "skipped_not_needed",
  BOUND: "bound",
  CONTENT_BOUND: "content_bound",
  READY: "ready",
  COMPLETE: "complete",
});

export const STAGE_ID = Object.freeze({
  ENVELOPE: "envelope",
  INSTALL_PREREQ: "install_prereq",
  EVIDENCE_BIND: "evidence_bind",
  COST_DRY_RUN: "cost_dry_run",
  FALLBACK_PLAN: "fallback_plan",
  VERIFY_OR_PARTIAL: "verify_or_partial",
  BUYER_CONTEXT_PACK: "buyer_context_pack",
  WALKTHROUGH: "walkthrough",
  OVERALL: "overall",
});

export const NATIVE_CAPS = Object.freeze(["01", "04", "05", "07", "08"]);

export const HEAVY_CAPS = Object.freeze(["02", "03", "06"]);

export const NATIVE_TIPS = Object.freeze({
  "01": "8e51dc5f",
  "04": "295569cf",
  "05": "5cef366b",
  "07": "082c5f08",
  "08": "3f970255",
});

/** Relative import paths from journey-s162/src/. */
export const IMPORT_PATHS = Object.freeze({
  cap01: "../../01/src/index.mjs",
  cap04: "../../04/src/index.mjs",
  cap05: "../../05/src/index.mjs",
  cap07: "../../07/src/index.mjs",
  cap08: "../../08/src/index.mjs",
  heavy:
    "../../../s138-capability-evidence/src/index.mjs",
});

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns residual findings to source owner, merge, publication, and paid actions.";

export const DRY_RUN_NOTE =
  "Offline dry-run journey only: never claims paid install, live network, or ready-for-release from TAP/#pass text alone.";

export const S161_HONESTY_NOTES = Object.freeze([
  "Preserve unknown/partial — never invent ready/bound from empty reports.",
  "Hashing imported test output / TAP '# pass' text does NOT prove those tests ran against the claimed source revision (BOT-INTEGRATION Cap03 note).",
  "Do not set readyForRelease true solely from TAP pass text.",
  "Heavy's own 259 tests / 36 CLI sessions are NOT journey acceptance; count only this package's integrated tests.",
  "Catalog listing ≠ install readiness; signer/provenance alone ≠ bound evidence.",
]);
