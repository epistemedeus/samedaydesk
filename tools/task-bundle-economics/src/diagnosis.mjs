import { evaluateCheck } from "./acceptance.mjs";
import {
  isAtomicString,
  KNOWN_ACQUISITION_KEYS,
  KNOWN_CITED_EVIDENCE_KEYS,
  KNOWN_DIRECT_ROUTE_KEYS,
  preserveUnknown,
  PROVENANCE_VALUES,
} from "./schema.mjs";

export const DIAGNOSIS_SCHEMA = "pilot.task-bundle-economics.diagnosis.v1";
export const DIAGNOSIS_ARTIFACT_CLASS = "bounded_structured_diagnosis";

export const EVIDENCE_OUTCOME_BY_ACCEPTANCE = Object.freeze({
  objective_acceptance_met: "meets_criteria",
  objective_not_met: "refused",
  needs_reviewer_exception: "needs_review",
});

export function mapEvidenceOutcome(acceptanceOutcome) {
  return EVIDENCE_OUTCOME_BY_ACCEPTANCE[acceptanceOutcome] ?? "needs_review";
}

function classifyCostLine(line) {
  if (!line || typeof line !== "object" || Array.isArray(line)) {
    return { kind: undefined, status: "unknown" };
  }
  const kind = typeof line.kind === "string" ? line.kind : undefined;
  if (line.status === "measured" && isAtomicString(line.atomic)) {
    return { kind, status: "measured", atomic: line.atomic };
  }
  return { kind, status: "unknown" };
}

function classifyCostLines(costLines) {
  const knownCosts = [];
  const unknownCosts = [];
  if (!Array.isArray(costLines)) {
    return { declared: false, knownCosts, unknownCosts };
  }
  for (const line of costLines) {
    const classified = classifyCostLine(line);
    if (classified.status === "measured") knownCosts.push(classified);
    else unknownCosts.push({ kind: classified.kind, status: "unknown" });
  }
  return { declared: true, knownCosts, unknownCosts };
}

function echoObject(value, knownKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const echoed = {};
  for (const key of knownKeys) {
    if (value[key] !== undefined) echoed[key] = value[key];
  }
  Object.assign(echoed, preserveUnknown(value, knownKeys));
  return echoed;
}

function echoCitedEvidence(citedEvidence) {
  if (!Array.isArray(citedEvidence)) return [];
  return citedEvidence.map((item) => echoObject(item, KNOWN_CITED_EVIDENCE_KEYS) ?? item);
}

function taskSpecClosure(task) {
  const criteria = Array.isArray(task.criteria) ? task.criteria : [];
  return {
    present: typeof task.taskId === "string" && task.taskId.length > 0,
    taskId: task.taskId,
    titlePresent: typeof task.title === "string" && task.title.length > 0,
    criteriaCount: criteria.length,
    criteria,
  };
}

function requiredFieldsFor(task, acceptance) {
  const provenance = task.provenance;
  const fields = [
    {
      field: "provenance",
      ...evaluateCheck({
        check: "enum_in",
        expected: [...PROVENANCE_VALUES],
        observed: provenance,
      }),
    },
  ];
  const checks = Array.isArray(acceptance?.checks) ? acceptance.checks : [];
  for (const check of checks) {
    fields.push({
      field: check.criterion,
      check: check.check,
      decided: check.decided,
      ok: check.ok,
      reason: check.reason,
    });
  }
  return fields;
}

function requesterExceptionFor(acceptance, inputClosure) {
  if (acceptance?.outcome !== "needs_reviewer_exception") {
    return { needed: false };
  }
  const undecided = (acceptance.checks || []).filter((check) => !check.decided);
  const undecidedPredicates = undecided.map((check) => check.criterion || check.check || check.reason);
  return {
    needed: true,
    reasons: acceptance.reasons,
    undecidedPredicates,
    reviewerMustDecide: undecidedPredicates,
    unknownCosts: inputClosure.unknownCosts,
  };
}

function economicsSlice(economics) {
  if (!economics) return { feeReadout: "absent" };
  return {
    feeReadout: economics.feeReadout,
    reservationId: economics.reservationId,
    feeBps: economics.feeBps,
    feeBasis: economics.feeBasis,
    roundingProfile: economics.roundingProfile,
    grossAtomic: economics.grossAtomic,
    platformFeeAtomic: economics.platformFeeAtomic,
    contributorNetAtomic: economics.contributorNetAtomic,
    thisQuoteFeeIsExactFivePercent: economics.thisQuoteFeeIsExactFivePercent,
  };
}

function diagnoseTask(task, evaluationTask) {
  const acceptance = evaluationTask?.acceptance;
  const classified = classifyCostLines(task.costLines);
  const inputClosure = {
    taskSpec: taskSpecClosure(task),
    knownCosts: classified.knownCosts,
    unknownCosts: classified.unknownCosts,
  };
  return {
    taskId: task.taskId,
    reservationId: task.reservationId,
    termsDigest: task.termsDigest,
    artifactDigest: task.artifactDigest,
    rightsDigest: task.rightsDigest,
    expectedRevision: task.expectedRevision,
    publicationConsent: task.publicationConsent,
    provenance: task.provenance,
    evidenceOutcome: mapEvidenceOutcome(acceptance?.outcome),
    acceptanceOutcome: acceptance?.outcome,
    requiredFields: requiredFieldsFor(task, acceptance),
    citedEvidence: echoCitedEvidence(task.delivery?.citedEvidence),
    acquisition: echoObject(task.delivery?.acquisition, KNOWN_ACQUISITION_KEYS),
    directRoute: echoObject(task.directRoute, KNOWN_DIRECT_ROUTE_KEYS),
    inputClosure,
    requesterException: requesterExceptionFor(acceptance, inputClosure),
    economics: economicsSlice(evaluationTask?.economics),
  };
}

export function diagnosisReadout(evaluation, bundle) {
  if (!evaluation?.ok) return evaluation;
  const tasks = bundle.tasks.map((task, index) => diagnoseTask(task, evaluation.tasks[index]));
  const exceptionRows = tasks.filter((task) => task.requesterException.needed);
  const knownCosts = [];
  const unknownCosts = [];
  const bundleLines = classifyCostLines(bundle.costLines);
  for (const line of bundleLines.knownCosts) knownCosts.push(line);
  for (const line of bundleLines.unknownCosts) unknownCosts.push(line);
  for (const task of tasks) {
    for (const line of task.inputClosure.knownCosts) {
      knownCosts.push({ ...line, taskId: task.taskId });
    }
    for (const line of task.inputClosure.unknownCosts) {
      unknownCosts.push({ ...line, taskId: task.taskId });
    }
  }

  return {
    ok: true,
    schema: DIAGNOSIS_SCHEMA,
    artifactClass: DIAGNOSIS_ARTIFACT_CLASS,
    evidenceOnly: true,
    acceptance: "not_decided_by_tool",
    autoAccept: false,
    signer: false,
    paymentCommand: false,
    fundedCommission: false,
    verifierExecuted: false,
    rails: evaluation.rails,
    bundleId: evaluation.bundleId,
    requesterNote: evaluation.requesterNote,
    provenance: bundle.provenance,
    tasks,
    inputClosure: {
      knownCosts,
      unknownCosts,
    },
    requesterException: {
      needed: exceptionRows.length > 0,
      taskIds: exceptionRows.map((task) => task.taskId),
      tasks: exceptionRows.map((task) => ({
        taskId: task.taskId,
        reasons: task.requesterException.reasons,
        undecidedPredicates: task.requesterException.undecidedPredicates,
        reviewerMustDecide: task.requesterException.reviewerMustDecide,
        unknownCosts: task.requesterException.unknownCosts,
      })),
    },
    bundledEconomics: economicsSlice(evaluation.bundledEconomics),
    preservedUnknown: evaluation.preservedUnknown,
    bounds: evaluation.bounds,
  };
}
