import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { JOURNEY_STEP, SCHEMA } from "./constants.mjs";
import { GATE_DECISION, evaluateAdmissionGate, evaluateProposalGate } from "./gate.mjs";
import {
  ACCEPTANCE_KIND,
  JOURNEY_OUTCOME,
  deriveJourneyOutcome,
  requesterDecisionIsValid,
} from "./outcome.mjs";
import { preflightExchangePackageSync } from "../../acquisition.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(join(__dirname, rel)).href);

const ex01 = await load("../../01/src/index.mjs");
const ex02 = await load("../../02/src/index.mjs");
const ex03 = await load("../../03/src/index.mjs");
const ex04 = await load("../../04/src/index.mjs");
const ex05 = await load("../../05/src/index.mjs");
const ex06 = await load("../../06/src/index.mjs");
const ex07 = await load("../../07/src/index.mjs");

function artifactSha256(artifact) {
  return createHash("sha256").update(JSON.stringify(artifact ?? null)).digest("hex");
}

function encodedByteLength(artifact) {
  return Buffer.byteLength(JSON.stringify(artifact ?? {}), "utf8");
}

function fileSubmissionForArtifact(artifact, path = "artifact.json") {
  return { files: [{ path, byteLength: encodedByteLength(artifact), format: "json" }] };
}

function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

function canonicalSubmissionPath(path) {
  if (typeof path !== "string") return null;
  const info = ex04.analyzePath(path);
  return info.ok ? info.normalized : null;
}

function isJsonArtifactPath(path, fileCount, format) {
  const normalized = canonicalSubmissionPath(path);
  if (normalized === "artifact.json" || (typeof normalized === "string" && normalized.endsWith("/artifact.json"))) {
    return true;
  }
  return fileCount === 1 && (format === "json" || format == null);
}

/** Caller byteLength cannot under-report actual JSON bytes. Paths are matched after normalize. */
function coerceSubmissionBytes(submission, artifact) {
  if (!submission || !Array.isArray(submission.files) || artifact === undefined) return submission;
  const encoded = encodedByteLength(artifact);
  return {
    ...submission,
    files: submission.files.map((f) => {
      if (isJsonArtifactPath(f.path, submission.files.length, f.format)) {
        return { ...f, byteLength: Math.max(Number(f.byteLength) || 0, encoded), encodedByteLength: encoded };
      }
      return f;
    }),
  };
}

function projectCorrection(correction) {
  if (!correction) return null;
  return {
    status: correction.status,
    amendCount: correction.amendItems?.length ?? 0,
    restartTask: correction.restartTask === true,
    checkProvenance: correction.checkProvenance ?? null,
    items: (correction.amendItems || []).slice(0, 32).map((item) => ({
      criterionId: item.criterionId,
      targetPath: item.targetPath ?? null,
      instruction: item.instruction ?? null,
    })),
    unresolvedSubjectiveIds: (correction.subjectiveUnresolved || [])
      .map((entry) => entry.criterionId)
      .slice(0, 32),
  };
}

function projectAdmission(admission) {
  if (!admission) return null;
  return {
    status: admission.status,
    issues: (admission.issues || []).slice(0, 32).map((issue) => ({
      kind: issue.kind,
      path: issue.path ?? null,
      byteLength: issue.byteLength ?? null,
      maxBytesPerFile: issue.maxBytesPerFile ?? null,
      totalBytes: issue.totalBytes ?? null,
      maxTotalBytes: issue.maxTotalBytes ?? null,
      format: issue.format ?? null,
    })),
    summary: admission.summary
      ? {
          missingFileCount: admission.summary.missingFileCount,
          issueCount: admission.summary.issueCount,
          totalAcceptedBytes: admission.summary.totalAcceptedBytes,
        }
      : null,
  };
}

function projectChecks({ correction, agreement, brief }) {
  const failedFromCorrection = (correction?.amendItems || []).map((item) => ({
    id: item.criterionId,
    targetPath: item.targetPath ?? null,
    detail: item.instruction ?? null,
  }));
  const failedFromSummary = (agreement?.deliverable?.checkSummary?.failed || []).map((item) => ({
    id: item.id,
    targetPath: item.targetPath ?? null,
    detail: item.detail ?? null,
  }));
  const failed = (failedFromCorrection.length ? failedFromCorrection : failedFromSummary).slice(0, 32);
  const unresolvedFromCorrection = (correction?.subjectiveUnresolved || []).map((entry) => entry.criterionId);
  const unresolved =
    unresolvedFromCorrection.length > 0
      ? unresolvedFromCorrection
      : agreement?.boundBrief?.unresolvedSubjective || brief?.unresolvedSubjective || [];
  const layer =
    agreement?.deliverable?.objectiveLayer ??
    (agreement?.deliverable?.objectiveComplete === true
      ? "complete"
      : agreement?.deliverable
        ? "incomplete"
        : null);
  return {
    objective: {
      layer,
      complete: agreement?.deliverable?.objectiveComplete === true,
      failed,
    },
    subjective: {
      unresolvedIds: unresolved.slice(0, 32),
    },
  };
}

function lifecycleCompatible(lifecycle, { taskId, proposalId }) {
  if (!lifecycle || lifecycle.status !== "completed") return false;
  if (lifecycle.taskId != null && taskId != null && lifecycle.taskId !== taskId) return false;
  if (lifecycle.boundProposalId != null && proposalId != null && lifecycle.boundProposalId !== proposalId) return false;
  const applied = (lifecycle.results || []).some(
    (r) => r.applied === true && r.proposalId === proposalId && r.disposition === "accepted",
  );
  return applied === true;
}

/**
 * Integrated requester→delivery journey (S151 amend / S152 gates).
 * Admission + objective checks gate lifecycle completion — no fabricated completed.
 */
export function runRequesterDeliveryJourney(input, { clock = () => Date.now(), skipAcquisitionPreflight = false } = {}) {
  const t0 = clock();
  const steps = [];
  if (!skipAcquisitionPreflight) {
    const acq = preflightExchangePackageSync();
    steps.push({ step: "package_acquisition", decision: acq.decision, reason: acq.reason, missing: acq.missing });
    if (!acq.continueJourney) {
      return {
        schema: SCHEMA,
        thin: true,
        integrated: true,
        gated: true,
        ok: false,
        outcome: JOURNEY_OUTCOME.STOPPED,
        outcomeReason: acq.reason,
        acceptanceKind: ACCEPTANCE_KIND.NONE,
        selectedProposalId: input?.chosenProposalId ?? null,
        proposalId: null,
        gate: { decision: GATE_DECISION.STOP, reason: acq.reason },
        acquisition: acq,
        checks: null,
        correction: null,
        admission: null,
        steps: [...steps, { step: JOURNEY_STEP.DONE, gated: true }],
        consumerInstructions: consumerDocs(),
      };
    }
  }

  if (!requesterDecisionIsValid(input.requesterDecision)) {
    return stopped({
      brief: null,
      comparison: null,
      steps,
      reason: "malformed_requester_decision",
      extra: { selectedProposalId: input.chosenProposalId ?? null, proposalId: null },
    });
  }

  const allowPartialAdmission = input.allowPartialAdmission === true;
  const allowWeakProposal = input.allowWeakProposal === true;

  const brief = ex01.buildAcceptanceBrief(input.requirements, { clock });
  steps.push({ step: JOURNEY_STEP.BRIEF, status: brief.status, objectiveChecks: brief.objectiveChecks.length });

  const comparison = ex02.compareProposalsToBrief(brief, input.proposals, { clock });
  steps.push({
    step: JOURNEY_STEP.COMPARE,
    proposalCount: comparison.proposalCount,
    ranking: comparison.ranking,
    statuses: comparison.comparisons.map((c) => ({ id: c.proposalId, status: c.status })),
  });

  const chosen = input.chosenProposalId
    ? input.proposals.find((p) => p.id === input.chosenProposalId)
    : input.proposals.find((p) => comparison.comparisons.find((c) => c.proposalId === p.id && c.status === "meets"))
      || input.proposals[0];
  if (!chosen) {
    return stopped({
      brief,
      comparison,
      steps,
      reason: "no_proposal",
      extra: { selectedProposalId: input.chosenProposalId ?? null, proposalId: null },
    });
  }

  const proposalGate = evaluateProposalGate(comparison, chosen.id, { allowWeakProposal });
  steps.push({ step: "proposal_gate", ...proposalGate });
  if (!proposalGate.continueJourney) {
    return stopped({
      brief,
      comparison,
      steps,
      reason: proposalGate.reason,
      proposalGate,
      extra: { selectedProposalId: chosen.id, proposalId: null },
    });
  }

  const effectiveContract = ex04.effectiveAdmissionContract(brief, input.fileSetContract);
  if (!effectiveContract.ok) {
    steps.push({ step: "file_contract_gate", ...effectiveContract.gate });
    return stopped({
      brief,
      comparison,
      steps,
      reason: effectiveContract.gate.reason,
      proposalGate: effectiveContract.gate,
      extra: { selectedProposalId: chosen.id, proposalId: null },
    });
  }

  const workingBrief = effectiveContract.boundIntoBrief
    ? {
        ...brief,
        bounds: {
          ...(brief.bounds || {}),
          fileSetContract: effectiveContract.contract,
        },
      }
    : brief;

  let agreement = ex03.createWorkAgreement({ brief: workingBrief, proposal: chosen }, { clock });
  steps.push({ step: JOURNEY_STEP.AGREE, status: agreement.status, revision: agreement.boundRevision.sha256 });

  const initialSubmission = coerceSubmissionBytes(
    input.fileSubmission || fileSubmissionForArtifact(input.artifact),
    input.artifact,
  );
  let admission = ex04.admitArtifactSubmission(
    effectiveContract.contract,
    initialSubmission,
    { clock },
  );
  steps.push({
    step: JOURNEY_STEP.ADMIT,
    status: admission.status,
    missing: admission.summary.missingFileCount,
    unsafe: admission.summary.unsafePathCount,
    unsupported: admission.summary.unsupportedFormatCount,
    unexpected: admission.summary.unexpectedFileCount ?? 0,
  });

  const admissionGate = evaluateAdmissionGate(admission, { allowPartial: allowPartialAdmission });
  steps.push({ step: "admission_gate", ...admissionGate });
  if (!admissionGate.attachDeliverable) {
    let dispute = null;
    if (input.includeDispute === true) {
      dispute = ex07.assembleDisputePacket({
        brief,
        proposal: chosen,
        artifact: input.artifact ?? null,
        agreement,
        requesterStatement: input.requesterStatement || "Admission gate stopped delivery.",
        workerStatement: input.workerStatement || "Awaiting admissible file set.",
        sources: input.sources || [{ id: "journey-gate", label: "r2-exchange-08", uri: "local:exchange/08" }],
      }, { clock });
      steps.push({
        step: JOURNEY_STEP.DISPUTE,
        status: dispute.status,
        declaresWinner: dispute.adjudicationPolicy.declaresWinner,
      });
    }
    steps.push({ step: JOURNEY_STEP.DONE, gated: true });
    return {
      schema: SCHEMA,
      thin: true,
      integrated: true,
      gated: true,
      gate: admissionGate,
      outcome: JOURNEY_OUTCOME.STOPPED,
      outcomeReason: admissionGate.reason,
      acceptanceKind: ACCEPTANCE_KIND.NONE,
      taskId: brief.taskId,
      selectedProposalId: chosen.id,
      proposalId: chosen.id,
      composedModules: ["01", "02", "03", "04", "05", "06", "07"],
      existingTaskKitNote:
        "Compose-only journey. public/downloads/agent-task-kit remains untouched. Gate mirrors acquisition verify-before-continue.",
      steps,
      brief: { status: brief.status },
      comparison: { ranking: comparison.ranking, order: comparison.order },
      agreement: { status: agreement.status, objectiveComplete: null },
      admission: projectAdmission(admission),
      checks: projectChecks({ correction: null, agreement, brief }),
      correction: null,
      lifecycle: null,
      dispute: dispute
        ? { status: dispute.status, automaticDecision: dispute.adjudicationPolicy.automaticDecision }
        : null,
      ok: false,
      consumerInstructions: consumerDocs(),
    };
  }

  let workingArtifact = input.artifact;
  agreement = ex03.attachDeliverable(agreement, workingArtifact, { clock });
  steps.push({
    step: JOURNEY_STEP.DELIVER,
    status: agreement.status,
    objectiveComplete: agreement.deliverable?.objectiveComplete ?? null,
    artifactSha256: artifactSha256(workingArtifact),
  });

  let correction = null;
  const deliverableLayer = agreement.deliverable?.objectiveLayer ?? null;
  if (
    agreement.deliverable &&
    agreement.deliverable.objectiveComplete === false &&
    deliverableLayer !== "not_applicable"
  ) {
    correction = ex05.buildCorrectionRequest(
      { brief: agreement.boundBrief, artifact: workingArtifact },
      { clock },
    );
    steps.push({
      step: JOURNEY_STEP.CORRECT,
      status: correction.status,
      amendCount: correction.amendItems.length,
      retained: correction.acceptedParts.length,
      restartTask: correction.restartTask,
      checkProvenance: correction.checkProvenance,
    });

    if (hasOwn(input, "correctedArtifact")) {
      // Re-admit actual corrected bytes before re-attach (F1). Presence, not truthiness.
      const correctedSubmission = coerceSubmissionBytes(
        input.correctedFileSubmission || fileSubmissionForArtifact(input.correctedArtifact),
        input.correctedArtifact,
      );
      const readmit = ex04.admitArtifactSubmission(
        effectiveContract.contract,
        correctedSubmission,
        { clock },
      );
      steps.push({
        step: "readmit",
        status: readmit.status,
        byteLength: correctedSubmission.files?.[0]?.byteLength ?? null,
      });
      const readmitGate = evaluateAdmissionGate(readmit, { allowPartial: allowPartialAdmission });
      steps.push({ step: "readmit_gate", ...readmitGate });
      if (!readmitGate.attachDeliverable) {
        steps.push({ step: JOURNEY_STEP.DONE, gated: true, reason: "corrected_admission_blocked" });
        return {
          schema: SCHEMA,
          thin: true,
          integrated: true,
          gated: true,
          ok: false,
          outcome: JOURNEY_OUTCOME.STOPPED,
          outcomeReason: readmitGate.reason,
          acceptanceKind: ACCEPTANCE_KIND.NONE,
          gate: readmitGate,
          taskId: brief.taskId,
          selectedProposalId: chosen.id,
          proposalId: chosen.id,
          composedModules: ["01", "02", "03", "04", "05", "06", "07"],
          steps,
          brief: { status: brief.status },
          comparison: { ranking: comparison.ranking, order: comparison.order },
          agreement: { status: agreement.status, objectiveComplete: agreement.deliverable?.objectiveComplete ?? null },
          admission: projectAdmission(readmit),
          checks: projectChecks({ correction, agreement, brief }),
          correction: projectCorrection(correction),
          lifecycle: null,
          dispute: null,
          consumerInstructions: consumerDocs(),
        };
      }
      admission = readmit;
      workingArtifact = input.correctedArtifact;
      const recheck = ex05.recheckAfterAmend(agreement.boundBrief, workingArtifact, { clock });
      correction = recheck.request;
      agreement = ex03.attachDeliverable(
        { ...agreement, status: "bound", deliverable: null },
        workingArtifact,
        { clock },
      );
      steps.push({
        step: JOURNEY_STEP.CORRECT,
        status: correction.status,
        phase: "after_amend",
        objectiveComplete: agreement.deliverable?.objectiveComplete ?? null,
        artifactSha256: artifactSha256(workingArtifact),
        checkProvenance: correction.checkProvenance,
      });
    }
  } else if (deliverableLayer === "not_applicable") {
    steps.push({ step: JOURNEY_STEP.CORRECT, status: "skipped_objective_not_applicable" });
  } else {
    steps.push({ step: JOURNEY_STEP.CORRECT, status: "skipped_objective_complete" });
  }

  const boundArtifactSha = artifactSha256(workingArtifact);
  const boundRevisionSha = agreement.boundRevision.sha256;
  const subjectiveCount = (agreement.boundBrief.subjectiveCriteria || []).length;
  const objectiveComplete = agreement.deliverable?.objectiveComplete === true;
  const objectiveLayer =
    agreement.deliverable?.objectiveLayer ?? (objectiveComplete === true ? "complete" : "incomplete");

  const derived = deriveJourneyOutcome({
    objectiveComplete,
    objectiveLayer,
    subjectiveUnresolvedCount: subjectiveCount,
    requesterDecision: input.requesterDecision || null,
    boundArtifactSha256: boundArtifactSha,
    boundRevisionSha256: boundRevisionSha,
  });
  steps.push({
    step: "outcome_gate",
    outcome: derived.outcome,
    reason: derived.reason,
    acceptanceKind: derived.acceptanceKind,
    lifecycleMayComplete: derived.lifecycleMayComplete,
    artifactSha256: boundArtifactSha,
    revisionSha256: boundRevisionSha,
  });

  // Lifecycle: completing result only when outcome allows AND admission fully admitted.
  const fullyAdmitted = admission.status === "admitted";
  const baseEvents = input.lifecycleEvents || [
    { type: "task_opened", at: new Date(t0).toISOString(), taskId: brief.taskId },
    { type: "proposal_submitted", at: new Date(t0 + 1000).toISOString(), proposalId: chosen.id },
    { type: "agreement_bound", at: new Date(t0 + 2000).toISOString(), proposalId: chosen.id },
  ];
  const events = [...baseEvents];
  if (derived.lifecycleMayComplete && fullyAdmitted && !input.lifecycleEvents) {
    events.push({
      type: "result_submitted",
      at: new Date(t0 + 3000).toISOString(),
      proposalId: chosen.id,
      resultId: "journey-res-1",
    });
  }

  const lifecycle = ex06.reduceLifecycle(events);
  const compatible = lifecycleCompatible(lifecycle, { taskId: brief.taskId, proposalId: chosen.id });
  steps.push({
    step: JOURNEY_STEP.LIFECYCLE,
    status: lifecycle.status,
    paymentActions: lifecycle.paymentActions,
    completedOnlyIfAllowed: derived.lifecycleMayComplete,
    compatibleCompletion: compatible,
  });

  if (!derived.lifecycleMayComplete && lifecycle.status === "completed") {
    throw new Error("invariant: lifecycle completed despite outcome gate forbidding it");
  }

  let dispute = null;
  if (
    input.includeDispute === true ||
    (correction && correction.status === "amend_requested" && !hasOwn(input, "correctedArtifact"))
  ) {
    dispute = ex07.assembleDisputePacket({
      brief,
      proposal: chosen,
      artifact: workingArtifact,
      agreement,
      requesterStatement: input.requesterStatement || "Objective checks failed; please amend.",
      workerStatement: input.workerStatement || "Working from supplied artifact.",
      sources: input.sources || [{ id: "journey", label: "r2-exchange-08", uri: "local:exchange/08" }],
    }, { clock });
    steps.push({
      step: JOURNEY_STEP.DISPUTE,
      status: dispute.status,
      declaresWinner: dispute.adjudicationPolicy.declaresWinner,
      disagreements: dispute.disagreements.length,
    });
  } else {
    steps.push({ step: JOURNEY_STEP.DISPUTE, status: "skipped" });
  }

  steps.push({ step: JOURNEY_STEP.DONE, gated: false, outcome: derived.outcome });

  // ok requires actual compatible completed lifecycle — not merely lifecycleMayComplete.
  const ok =
    derived.outcome === JOURNEY_OUTCOME.ACCEPTED &&
    fullyAdmitted &&
    lifecycle.paymentActions.length === 0 &&
    compatible === true;

  return {
    schema: SCHEMA,
    thin: true,
    integrated: true,
    gated: false,
    gate: admissionGate,
    outcome: derived.outcome,
    outcomeReason: derived.reason,
    acceptanceKind: derived.acceptanceKind,
    ok,
    taskId: brief.taskId,
    selectedProposalId: chosen.id,
    proposalId: chosen.id,
    boundArtifactSha256: boundArtifactSha,
    boundRevisionSha256: boundRevisionSha,
    lifecycleCompatible: compatible,
    composedModules: ["01", "02", "03", "04", "05", "06", "07"],
    existingTaskKitNote:
      "Compose-only journey. public/downloads/agent-task-kit remains untouched. Gate mirrors acquisition verify-before-continue.",
    steps,
    brief: { status: brief.status, revisionHint: ex03.briefRevisionFingerprint(brief).sha256 },
    comparison: { ranking: comparison.ranking, order: comparison.order },
    agreement: { status: agreement.status, objectiveComplete: agreement.deliverable?.objectiveComplete ?? null },
    admission: projectAdmission(admission),
    checks: projectChecks({ correction, agreement, brief }),
    correction: projectCorrection(correction),
    lifecycle: { status: lifecycle.status, paymentActions: lifecycle.paymentActions },
    dispute: dispute
      ? { status: dispute.status, automaticDecision: dispute.adjudicationPolicy.automaticDecision }
      : null,
    requesterDecision: input.requesterDecision || null,
    consumerInstructions: consumerDocs(),
  };
}

function stopped({ brief, comparison, steps, reason, proposalGate = null, extra = {} }) {
  steps.push({ step: JOURNEY_STEP.DONE, gated: true, reason });
  return {
    schema: SCHEMA,
    thin: true,
    integrated: true,
    gated: true,
    ok: false,
    outcome: JOURNEY_OUTCOME.STOPPED,
    outcomeReason: reason,
    acceptanceKind: ACCEPTANCE_KIND.NONE,
    gate: proposalGate || { decision: GATE_DECISION.STOP, reason },
    taskId: brief?.taskId ?? null,
    selectedProposalId: extra.selectedProposalId ?? null,
    proposalId: extra.proposalId ?? null,
    composedModules: ["01", "02", "03", "04", "05", "06", "07"],
    steps,
    brief: brief ? { status: brief.status } : null,
    comparison: comparison ? { ranking: comparison.ranking, order: comparison.order } : null,
    agreement: null,
    admission: extra.admission ?? null,
    checks: extra.checks ?? projectChecks({ correction: null, agreement: null, brief }),
    correction: extra.correction ?? null,
    lifecycle: null,
    dispute: null,
    consumerInstructions: consumerDocs(),
  };
}

function consumerDocs() {
  return [
    "1. Fresh user: npm run test:r2-exchange-08 && node experiments/scale-r2-20260910/exchange/08/src/cli.mjs demo",
    "2. Supplied input: node .../cli.mjs run path/to/input.json [--receipt out.json]",
    "3. Acquisition-style gates: proposal must meet (or allowWeakProposal); file admission must pass.",
    "4. Lifecycle completes only when outcome is accepted (checks + bound requester decision when subjective).",
    "5. CLI exits 0 only when ok:true; gated stops exit 2; needs_review/needs_amendment exit 1.",
    "6. Root owns merge/publish/paid. Review pin 17236cd stays on codex/r2-exchange-08-20260910.",
  ].join("\n");
}

export { ex01, ex02, ex03, ex04, ex05, ex06, ex07 };
export { evaluateAdmissionGate, evaluateProposalGate, GATE_DECISION } from "./gate.mjs";
export {
  JOURNEY_OUTCOME,
  ACCEPTANCE_KIND,
  OBJECTIVE_LAYER,
  deriveJourneyOutcome,
  requesterDecisionIsValid,
} from "./outcome.mjs";
