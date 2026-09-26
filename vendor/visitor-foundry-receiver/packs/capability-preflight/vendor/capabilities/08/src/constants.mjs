/**
 * R2-CAPABILITIES-08 — Install-to-first-result walkthrough (thin early).
 *
 * Composes discovery → prerequisites → envelope → cost dry-run → verify
 * → optional fallback into one portable offline demo.
 *
 * Cap02/03/06 are Heavy S138-owned — stubbed here (heavyLaneOwned).
 * Cap01 / Cap04 are dependsOn; resolved from sibling worktrees when present.
 * Cap05 fallback calls real buildFailureFallbackPlan when Cap05 is resolvable;
 * otherwise the fallback_plan stage stays not_run (backward compatible).
 */

export const SCHEMA = "pilot.r2.capabilities.install_first_result_walkthrough.v1";

export const WALKTHROUGH_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL_INPUT: "partial_input",
  FAILED: "failed",
  REJECTED: "rejected",
});

export const STAGE_STATUS = Object.freeze({
  OK: "ok",
  STUB_OK: "stub_ok",
  FAILED: "failed",
  NOT_RUN: "not_run",
  SKIPPED: "skipped",
});

export const STAGE_ID = Object.freeze({
  DISCOVERY: "discovery",
  PREREQUISITES: "prerequisites",
  ENVELOPE: "envelope",
  COST_DRY_RUN: "cost_dry_run",
  VERIFY: "verify",
  FALLBACK_PLAN: "fallback_plan",
});

export const DEPENDS_ON = Object.freeze([
  "R2-CAPABILITIES-01",
  "R2-CAPABILITIES-04",
]);

export const HEAVY_LANE_OWNED = Object.freeze([
  "R2-CAPABILITIES-02",
  "R2-CAPABILITIES-03",
  "R2-CAPABILITIES-06",
]);

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.";

export const DRY_RUN_NOTE =
  "Offline dry-run walkthrough only: never claims paid install or live network.";

export const THIN_EARLY_NOTE =
  "thin early promote — Cap02/03/06 Heavy S138-owned; Cap01/04 wired when sibling trees present.";
