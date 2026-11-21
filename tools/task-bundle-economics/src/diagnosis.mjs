import { evaluateCheck } from "./acceptance.mjs";
import {
  STRUCTURED_EXTRACT_CLASS,
} from "./artifact.mjs";
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

function echoCitedEvidence(citedEvidence, citationBinding) {
  if (!Array.isArray(citedEvidence)) return [];
  return citedEvidence.map((item, index) => {
    const echoed = echoObject(item, KNOWN_CITED_EVIDENCE_KEYS) ?? item;
    const bound = citationBinding?.items?.find((row) => row.index === index);
    if (bound) {
      return {
        ...echoed,
        bindingStatus: bound.status,
        bindingReason: bound.reason,
      };
    }
    return {
      ...echoed,
      bindingStatus: "declared",
    };
  });
}

function taskSpecClosure(task) {
  const criteria = Array.isArray(task.criteria) ? task.criteria : [];
  return {
    present: typeof task.taskId === "string" && task.taskId.length > 0,
    taskId: task.taskId,
    titlePresent: typeof task.title === "string" && task.title.length > 0,
    criteriaCount: criteria.length,
    criteria,
    objectiveCriteriaPresent: task.objectiveCriteria !== undefined,
  };
}

function requiredFieldsFor(task, acceptance, inspection) {
  const provenance = task.provenance;
  const provenanceCheck = evaluateCheck({
    check: "enum_in",
    expected: [...PROVENANCE_VALUES],
    observed: provenance,
  });
  const fields = [
    {
      field: "provenance",
      ...provenanceCheck,
    },
  ];

  if (inspection?.artifactInspection) {
    const loaded = inspection.loaded;
    const artifactPresent = loaded?.status === "loaded";
    fields.push({
      field: "artifact",
      check: "present",
      decided: true,
      ok: artifactPresent,
      reason: artifactPresent ? undefined : (loaded?.reason || "artifact_missing"),
      artifactClass: STRUCTURED_EXTRACT_CLASS,
    });
    const citationCoverage = inspection.citationBinding?.coverage;
    fields.push({
      field: "citedEvidence",
      check: "present",
      decided: true,
      ok: citationCoverage === "bound",
      reason: citationCoverage === "bound"
        ? undefined
        : (citationCoverage === "unbound" ? "cited_evidence_unbound" : "cited_evidence_missing"),
    });
  } else {
    const cited = task.delivery?.citedEvidence;
    const citedOk = Array.isArray(cited) && cited.length > 0;
    fields.push({
      field: "citedEvidence",
      check: "present",
      decided: true,
      ok: citedOk,
      reason: citedOk ? undefined : "cited_evidence_missing",
    });
  }

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

function requesterExceptionFor(acceptance, inputClosure, gateReasons) {
  const needed = acceptance?.outcome === "needs_reviewer_exception" || (gateReasons && gateReasons.length > 0);
  if (!needed) {
    return { needed: false };
  }
  const undecided = (acceptance.checks || []).filter((check) => !check.decided);
  const undecidedPredicates = undecided.map((check) => check.criterion || check.check || check.reason);
  return {
    needed: true,
    reasons: [...new Set([...(acceptance?.reasons || []), ...(gateReasons || [])])],
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

function gateEvidenceOutcome(mapped, requiredFields, inspection) {
  const gateReasons = [];
  for (const field of requiredFields) {
    if (field.field === "provenance" && (!field.decided || !field.ok)) {
      gateReasons.push("provenance_required_failed");
    }
    if (field.field === "citedEvidence" && (!field.decided || !field.ok)) {
      gateReasons.push(field.reason || "cited_evidence_missing");
    }
    if (field.field === "artifact" && (!field.decided || !field.ok)) {
      gateReasons.push(field.reason || "artifact_missing");
    }
  }
  if (inspection?.mode === "ambiguous") {
    gateReasons.push("artifact_source_ambiguous");
  }
  if (inspection?.mode === "artifact_inspection" && inspection.loaded?.status !== "loaded") {
    gateReasons.push(inspection.loaded?.reason || inspection.loaded?.status || "artifact_missing");
  }
  if (inspection?.reasons?.length) {
    for (const reason of inspection.reasons) gateReasons.push(reason);
  }

  const unique = [...new Set(gateReasons)];
  if (unique.length === 0) {
    return { evidenceOutcome: mapped, gateReasons: [] };
  }
  if (mapped === "refused") {
    return { evidenceOutcome: "refused", gateReasons: unique };
  }
  return { evidenceOutcome: "needs_review", gateReasons: unique };
}

function diagnoseTask(task, evaluationTask, inspection) {
  const acceptance = evaluationTask?.acceptance;
  const classified = classifyCostLines(task.costLines);
  const inputClosure = {
    taskSpec: taskSpecClosure(task),
    knownCosts: classified.knownCosts,
    unknownCosts: classified.unknownCosts,
  };
  const requiredFields = requiredFieldsFor(task, acceptance, inspection);
  const mapped = mapEvidenceOutcome(acceptance?.outcome);
  const gated = gateEvidenceOutcome(mapped, requiredFields, inspection);
  const evidenceBasis = inspection?.mode === "artifact_inspection"
    ? "artifact_inspection"
    : inspection?.mode === "ambiguous"
      ? "ambiguous"
      : "declared_evidence";

  return {
    taskId: task.taskId,
    reservationId: task.reservationId,
    termsDigest: task.termsDigest,
    artifactDigest: task.artifactDigest,
    rightsDigest: task.rightsDigest,
    expectedRevision: task.expectedRevision,
    publicationConsent: task.publicationConsent,
    provenance: task.provenance,
    evidenceBasis,
    artifactInspection: evidenceBasis === "artifact_inspection",
    supportedArtifactClass: STRUCTURED_EXTRACT_CLASS,
    artifactLoad: inspection?.loaded
      ? {
          status: inspection.loaded.status,
          reason: inspection.loaded.reason,
          source: inspection.loaded.source,
          artifactClass: inspection.loaded.artifactClass,
          schema: inspection.loaded.schema,
          fields: inspection.loaded.fields,
          artifactPath: inspection.loaded.artifactPath,
        }
      : undefined,
    citationBinding: inspection?.citationBinding,
    evidenceOutcome: gated.evidenceOutcome,
    acceptanceOutcome: acceptance?.outcome,
    gateReasons: gated.gateReasons,
    requiredFields,
    citedEvidence: echoCitedEvidence(task.delivery?.citedEvidence, inspection?.citationBinding),
    acquisition: echoObject(task.delivery?.acquisition, KNOWN_ACQUISITION_KEYS),
    directRoute: echoObject(task.directRoute, KNOWN_DIRECT_ROUTE_KEYS),
    inputClosure,
    requesterException: requesterExceptionFor(acceptance, inputClosure, gated.gateReasons),
    economics: economicsSlice(evaluationTask?.economics),
  };
}

export function diagnosisReadout(evaluation, bundle, inspections = []) {
  if (!evaluation?.ok) return evaluation;
  const byTaskId = new Map((inspections || []).map((row) => [row.taskId, row]));
  const tasks = bundle.tasks.map((task, index) => (
    diagnoseTask(task, evaluation.tasks[index], byTaskId.get(task.taskId))
  ));
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
    supportedDeliveryArtifactClass: STRUCTURED_EXTRACT_CLASS,
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
