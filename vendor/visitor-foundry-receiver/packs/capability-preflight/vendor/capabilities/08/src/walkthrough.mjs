/**
 * runInstallFirstResultWalkthrough — compose thin install-to-first-result stages.
 */
import {
  DEPENDS_ON,
  DRY_RUN_NOTE,
  HEAVY_LANE_OWNED,
  MUTATION_BOUNDARY,
  SCHEMA,
  STAGE_ID,
  STAGE_STATUS,
  THIN_EARLY_NOTE,
  WALKTHROUGH_STATUS,
} from "./constants.mjs";
import { resolveDependencies } from "./deps.mjs";
import { runDiscoveryStub } from "./stubs/discovery.mjs";
import { runPrerequisitesStub } from "./stubs/prereq.mjs";
import { runFallbackPlan } from "./stubs/fallback.mjs";
import { verifySuppliedArtifact } from "./verify.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Build a Cap05 failure_outcome.v1 fixture from optional input.failedOutcome
 * or from the walkthrough verify result.
 */
export function buildSyntheticFailedOutcome(input, verify, envelope, cost) {
  if (isPlainObject(input?.failedOutcome)) {
    return input.failedOutcome;
  }

  const capabilityId =
    (typeof input?.costInput?.capabilityId === "string" && input.costInput.capabilityId.trim()) ||
    (typeof input?.requirements?.capabilityId === "string" &&
      input.requirements.capabilityId.trim()) ||
    (typeof input?.capabilityId === "string" && input.capabilityId.trim()) ||
    (typeof input?.discovery?.capabilityId === "string" && input.discovery.capabilityId.trim()) ||
    "walkthrough_capability";

  const attemptId =
    (typeof input?.taskId === "string" && input.taskId.trim()) ||
    (typeof envelope?.taskId === "string" && envelope.taskId.trim()) ||
    (typeof cost?.taskId === "string" && cost.taskId.trim()) ||
    "walkthrough-attempt";

  const failures = Array.isArray(verify?.failures) ? verify.failures : [];
  const verifyFailed = verify?.ok === false;

  return {
    schema: "pilot.r2.capabilities.failure_outcome.v1",
    capabilityId,
    attemptId,
    failureClass: verifyFailed ? "validation" : "unknown",
    mutationState: "none",
    observedState: {
      summary: verifyFailed
        ? `Walkthrough verify failed: ${failures.join(", ") || "checks_failed"}`
        : "Walkthrough verify succeeded; synthetic outcome for optional Cap05 fallback stage.",
      verifyOk: verify?.ok === true,
      failures,
    },
    errorCode: verifyFailed ? "VERIFY_FAILED" : "SYNTHETIC_NO_FAILURE",
    notes: "Synthetic failed-outcome derived by Cap08 walkthrough for Cap05.",
    demo: true,
  };
}

/**
 * @param {object} input
 * @param {object} input.requirements — Cap01-shaped task requirements
 * @param {object} input.costInput — Cap04-shaped cost dry-run input
 * @param {object} input.artifact — supplied result fixture to verify
 * @param {object} [input.discovery]
 * @param {object} [input.prerequisites]
 * @param {object} [input.failedOutcome] — optional Cap05 failure_outcome fixture
 * @param {object} [opts]
 */
export async function runInstallFirstResultWalkthrough(
  input,
  { clock = () => Date.now(), deps = null } = {},
) {
  const generatedAt = new Date(clock()).toISOString();
  if (!isPlainObject(input)) {
    return {
      schema: SCHEMA,
      generatedAt,
      status: WALKTHROUGH_STATUS.REJECTED,
      dryRun: true,
      paidInstall: false,
      liveNetwork: false,
      error: { code: "invalid_input", message: "walkthrough input must be an object" },
      stages: [],
      thinEarlyPromote: true,
      dependsOn: [...DEPENDS_ON],
      heavyLaneOwned: [...HEAVY_LANE_OWNED],
      dryRunNote: DRY_RUN_NOTE,
      mutationBoundary: MUTATION_BOUNDARY,
    };
  }

  const resolved = deps || (await resolveDependencies());
  const stages = [];

  // 1) discovery (Cap02 stub)
  const discovery = runDiscoveryStub(input.discovery || {
    capabilityId: input.costInput?.capabilityId || input.capabilityId,
  });
  stages.push({
    id: STAGE_ID.DISCOVERY,
    status: discovery.status,
    implementation: discovery.implementation,
    heavyLaneOwned: discovery.heavyLaneOwned,
    result: discovery,
  });

  // 2) prerequisites (Cap03 stub)
  const prereq = runPrerequisitesStub(input.prerequisites || {});
  stages.push({
    id: STAGE_ID.PREREQUISITES,
    status: prereq.status,
    implementation: prereq.implementation,
    heavyLaneOwned: prereq.heavyLaneOwned,
    result: prereq,
  });

  // 3) envelope (Cap01 or stub)
  const envelopeInput = input.requirements ?? input.envelopeInput ?? null;
  let envelope = null;
  let envelopeError = null;
  try {
    envelope = resolved.cap01.buildTaskRequirementsEnvelope(envelopeInput, { clock });
  } catch (err) {
    envelopeError = { code: err.code || "envelope_error", message: err.message };
  }
  const envelopeStatus = envelopeError
    ? STAGE_STATUS.FAILED
    : envelope?.status === "rejected"
      ? STAGE_STATUS.FAILED
      : envelope?.status === "partial_input"
        ? STAGE_STATUS.STUB_OK
        : STAGE_STATUS.OK;
  stages.push({
    id: STAGE_ID.ENVELOPE,
    status: envelopeError ? STAGE_STATUS.FAILED : (envelope?.stub ? STAGE_STATUS.STUB_OK : envelopeStatus),
    implementation: resolved.cap01.implementation,
    dependsOn: "R2-CAPABILITIES-01",
    resolvedFrom: resolved.cap01.path,
    result: envelopeError ? { error: envelopeError } : {
      status: envelope.status,
      taskId: envelope.taskId,
      requiredInputCount: envelope.requiredInputs?.length ?? 0,
      objectiveCheckCount: envelope.outputConstraints?.objectiveChecks?.length ?? 0,
      missingInputs: (envelope.missingInputs || []).map((m) => m.id),
      stub: envelope.stub === true,
    },
    envelope,
  });

  // 4) cost dry-run (Cap04 or stub)
  const costInput = input.costInput ?? null;
  let cost = null;
  let costError = null;
  try {
    cost = resolved.cap04.buildCostDryRunComparison(costInput, { clock });
  } catch (err) {
    costError = { code: err.code || "cost_error", message: err.message };
  }
  const costStageStatus = costError
    ? STAGE_STATUS.FAILED
    : cost?.status === "rejected"
      ? STAGE_STATUS.FAILED
      : cost?.stub
        ? STAGE_STATUS.STUB_OK
        : cost?.status === "ready"
          ? STAGE_STATUS.OK
          : STAGE_STATUS.STUB_OK;
  stages.push({
    id: STAGE_ID.COST_DRY_RUN,
    status: costStageStatus,
    implementation: resolved.cap04.implementation,
    dependsOn: "R2-CAPABILITIES-04",
    resolvedFrom: resolved.cap04.path,
    result: costError
      ? { error: costError }
      : {
          status: cost.status,
          dryRun: cost.dryRun === true,
          paidCalls: cost.paidCalls === false ? false : cost.paidCalls,
          quoteCount: cost.comparisons?.length ?? 0,
          priceStates: (cost.comparisons || []).map((c) => c.priceState),
          stub: cost.stub === true,
        },
    comparison: cost,
  });

  // 5) verify supplied fixture artifact (thin local — not Cap06)
  const verify =
    envelope && !envelopeError
      ? verifySuppliedArtifact(input.artifact, envelope)
      : {
          stageId: STAGE_ID.VERIFY,
          implementation: "thin_local",
          status: STAGE_STATUS.FAILED,
          ok: false,
          failures: ["envelope_unavailable"],
          checks: [],
        };
  stages.push({
    id: STAGE_ID.VERIFY,
    status: verify.status,
    implementation: verify.implementation,
    heavyLaneOwnedNote: verify.heavyLaneOwned,
    result: {
      ok: verify.ok,
      failures: verify.failures,
      checkCount: verify.checks?.length ?? 0,
      note: verify.note,
    },
  });

  // 6) optional fallback (real Cap05 when resolvable)
  const failedOutcome = buildSyntheticFailedOutcome(input, verify, envelope, cost);
  const fallback = runFallbackPlan({
    cap05: resolved.cap05,
    failedOutcome,
    clock,
  });
  stages.push({
    id: STAGE_ID.FALLBACK_PLAN,
    status: fallback.status,
    implementation: fallback.implementation,
    optional: true,
    resolvedFrom: fallback.resolvedFrom ?? resolved.cap05?.path ?? null,
    result: {
      status: fallback.status,
      optional: true,
      note: fallback.note,
      planStatus: fallback.plan?.status ?? null,
      planSchema: fallback.plan?.schema ?? null,
      failureClass: fallback.plan?.failureClass ?? null,
      mutationState: fallback.plan?.mutationState ?? null,
      mutationPreservation: fallback.plan?.mutationPreservation ?? null,
      stepCount: Array.isArray(fallback.plan?.steps) ? fallback.plan.steps.length : 0,
      dryRun: fallback.plan?.dryRun === true,
      paidCalls: fallback.plan?.paidCalls === false ? false : fallback.plan?.paidCalls ?? null,
      liveExecution: fallback.plan?.liveExecution === false ? false : fallback.plan?.liveExecution ?? null,
    },
    plan: fallback.plan ?? null,
  });

  const hardFail = stages.some(
    (s) =>
      s.status === STAGE_STATUS.FAILED &&
      s.id !== STAGE_ID.FALLBACK_PLAN,
  );
  const verifyFailed = verify.ok === false;

  let status = WALKTHROUGH_STATUS.READY;
  if (hardFail || verifyFailed) {
    status = verifyFailed && !envelopeError && cost?.status !== "rejected"
      ? WALKTHROUGH_STATUS.FAILED
      : WALKTHROUGH_STATUS.FAILED;
  }
  if (envelope?.status === "partial_input" || cost?.status === "partial_input") {
    if (status === WALKTHROUGH_STATUS.READY) status = WALKTHROUGH_STATUS.PARTIAL_INPUT;
  }
  if (envelopeError || cost?.status === "rejected") {
    status = WALKTHROUGH_STATUS.REJECTED;
  }

  const taskId =
    envelope?.taskId ||
    cost?.taskId ||
    (typeof input.taskId === "string" ? input.taskId : null) ||
    "unknown";

  const fallbackImplLabel =
    resolved.cap05?.available && resolved.cap05?.implementation === "cap05"
      ? "cap05"
      : "not_run (Cap05 absent)";

  return {
    schema: SCHEMA,
    taskId,
    generatedAt,
    status,
    dryRun: true,
    paidInstall: false,
    liveNetwork: false,
    thinEarlyPromote: true,
    thinEarlyNote: THIN_EARLY_NOTE,
    dependsOn: [...DEPENDS_ON],
    heavyLaneOwned: [...HEAVY_LANE_OWNED],
    stageImplementations: {
      discovery: "stub (Cap02 heavyLaneOwned)",
      prerequisites: "stub (Cap03 heavyLaneOwned)",
      envelope: resolved.cap01.implementation,
      cost_dry_run: resolved.cap04.implementation,
      verify: "thin_local (not Cap06; Cap06 heavyLaneOwned)",
      fallback_plan: fallbackImplLabel,
    },
    stages,
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
  };
}
