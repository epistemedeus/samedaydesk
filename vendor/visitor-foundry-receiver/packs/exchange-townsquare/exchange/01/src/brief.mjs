import {
  BRIEF_STATUS,
  CRITERION_CLASS,
  SCHEMA,
  SUBJECTIVE_STATUS,
} from "./constants.mjs";
import { ERROR_CODES } from "./constants.mjs";
import { validateTaskRequirements, briefError } from "./validate.mjs";

function stableId(taskId, suffix) {
  return `${taskId}:${suffix}`;
}

/**
 * Generate a bounded deliverable contract (acceptance brief) from task requirements.
 * Objective checks are runnable; subjective criteria stay explicitly unresolved.
 */
export function buildAcceptanceBrief(rawRequirements, { clock = () => Date.now() } = {}) {
  const requirements = validateTaskRequirements(rawRequirements);
  const generatedAt = new Date(clock()).toISOString();

  const objectiveChecks = requirements.objectiveCriteria.map((c) => ({
    id: c.id,
    description: c.description,
    class: CRITERION_CLASS.OBJECTIVE,
    machineCheckable: true,
    check: c.check,
  }));

  const subjectiveCriteria = requirements.subjectiveCriteria.map((c) => ({
    id: c.id,
    description: c.description,
    class: CRITERION_CLASS.SUBJECTIVE,
    machineCheckable: false,
    status: SUBJECTIVE_STATUS.UNRESOLVED,
    reviewHint: c.reviewHint,
  }));

  // Auto-derive objective field-existence checks from artifact.requiredFields when
  // the caller did not already supply an identical json_path_exists check.
  const existingExists = new Set(
    objectiveChecks
      .filter((c) => c.check.kind === "json_path_exists")
      .map((c) => c.check.path),
  );
  const requiredFields = requirements.artifact.requiredFields || [];
  for (const field of requiredFields) {
    if (existingExists.has(field)) continue;
    objectiveChecks.push({
      id: stableId(requirements.taskId, `field_${field.replace(/[^a-zA-Z0-9_.]/g, "_")}`),
      description: `Artifact must include field ${field}`,
      class: CRITERION_CLASS.OBJECTIVE,
      machineCheckable: true,
      check: { kind: "json_path_exists", path: field },
      derivedFrom: "artifact.requiredFields",
    });
  }

  if (requirements.artifact.format === "json" || requirements.artifact.format == null) {
    // default: JSON deliverable; no extra claim
  }

  const missingForReady = [];
  if (objectiveChecks.length === 0) {
    missingForReady.push("no_objective_checks");
  }

  let status = BRIEF_STATUS.READY;
  if (missingForReady.length > 0 && subjectiveCriteria.length > 0) {
    status = BRIEF_STATUS.PARTIAL_INPUT;
  } else if (missingForReady.length > 0) {
    status = BRIEF_STATUS.REJECTED;
  }

  if (status === BRIEF_STATUS.REJECTED) {
    throw briefError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "cannot build ready brief without at least one objective check",
      { missingForReady },
    );
  }

  const deliverableContract = {
    format: requirements.artifact.format || "json",
    maxBytes: requirements.artifact.maxBytes ?? null,
    requiredFields,
    objectiveCheckCount: objectiveChecks.length,
    subjectiveUnresolvedCount: subjectiveCriteria.length,
    statement: composeContractStatement(requirements, objectiveChecks, subjectiveCriteria),
  };

  return {
    schema: SCHEMA,
    generatedAt,
    status,
    taskId: requirements.taskId,
    title: requirements.title,
    summary: requirements.summary,
    demo: requirements.demo === true,
    sourceLabel: requirements.sourceLabel,
    deliverableContract,
    objectiveChecks,
    subjectiveCriteria,
    unresolvedSubjective: subjectiveCriteria.map((c) => c.id),
    bounds: requirements.bounds,
    mutationBoundary:
      "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.",
    consumerInstructions: buildConsumerInstructions(requirements, deliverableContract),
  };
}

function composeContractStatement(requirements, objectiveChecks, subjectiveCriteria) {
  const parts = [
    `Deliver a ${requirements.artifact.format || "json"} artifact for task ${requirements.taskId}.`,
    `Satisfy ${objectiveChecks.length} objective check(s) that this runner can execute.`,
  ];
  if (subjectiveCriteria.length > 0) {
    parts.push(
      `Leave ${subjectiveCriteria.length} subjective criterion(a) explicitly unresolved for human review: ${subjectiveCriteria
        .map((c) => c.id)
        .join(", ")}.`,
    );
  }
  parts.push("Do not invent buyers, revenue, ranking, escrow balances, or claim authority.");
  return parts.join(" ");
}

function buildConsumerInstructions(requirements, deliverableContract) {
  return [
    "1. Read the acceptance brief JSON (schema neomorphic.r2.exchange.acceptance_brief.v1).",
    `2. Produce a ${deliverableContract.format} artifact matching requiredFields: [${deliverableContract.requiredFields.join(", ")}].`,
    "3. Run objective checks with the package runner (cli check) against your artifact.",
    "4. Treat every subjectiveCriteria entry as unresolved until a human marks it; do not auto-pass them.",
    `5. Task summary: ${requirements.summary}`,
  ].join("\n");
}
