/**
 * runCapabilityJourneyS162 — eight-component integrated journey.
 *
 * Cap01 envelope → Cap02 resolvePrerequisites → Cap03 bindEvidence →
 * Cap04 cost dry-run → Cap05 fallback (as needed) → Cap06 composePartial →
 * Cap07 buyer context pack → Cap08 walkthrough
 *
 * Clears missing_heavy (Heavy pin wired) but preserves unknown/partial.
 * Never sets readyForRelease true solely from TAP # pass text (S161).
 */

import { buildTaskRequirementsEnvelope } from "../../01/src/index.mjs";
import { buildCostDryRunComparison } from "../../04/src/index.mjs";
import { buildFailureFallbackPlan } from "../../05/src/index.mjs";
import { buildBuyerContextPack } from "../../07/src/index.mjs";
import { runInstallFirstResultWalkthrough } from "../../08/src/index.mjs";

import {
  ACCEPTANCE,
  DRY_RUN_NOTE,
  HEAVY_CAPS,
  HEAVY_LANE,
  HEAVY_PIN,
  IMPORT_PATHS,
  JOURNEY_STATUS,
  MUTATION_BOUNDARY,
  NATIVE_CAPS,
  NATIVE_TIPS,
  S161_HONESTY_NOTES,
  SCHEMA,
  STAGE_ID,
  STAGE_STATUS,
} from "./constants.mjs";
import {
  evidenceBinder,
  partialComposer,
  prereqResolver,
} from "./adapters.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function buildSyntheticFailedOutcome(input, heavyHints = {}) {
  if (isPlainObject(input?.failedOutcome)) {
    return input.failedOutcome;
  }

  const capabilityId =
    (typeof input?.costInput?.capabilityId === "string" &&
      input.costInput.capabilityId.trim()) ||
    (typeof input?.capabilityId === "string" && input.capabilityId.trim()) ||
    "journey_s162_capability";

  const attemptId =
    (typeof input?.taskId === "string" && input.taskId.trim()) ||
    "journey-s162-attempt";

  const reasons = [];
  if (heavyHints.prereqReadiness && heavyHints.prereqReadiness !== "ready") {
    reasons.push(`Cap02 readiness=${heavyHints.prereqReadiness}`);
  }
  if (
    heavyHints.evidenceStatus &&
    heavyHints.evidenceStatus !== "content_bound" &&
    heavyHints.evidenceStatus !== "bound"
  ) {
    reasons.push(`Cap03 status=${heavyHints.evidenceStatus}`);
  }

  return {
    schema: "pilot.r2.capabilities.failure_outcome.v1",
    capabilityId,
    attemptId,
    failureClass: reasons.length ? "validation" : "unknown",
    mutationState: "none",
    observedState: {
      summary: reasons.length
        ? `Fallback triggered by Heavy gaps: ${reasons.join("; ")}`
        : "Synthetic failed-outcome for optional Cap05 when Heavy gaps absent but caller requested fallback.",
      verifyOk: false,
      heavyPin: HEAVY_PIN,
      reasons,
    },
    errorCode: reasons.length ? "HEAVY_GAPS" : "SYNTHETIC_NO_FAILURE",
    notes: "Synthetic failed-outcome derived by journey-s162 for Cap05.",
    demo: true,
  };
}

function summarizeEnvelope(envelope) {
  if (!envelope) return null;
  return {
    status: envelope.status,
    taskId: envelope.taskId,
    schema: envelope.schema,
    requiredInputCount: envelope.requiredInputs?.length ?? 0,
    objectiveCheckCount: envelope.outputConstraints?.objectiveChecks?.length ?? 0,
    missingInputs: (envelope.missingInputs || []).map((m) => m.id ?? m),
  };
}

function summarizeCost(cost) {
  if (!cost) return null;
  return {
    status: cost.status,
    dryRun: cost.dryRun === true,
    paidCalls: cost.paidCalls === false ? false : cost.paidCalls,
    quoteCount: cost.comparisons?.length ?? 0,
    priceStates: (cost.comparisons || []).map((c) => c.priceState),
  };
}

function summarizePack(pack) {
  if (!pack) return null;
  return {
    status: pack.status,
    dryRun: pack.dryRun === true,
    liveNetwork: pack.liveNetwork === false ? false : pack.liveNetwork,
    taskId: pack.taskId ?? null,
    schema: pack.schema ?? null,
    redactedSecretCount:
      pack.dryRunReadback?.redactedSecrets?.length ?? pack.redactedCount ?? null,
  };
}

function summarizePlan(plan) {
  if (!plan) return null;
  return {
    status: plan.status,
    schema: plan.schema,
    failureClass: plan.failureClass ?? null,
    mutationState: plan.mutationState ?? null,
    mutationPreservation: plan.mutationPreservation ?? null,
    stepCount: Array.isArray(plan.steps) ? plan.steps.length : 0,
    dryRun: plan.dryRun === true,
    paidCalls: plan.paidCalls === false ? false : plan.paidCalls ?? null,
    liveExecution: plan.liveExecution === false ? false : plan.liveExecution ?? null,
  };
}

function stageFromCapResult(id, implementation, importPath, tip, result, error) {
  if (error) {
    return {
      id,
      status: STAGE_STATUS.FAILED,
      implementation,
      importPath,
      nativeTip: tip,
      result: { error: { code: error.code || "stage_error", message: error.message } },
    };
  }
  let status = STAGE_STATUS.OK;
  if (result?.status === "rejected") status = STAGE_STATUS.REJECTED;
  else if (result?.status === "partial_input") status = STAGE_STATUS.PARTIAL_INPUT;
  else if (result?.status === "ready") status = STAGE_STATUS.OK;
  return {
    id,
    status,
    implementation,
    importPath,
    nativeTip: tip,
    result,
  };
}

function stageFromHeavyAdapter(id, adapterResult) {
  const st = adapterResult.status;
  let status = STAGE_STATUS.PARTIAL;
  if (st === "ready") status = STAGE_STATUS.READY;
  else if (st === "content_bound") status = STAGE_STATUS.CONTENT_BOUND;
  else if (st === "bound") status = STAGE_STATUS.BOUND;
  else if (st === "complete") status = STAGE_STATUS.COMPLETE;
  else if (st === "not_ready") status = STAGE_STATUS.NOT_READY;
  else if (st === "untested_declaration") status = STAGE_STATUS.UNTESTED_DECLARATION;
  else if (st === "empty") status = STAGE_STATUS.EMPTY;
  else if (st === "partial") status = STAGE_STATUS.PARTIAL;
  else status = STAGE_STATUS.PARTIAL;

  return {
    id,
    status,
    implementation: `heavy Cap${adapterResult.cap} ${adapterResult.api}`,
    heavyLane: adapterResult.heavyLane,
    heavyPin: adapterResult.heavyPin,
    adapterWired: adapterResult.adapterWired === true,
    adapterReady: adapterResult.adapterReady === true,
    result: adapterResult,
  };
}

function fallbackNeeded(prereq, evidence, input) {
  if (isPlainObject(input?.failedOutcome)) return true;
  if (input?.forceFallback === true) return true;
  if (prereq?.readiness && prereq.readiness !== "ready") return true;
  if (evidence?.status && evidence.status !== "content_bound" && evidence.status !== "bound") return true;
  return false;
}

/**
 * @param {object} input
 * @param {object} [opts]
 */
export async function runCapabilityJourneyS162(
  input,
  { clock = () => Date.now() } = {},
) {
  const generatedAt = new Date(clock()).toISOString();

  if (!isPlainObject(input)) {
    return {
      schema: SCHEMA,
      generatedAt,
      journeyStatus: JOURNEY_STATUS.REJECTED,
      acceptance: ACCEPTANCE.NOT_ACCEPTED,
      accepted: false,
      readyForRelease: false,
      dryRun: true,
      paidInstall: false,
      liveNetwork: false,
      error: { code: "invalid_input", message: "journey input must be an object" },
      stages: [],
      missingHeavyCaps: [],
      heavyCaps: [...HEAVY_CAPS],
      heavyPin: HEAVY_PIN,
      nativeCaps: [...NATIVE_CAPS],
      nativeTips: { ...NATIVE_TIPS },
      dryRunNote: DRY_RUN_NOTE,
      mutationBoundary: MUTATION_BOUNDARY,
      s161HonestyNotes: [...S161_HONESTY_NOTES],
    };
  }

  const stages = [];

  // 1) Cap01 envelope
  let envelope = null;
  let envelopeError = null;
  try {
    envelope = buildTaskRequirementsEnvelope(
      input.requirements ?? input.envelopeInput ?? null,
      { clock },
    );
  } catch (err) {
    envelopeError = err;
  }
  stages.push(
    stageFromCapResult(
      STAGE_ID.ENVELOPE,
      "cap01",
      IMPORT_PATHS.cap01,
      NATIVE_TIPS["01"],
      envelopeError ? null : summarizeEnvelope(envelope),
      envelopeError,
    ),
  );
  if (!envelopeError && envelope) {
    stages[stages.length - 1].envelope = envelope;
  }

  // 2) Cap02 resolvePrerequisites (Heavy)
  const prereqInput =
    input.prerequisites ||
    input.installPrereq ||
    input.prereq ||
    {};
  const prereq = prereqResolver(prereqInput);
  stages.push(stageFromHeavyAdapter(STAGE_ID.INSTALL_PREREQ, prereq));

  // 3) Cap03 bindEvidence (Heavy)
  const evidenceInput =
    input.evidence ||
    input.evidenceBind ||
    input.bindEvidence ||
    {};
  const evidence = evidenceBinder(evidenceInput);
  stages.push(stageFromHeavyAdapter(STAGE_ID.EVIDENCE_BIND, evidence));

  // 4) Cap04 cost dry-run
  let cost = null;
  let costError = null;
  try {
    cost = buildCostDryRunComparison(input.costInput ?? null, { clock });
  } catch (err) {
    costError = err;
  }
  stages.push(
    stageFromCapResult(
      STAGE_ID.COST_DRY_RUN,
      "cap04",
      IMPORT_PATHS.cap04,
      NATIVE_TIPS["04"],
      costError ? null : summarizeCost(cost),
      costError,
    ),
  );
  if (!costError && cost) {
    stages[stages.length - 1].comparison = cost;
  }

  // 5) Cap05 fallback (as needed)
  const needFallback = fallbackNeeded(prereq, evidence, input);
  let plan = null;
  let planError = null;
  if (needFallback) {
    const failedOutcome = buildSyntheticFailedOutcome(input, {
      prereqReadiness: prereq.readiness,
      evidenceStatus: evidence.status,
    });
    try {
      plan = buildFailureFallbackPlan(failedOutcome, { clock });
    } catch (err) {
      planError = err;
    }
    stages.push(
      stageFromCapResult(
        STAGE_ID.FALLBACK_PLAN,
        "cap05",
        IMPORT_PATHS.cap05,
        NATIVE_TIPS["05"],
        planError ? null : summarizePlan(plan),
        planError,
      ),
    );
    if (!planError && plan) {
      stages[stages.length - 1].plan = plan;
    }
    stages[stages.length - 1].fallbackReason = {
      needed: true,
      prereqReadiness: prereq.readiness,
      evidenceStatus: evidence.status,
      callerFailedOutcome: isPlainObject(input.failedOutcome),
    };
  } else {
    stages.push({
      id: STAGE_ID.FALLBACK_PLAN,
      status: STAGE_STATUS.SKIPPED,
      implementation: "cap05",
      importPath: IMPORT_PATHS.cap05,
      nativeTip: NATIVE_TIPS["05"],
      result: {
        status: "skipped_not_needed",
        note: "Cap05 skipped: Cap02 ready and Cap03 content_bound and no caller failedOutcome",
      },
    });
  }

  // 6) Cap06 composePartial (Heavy)
  const composeInput =
    input.compose ||
    input.partial ||
    input.verify ||
    {};
  const partial = partialComposer(composeInput);
  stages.push(stageFromHeavyAdapter(STAGE_ID.VERIFY_OR_PARTIAL, partial));

  // 7) Cap07 buyer context pack
  let pack = null;
  let packError = null;
  try {
    pack = buildBuyerContextPack(
      input.buyerContext ?? input.buyerContextPack ?? null,
      { clock },
    );
  } catch (err) {
    packError = err;
  }
  stages.push(
    stageFromCapResult(
      STAGE_ID.BUYER_CONTEXT_PACK,
      "cap07",
      IMPORT_PATHS.cap07,
      NATIVE_TIPS["07"],
      packError ? null : summarizePack(pack),
      packError,
    ),
  );
  if (!packError && pack) {
    stages[stages.length - 1].pack = pack;
  }

  // 8) Cap08 walkthrough (or journey CLI walkthrough lineage)
  let walkthrough = null;
  let walkthroughError = null;
  try {
    const wtInput = {
      taskId: input.taskId || envelope?.taskId || "journey-s162-walkthrough",
      requirements: input.requirements ?? input.envelopeInput ?? null,
      costInput: input.costInput ?? null,
      artifact: input.artifact ?? null,
      discovery: input.discovery ?? { capabilityId: input.costInput?.capabilityId },
      prerequisites: input.walkthroughPrerequisites ?? {
        prerequisites: ["node20", "offline_fixtures", `heavy_pin:${HEAVY_PIN}`],
      },
      failedOutcome: input.failedOutcome,
    };
    walkthrough = await runInstallFirstResultWalkthrough(wtInput, { clock });
  } catch (err) {
    walkthroughError = err;
  }
  if (walkthroughError) {
    stages.push({
      id: STAGE_ID.WALKTHROUGH,
      status: STAGE_STATUS.FAILED,
      implementation: "cap08",
      importPath: IMPORT_PATHS.cap08,
      nativeTip: NATIVE_TIPS["08"],
      result: {
        error: {
          code: walkthroughError.code || "walkthrough_error",
          message: walkthroughError.message,
        },
      },
    });
  } else {
    let wtStatus = STAGE_STATUS.OK;
    if (walkthrough?.status === "rejected") wtStatus = STAGE_STATUS.REJECTED;
    else if (walkthrough?.status === "partial_input") wtStatus = STAGE_STATUS.PARTIAL_INPUT;
    else if (walkthrough?.status === "failed") wtStatus = STAGE_STATUS.FAILED;
    stages.push({
      id: STAGE_ID.WALKTHROUGH,
      status: wtStatus,
      implementation: "cap08",
      importPath: IMPORT_PATHS.cap08,
      nativeTip: NATIVE_TIPS["08"],
      result: {
        status: walkthrough?.status ?? null,
        dryRun: walkthrough?.dryRun === true,
        paidInstall: walkthrough?.paidInstall === false ? false : walkthrough?.paidInstall,
        liveNetwork: walkthrough?.liveNetwork === false ? false : walkthrough?.liveNetwork,
        stageCount: Array.isArray(walkthrough?.stages) ? walkthrough.stages.length : 0,
      },
      walkthrough,
    });
  }

  // Overall acceptance — Heavy wired (no missing_heavy) but preserve gaps;
  // NEVER readyForRelease from TAP alone.
  const heavyGapSignals = [];
  if (prereq.readiness && prereq.readiness !== "ready") {
    heavyGapSignals.push(`cap02:${prereq.readiness}`);
  }
  if (evidence.status && evidence.status !== "content_bound" && evidence.status !== "bound") {
    heavyGapSignals.push(`cap03:${evidence.status}`);
  }
  if (partial.status && partial.status !== "complete") {
    heavyGapSignals.push(`cap06:${partial.status}`);
  }

  const nativeHardFail = stages.some(
    (s) =>
      [STAGE_ID.ENVELOPE, STAGE_ID.COST_DRY_RUN, STAGE_ID.BUYER_CONTEXT_PACK].includes(
        s.id,
      ) &&
      (s.status === STAGE_STATUS.FAILED || s.status === STAGE_STATUS.REJECTED),
  );

  let journeyStatus = JOURNEY_STATUS.INTEGRATED;
  if (envelopeError || cost?.status === "rejected" || pack?.status === "rejected") {
    journeyStatus = JOURNEY_STATUS.REJECTED;
  } else if (nativeHardFail || walkthroughError) {
    journeyStatus = JOURNEY_STATUS.FAILED;
  } else if (
    envelope?.status === "partial_input" ||
    cost?.status === "partial_input" ||
    pack?.status === "partial_input"
  ) {
    journeyStatus = JOURNEY_STATUS.PARTIAL_INPUT;
  } else if (heavyGapSignals.length) {
    journeyStatus = JOURNEY_STATUS.INTEGRATED_PARTIAL;
  }

  // Explicit: never claim release-ready from TAP / hashing alone (S161).
  const acceptance =
    heavyGapSignals.length > 0
      ? ACCEPTANCE.GAPS_PRESERVED
      : ACCEPTANCE.NOT_ACCEPTED;
  const accepted = false;
  const readyForRelease = false;

  const overallStage = {
    id: STAGE_ID.OVERALL,
    status: heavyGapSignals.length ? STAGE_STATUS.PARTIAL : STAGE_STATUS.OK,
    journeyStatus,
    acceptance,
    accepted,
    readyForRelease,
    missingHeavyCaps: [],
    heavyCaps: [...HEAVY_CAPS],
    heavyPin: HEAVY_PIN,
    heavyLane: HEAVY_LANE,
    heavyGapSignals,
    note:
      "missing_heavy cleared (Heavy pin wired). readyForRelease remains false — TAP/#pass does not prove execution against claimed revision.",
  };
  stages.push(overallStage);

  const taskId =
    envelope?.taskId ||
    cost?.taskId ||
    pack?.taskId ||
    (typeof input.taskId === "string" ? input.taskId : null) ||
    "unknown";

  return {
    schema: SCHEMA,
    taskId,
    generatedAt,
    journeyStatus,
    acceptance,
    accepted,
    readyForRelease,
    dryRun: true,
    paidInstall: false,
    liveNetwork: false,
    nativeCaps: [...NATIVE_CAPS],
    nativeTips: { ...NATIVE_TIPS },
    heavyCaps: [...HEAVY_CAPS],
    heavyPin: HEAVY_PIN,
    heavyLane: HEAVY_LANE,
    missingHeavyCaps: [],
    heavyGapSignals,
    importPaths: { ...IMPORT_PATHS },
    stageImplementations: {
      envelope: "cap01 (relative ../../01/src/index.mjs)",
      install_prereq: `heavy Cap02 resolvePrerequisites @ ${HEAVY_PIN}`,
      evidence_bind: `heavy Cap03 bindEvidence @ ${HEAVY_PIN}`,
      cost_dry_run: "cap04 (relative ../../04/src/index.mjs)",
      fallback_plan: needFallback
        ? "cap05 (as needed — Heavy gaps or caller failedOutcome)"
        : "cap05 skipped_not_needed",
      verify_or_partial: `heavy Cap06 composePartial @ ${HEAVY_PIN}`,
      buyer_context_pack: "cap07 (relative ../../07/src/index.mjs)",
      walkthrough: "cap08 (relative ../../08/src/index.mjs)",
      overall:
        "missing_heavy cleared; unknown/partial preserved; readyForRelease=false (S161)",
    },
    stages,
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    s161HonestyNotes: [...S161_HONESTY_NOTES],
  };
}

/** Sync wrapper for callers that cannot await (CLI demo uses async). */
export function runCapabilityJourneyS162Sync(input, opts) {
  throw new Error(
    "runCapabilityJourneyS162 is async (Cap08 walkthrough). Use await runCapabilityJourneyS162(...).",
  );
}
