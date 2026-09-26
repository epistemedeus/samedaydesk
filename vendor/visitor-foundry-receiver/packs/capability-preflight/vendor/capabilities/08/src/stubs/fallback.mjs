/**
 * Cap05 fallback-plan stage — real Cap05 when resolvable; otherwise not_run.
 *
 * When Cap05 is present, calls buildFailureFallbackPlan with the supplied
 * failed-outcome (synthetic from verify failure or caller input.failedOutcome).
 * Preserves Cap05 ambiguous-mutation semantics (never invents rolled_back:true).
 */

import { STAGE_STATUS } from "../constants.mjs";

/**
 * @param {object} opts
 * @param {object} [opts.cap05] — resolved Cap05 dependency block from deps.mjs
 * @param {object} [opts.failedOutcome] — Cap05 failure_outcome.v1 shaped input
 * @param {() => number} [opts.clock]
 */
export function runFallbackPlan({
  cap05 = null,
  failedOutcome = null,
  clock = () => Date.now(),
} = {}) {
  const available =
    Boolean(cap05?.available) && typeof cap05?.buildFailureFallbackPlan === "function";

  if (!available) {
    return {
      stageId: "fallback_plan",
      implementation: "stub",
      optional: true,
      status: STAGE_STATUS.NOT_RUN,
      note: "Cap05 fallback plan not available — stage skipped (optional).",
    };
  }

  const plan = cap05.buildFailureFallbackPlan(failedOutcome, { clock });

  let status = STAGE_STATUS.OK;
  if (plan?.status === "rejected") status = STAGE_STATUS.FAILED;
  else if (plan?.status === "partial_input") status = STAGE_STATUS.STUB_OK;
  else if (plan?.status === "ready") status = STAGE_STATUS.OK;

  return {
    stageId: "fallback_plan",
    implementation: "cap05",
    optional: true,
    status,
    resolvedFrom: cap05.path ?? null,
    plan,
    note:
      "Real Cap05 buildFailureFallbackPlan — dry-run only; ambiguous mutation preserved when present.",
  };
}

/** Backward-compatible alias used by older imports/tests. */
export function runFallbackPlanStub(opts = {}) {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "cap05Available")) {
    // Legacy thin-stub call shape: { cap05Available }
    if (!opts.cap05Available) {
      return runFallbackPlan({ cap05: null });
    }
    // Legacy "Cap05 detected" without a real importer — keep not_run unless a
    // real buildFailureFallbackPlan is supplied via cap05.
    if (typeof opts.cap05?.buildFailureFallbackPlan !== "function") {
      return {
        stageId: "fallback_plan",
        implementation: "stub",
        optional: true,
        status: STAGE_STATUS.NOT_RUN,
        note:
          "Cap05 marker-only detection without buildFailureFallbackPlan — stage skipped.",
      };
    }
  }
  return runFallbackPlan(opts);
}
