/**
 * buildTaskRequirementsEnvelope — normalize job requirements into
 * requiredInputs / outputConstraints / acceptableEvidence.
 */
import {
  CHECK_KIND,
  ENVELOPE_SCHEMA,
  ENVELOPE_STATUS,
  ERROR_CODES,
  REQUIREMENTS_REF,
} from "./constants.mjs";
import {
  envelopeError,
  isPlainObject,
  tryValidateTaskRequirements,
  validateCapabilityContract,
  validateTaskRequirements,
} from "./validate.mjs";

/**
 * Accept either:
 *   A) plain Exchange-shaped task requirements JSON, or
 *   B) { requirements, capabilityContract?, providedInputs? }
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, "envelope input must be an object");
  }
  if (isPlainObject(raw.requirements)) {
    return {
      requirements: raw.requirements,
      capabilityContract: raw.capabilityContract ?? null,
      providedInputs: isPlainObject(raw.providedInputs) ? raw.providedInputs : {},
      wrapped: true,
    };
  }
  // Plain requirements: has taskId or schema of requirements family
  if (raw.taskId != null || raw.objectiveCriteria != null || raw.criteria != null || raw.subjectiveCriteria != null) {
    return {
      requirements: raw,
      capabilityContract: null,
      providedInputs: {},
      wrapped: false,
    };
  }
  throw envelopeError(
    ERROR_CODES.INVALID_INPUT,
    "input must be task requirements or { requirements, capabilityContract? }",
  );
}

function deriveRequiredInputsFromRequirements(requirements) {
  const inputs = [
    {
      id: "task_requirements",
      name: "Task requirements document",
      kind: "task_requirements",
      required: true,
      source: "caller",
      notes: "Exchange-shaped neomorphic.r2.exchange.task_requirements.v1 (or capabilities alias)",
    },
  ];
  if (requirements.sourceLabel == null) {
    // not required; do not invent
  } else {
    inputs.push({
      id: "sourceLabel",
      name: "Source label",
      kind: "string",
      required: false,
      source: "requirements",
      notes: "Present on supplied requirements",
    });
  }
  // Artifact deliverable is an output, not an input — callers still need any
  // external materials implied by https_url_shape paths that are not the artifact itself.
  const pathHints = new Set();
  for (const c of requirements.objectiveCriteria) {
    const path = c.check?.path;
    if (typeof path === "string" && path.trim()) {
      // These are artifact field constraints, not caller inputs — skip as requiredInputs.
      pathHints.add(path);
    }
  }
  void pathHints;
  return inputs;
}

function mergeCapabilityInputs(base, contract, providedInputs) {
  const requiredInputs = [...base];
  const missingInputs = [];
  if (!contract) return { requiredInputs, missingInputs };

  for (const input of contract.inputs) {
    requiredInputs.push({
      id: input.id,
      name: input.name,
      kind: input.kind,
      required: input.required,
      source: "capabilityContract",
      notes: input.notes,
    });
    if (input.required && !Object.prototype.hasOwnProperty.call(providedInputs, input.id)) {
      missingInputs.push({
        id: input.id,
        name: input.name,
        kind: input.kind,
        required: true,
        source: "capabilityContract",
        notes: input.notes || "Required by capabilityContract but not present in providedInputs",
      });
    }
  }
  return { requiredInputs, missingInputs };
}

function buildOutputConstraints(requirements) {
  const requiredFields = requirements.artifact.requiredFields || [];
  const objectiveChecks = requirements.objectiveCriteria.map((c) => ({
    id: c.id,
    description: c.description,
    check: c.check,
  }));

  // Derive exists checks for requiredFields not already covered (same as Exchange brief)
  const existingExists = new Set(
    objectiveChecks.filter((c) => c.check.kind === CHECK_KIND.JSON_PATH_EXISTS).map((c) => c.check.path),
  );
  for (const field of requiredFields) {
    if (existingExists.has(field)) continue;
    objectiveChecks.push({
      id: `${requirements.taskId}:field_${field.replace(/[^a-zA-Z0-9_.]/g, "_")}`,
      description: `Artifact must include field ${field}`,
      check: { kind: CHECK_KIND.JSON_PATH_EXISTS, path: field },
      derivedFrom: "artifact.requiredFields",
    });
  }

  return {
    format: requirements.artifact.format || "json",
    maxBytes: requirements.artifact.maxBytes ?? null,
    requiredFields,
    objectiveChecks,
  };
}

function buildAcceptableEvidence(requirements, contract) {
  const objective = requirements.objectiveCriteria.map((c) => ({
    id: c.id,
    checkKind: c.check.kind,
    description: c.description,
    path: c.check.path ?? null,
  }));
  const subjectiveUnresolved = requirements.subjectiveCriteria.map((c) => ({
    id: c.id,
    description: c.description,
    status: "unresolved",
    reviewHint: c.reviewHint,
  }));

  const notes = [];
  if (contract?.evidenceHints?.length) {
    for (const hint of contract.evidenceHints) {
      notes.push(hint.note || hint.id);
      if (hint.checkKind) {
        objective.push({
          id: `capability:${hint.id}`,
          checkKind: hint.checkKind,
          description: hint.note || `Capability evidence hint ${hint.id}`,
          path: null,
          from: "capabilityContract.evidenceHints",
        });
      }
    }
  }

  return {
    objective,
    subjectiveUnresolved,
    notes: notes.length ? notes.join("; ") : undefined,
  };
}

/**
 * Normalize supplied job requirements into a task-requirements envelope.
 * Never invents missing facts; lists them in missingInputs instead.
 */
export function buildTaskRequirementsEnvelope(rawInput, { clock = () => Date.now() } = {}) {
  const generatedAt = new Date(clock()).toISOString();
  const { requirements: rawReq, capabilityContract: rawContract, providedInputs } = unwrapInput(rawInput);

  let contract = null;
  try {
    contract = validateCapabilityContract(rawContract);
  } catch (err) {
    if (err.code === ERROR_CODES.FORBIDDEN_CLAIM) throw err;
    throw err;
  }

  // Hard-fail forbidden / unsupported via validate path
  let requirements = null;
  let missingFromRequirements = [];
  let validationError = null;

  try {
    // Probe forbidden/unsupported first by attempting full validate when we have enough shape
    const soft = tryValidateTaskRequirements(rawReq);
    if (soft.ok) {
      requirements = soft.requirements;
    } else {
      missingFromRequirements = soft.missingInputs;
      validationError = soft.error;
      // Partial identity for envelope headers when available
      if (isPlainObject(rawReq)) {
        requirements = null;
      }
    }
  } catch (err) {
    // forbidden / unsupported / hard invalid without recoverable missing list
    if (err.code === ERROR_CODES.FORBIDDEN_CLAIM || err.code === ERROR_CODES.UNSUPPORTED_CHECK) {
      throw err;
    }
    // Produce rejected envelope for other hard invalids when we can label them
    validationError = { code: err.code || ERROR_CODES.INVALID_INPUT, message: err.message };
    missingFromRequirements = [
      {
        id: "requirements",
        name: "Valid task requirements",
        kind: "task_requirements",
        required: true,
        source: "caller",
        notes: err.message,
      },
    ];
  }

  if (!requirements) {
    const taskId =
      isPlainObject(rawReq) && typeof rawReq.taskId === "string" && rawReq.taskId.trim()
        ? rawReq.taskId.trim()
        : "unknown";
    const title =
      isPlainObject(rawReq) && typeof rawReq.title === "string" && rawReq.title.trim()
        ? rawReq.title.trim()
        : null;
    const summary =
      isPlainObject(rawReq) && typeof rawReq.summary === "string" && rawReq.summary.trim()
        ? rawReq.summary.trim()
        : null;

    const { requiredInputs, missingInputs: missingFromContract } = mergeCapabilityInputs(
      [
        {
          id: "task_requirements",
          name: "Task requirements document",
          kind: "task_requirements",
          required: true,
          source: "caller",
        },
      ],
      contract,
      providedInputs,
    );

    const missingInputs = [...missingFromRequirements, ...missingFromContract];
    const hasIdentity = Boolean(title && summary && taskId !== "unknown");
    const status =
      hasIdentity && missingFromRequirements.length > 0
        ? ENVELOPE_STATUS.PARTIAL_INPUT
        : ENVELOPE_STATUS.REJECTED;

    return {
      schema: ENVELOPE_SCHEMA,
      taskId,
      title,
      summary,
      generatedAt,
      status,
      requirementsRef: { ...REQUIREMENTS_REF },
      requiredInputs,
      outputConstraints: null,
      acceptableEvidence: null,
      missingInputs,
      capabilityContract: contract
        ? { id: contract.id, path: contract.path }
        : null,
      validationError,
      demo: isPlainObject(rawReq) && rawReq.demo === true,
      mutationBoundary:
        "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.",
    };
  }

  // Full requirements path
  const baseInputs = deriveRequiredInputsFromRequirements(requirements);
  const { requiredInputs, missingInputs: missingFromContract } = mergeCapabilityInputs(
    baseInputs,
    contract,
    providedInputs,
  );

  const outputConstraints = buildOutputConstraints(requirements);
  const acceptableEvidence = buildAcceptableEvidence(requirements, contract);

  const softMissing = [];
  if (outputConstraints.objectiveChecks.length === 0 && acceptableEvidence.subjectiveUnresolved.length > 0) {
    softMissing.push({
      id: "objectiveChecks",
      name: "At least one objective check",
      kind: "objective_criteria",
      required: false,
      source: "requirements",
      notes: "Envelope is partial: only subjective criteria present; objective layer empty",
    });
  }

  const missingInputs = [...missingFromContract, ...softMissing];
  let status = ENVELOPE_STATUS.READY;
  if (missingFromContract.length > 0 || softMissing.length > 0) {
    status = ENVELOPE_STATUS.PARTIAL_INPUT;
  }
  if (outputConstraints.objectiveChecks.length === 0 && acceptableEvidence.subjectiveUnresolved.length === 0) {
    status = ENVELOPE_STATUS.REJECTED;
    missingInputs.push({
      id: "criteria",
      name: "Criteria",
      kind: "criteria",
      required: true,
      source: "requirements",
    });
  }

  return {
    schema: ENVELOPE_SCHEMA,
    taskId: requirements.taskId,
    title: requirements.title,
    summary: requirements.summary,
    generatedAt,
    status,
    requirementsRef: { ...REQUIREMENTS_REF },
    requiredInputs,
    outputConstraints,
    acceptableEvidence,
    missingInputs,
    capabilityContract: contract
      ? { id: contract.id, path: contract.path, inputCount: contract.inputs.length, outputCount: contract.outputs.length }
      : null,
    demo: requirements.demo === true,
    sourceLabel: requirements.sourceLabel,
    bounds: requirements.bounds,
    mutationBoundary:
      "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.",
  };
}

/** Re-export for callers that want Exchange-identical strict validation. */
export { validateTaskRequirements };
