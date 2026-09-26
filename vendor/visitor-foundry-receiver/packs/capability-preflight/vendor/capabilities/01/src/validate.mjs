/**
 * validateTaskRequirements — mirrored semantics from R2-EXCHANGE-01 src/validate.mjs.
 * Also accepts REQUIREMENTS_SCHEMA_ALIAS mapping to the same shape.
 */
import {
  ACCEPTED_REQUIREMENTS_SCHEMAS,
  CHECK_KIND,
  CRITERION_CLASS,
  ERROR_CODES,
  FORBIDDEN_BRIEF_FIELDS,
  JSON_TYPES,
  REQUIREMENTS_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function envelopeError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function assertNoForbidden(record, label) {
  for (const key of FORBIDDEN_BRIEF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw envelopeError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

/**
 * Validate supplied task requirements (Exchange01 semantics).
 * Returns a normalized shallow copy. Does not invent missing facts.
 */
export function validateTaskRequirements(raw) {
  if (!isPlainObject(raw)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, "task requirements must be an object");
  }
  assertNoForbidden(raw, "requirements");

  const schema = raw.schema;
  if (schema != null && !ACCEPTED_REQUIREMENTS_SCHEMAS.includes(schema)) {
    throw envelopeError(
      ERROR_CODES.INVALID_INPUT,
      `requirements.schema must be ${REQUIREMENTS_SCHEMA} (or capabilities alias) when present`,
    );
  }

  const taskId = requireNonEmptyString(raw.taskId, "requirements.taskId", { max: 128 });
  const title = requireNonEmptyString(raw.title, "requirements.title", { max: 240 });
  const summary = requireNonEmptyString(raw.summary, "requirements.summary", { max: 2000 });

  if (!isPlainObject(raw.artifact) && raw.artifact != null) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, "requirements.artifact must be an object when present");
  }
  const artifact = isPlainObject(raw.artifact) ? { ...raw.artifact } : {};
  if (artifact.format != null) {
    artifact.format = requireNonEmptyString(artifact.format, "requirements.artifact.format", {
      max: 64,
    });
  }
  if (artifact.maxBytes != null) {
    if (!Number.isInteger(artifact.maxBytes) || artifact.maxBytes < 1) {
      throw envelopeError(ERROR_CODES.INVALID_INPUT, "requirements.artifact.maxBytes must be a positive integer");
    }
  }
  if (artifact.requiredFields != null) {
    if (!Array.isArray(artifact.requiredFields) || !artifact.requiredFields.every((f) => typeof f === "string" && f.trim())) {
      throw envelopeError(ERROR_CODES.INVALID_INPUT, "requirements.artifact.requiredFields must be a string array");
    }
    artifact.requiredFields = artifact.requiredFields.map((f) => f.trim());
  }

  const objective = Array.isArray(raw.objectiveCriteria) ? raw.objectiveCriteria : null;
  const subjective = Array.isArray(raw.subjectiveCriteria) ? raw.subjectiveCriteria : null;

  if (objective === null && subjective === null && !Array.isArray(raw.criteria)) {
    throw envelopeError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "requirements need objectiveCriteria, subjectiveCriteria, and/or criteria[]",
    );
  }

  const normalizedObjective = [];
  const normalizedSubjective = [];

  if (Array.isArray(raw.criteria)) {
    for (let i = 0; i < raw.criteria.length; i += 1) {
      const item = raw.criteria[i];
      if (!isPlainObject(item)) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `requirements.criteria[${i}] must be an object`);
      }
      const klass = item.class || item.kind;
      if (klass === CRITERION_CLASS.OBJECTIVE || klass === "machine" || item.machineCheckable === true) {
        normalizedObjective.push(normalizeObjectiveCriterion(item, `criteria[${i}]`));
      } else if (klass === CRITERION_CLASS.SUBJECTIVE || klass === "manual" || item.machineCheckable === false) {
        normalizedSubjective.push(normalizeSubjectiveCriterion(item, `criteria[${i}]`));
      } else {
        throw envelopeError(
          ERROR_CODES.INVALID_INPUT,
          `requirements.criteria[${i}] needs class objective|subjective or machineCheckable`,
        );
      }
    }
  }

  if (objective) {
    objective.forEach((item, i) => {
      normalizedObjective.push(normalizeObjectiveCriterion(item, `objectiveCriteria[${i}]`));
    });
  }
  if (subjective) {
    subjective.forEach((item, i) => {
      normalizedSubjective.push(normalizeSubjectiveCriterion(item, `subjectiveCriteria[${i}]`));
    });
  }

  if (normalizedObjective.length === 0 && normalizedSubjective.length === 0) {
    throw envelopeError(ERROR_CODES.MISSING_REQUIREMENT, "at least one criterion is required");
  }

  const bounds = isPlainObject(raw.bounds) ? { ...raw.bounds } : {};
  if (bounds.notes != null) {
    bounds.notes = requireNonEmptyString(bounds.notes, "requirements.bounds.notes", { max: 1000 });
  }

  return {
    schema: REQUIREMENTS_SCHEMA,
    taskId,
    title,
    summary,
    artifact,
    objectiveCriteria: normalizedObjective,
    subjectiveCriteria: normalizedSubjective,
    bounds,
    demo: raw.demo === true,
    sourceLabel:
      raw.sourceLabel == null
        ? null
        : requireNonEmptyString(String(raw.sourceLabel), "requirements.sourceLabel", { max: 240 }),
  };
}

function normalizeObjectiveCriterion(item, label) {
  if (!isPlainObject(item)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(item, label);
  const id = requireNonEmptyString(item.id, `${label}.id`, { max: 128 });
  const description = requireNonEmptyString(item.description, `${label}.description`, { max: 500 });
  const check = item.check;
  if (!isPlainObject(check)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.check must be an object`);
  }
  const kind = requireNonEmptyString(check.kind, `${label}.check.kind`, { max: 64 });
  if (!Object.values(CHECK_KIND).includes(kind)) {
    throw envelopeError(ERROR_CODES.UNSUPPORTED_CHECK, `${label}.check.kind unsupported: ${kind}`, {
      kind,
    });
  }
  validateCheckShape(kind, check, `${label}.check`);
  return {
    id,
    description,
    class: CRITERION_CLASS.OBJECTIVE,
    machineCheckable: true,
    check: { ...check, kind },
  };
}

function normalizeSubjectiveCriterion(item, label) {
  if (!isPlainObject(item)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(item, label);
  const id = requireNonEmptyString(item.id, `${label}.id`, { max: 128 });
  const description = requireNonEmptyString(item.description, `${label}.description`, { max: 500 });
  const reviewHint =
    item.reviewHint == null
      ? "Human review required; not machine-resolved by this envelope."
      : requireNonEmptyString(item.reviewHint, `${label}.reviewHint`, { max: 500 });
  return {
    id,
    description,
    class: CRITERION_CLASS.SUBJECTIVE,
    machineCheckable: false,
    reviewHint,
  };
}

function validateCheckShape(kind, check, label) {
  switch (kind) {
    case CHECK_KIND.JSON_PATH_EXISTS:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      break;
    case CHECK_KIND.JSON_PATH_EQUALS:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Object.prototype.hasOwnProperty.call(check, "equals")) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.equals is required`);
      }
      break;
    case CHECK_KIND.JSON_PATH_TYPE:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      requireNonEmptyString(check.type, `${label}.type`, { max: 32 });
      if (!JSON_TYPES.includes(check.type)) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.type must be one of ${JSON_TYPES.join(",")}`);
      }
      break;
    case CHECK_KIND.STRING_MAX_LENGTH:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Number.isInteger(check.max) || check.max < 1) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.max must be a positive integer`);
      }
      break;
    case CHECK_KIND.ARRAY_MIN_LENGTH:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Number.isInteger(check.min) || check.min < 0) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.min must be a non-negative integer`);
      }
      break;
    case CHECK_KIND.ENUM_IN:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Array.isArray(check.values) || check.values.length < 1) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.values must be a non-empty array`);
      }
      break;
    case CHECK_KIND.HTTPS_URL_SHAPE:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      break;
    case CHECK_KIND.SHA256_HEX:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      break;
    case CHECK_KIND.REGEX_MATCH:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      requireNonEmptyString(check.pattern, `${label}.pattern`, { max: 300 });
      try {
        // eslint-disable-next-line no-new
        new RegExp(check.pattern);
      } catch {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `${label}.pattern is not a valid RegExp`);
      }
      break;
    default:
      throw envelopeError(ERROR_CODES.UNSUPPORTED_CHECK, `unsupported check kind ${kind}`);
  }
}

/**
 * Soft-collect missing requirement facts without inventing them.
 * Returns { ok, missingInputs, requirements?, error? }.
 */
export function tryValidateTaskRequirements(raw) {
  try {
    return { ok: true, missingInputs: [], requirements: validateTaskRequirements(raw) };
  } catch (err) {
    if (err.code === ERROR_CODES.FORBIDDEN_CLAIM || err.code === ERROR_CODES.UNSUPPORTED_CHECK) {
      throw err;
    }
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        ok: false,
        missingInputs: inferMissingFromMessage(err.message, raw),
        requirements: null,
        error: { code: err.code, message: err.message },
      };
    }
    if (err.code === ERROR_CODES.INVALID_INPUT) {
      // Core identity missing → still report as missing when possible
      const missing = inferMissingIdentity(raw);
      if (missing.length > 0) {
        return {
          ok: false,
          missingInputs: missing,
          requirements: null,
          error: { code: err.code, message: err.message },
        };
      }
      throw err;
    }
    throw err;
  }
}

function inferMissingIdentity(raw) {
  const missing = [];
  if (!isPlainObject(raw)) return [{ id: "requirements", name: "Task requirements object", kind: "object", required: true, source: "caller" }];
  if (typeof raw.taskId !== "string" || !raw.taskId.trim()) {
    missing.push({ id: "taskId", name: "Task id", kind: "string", required: true, source: "requirements" });
  }
  if (typeof raw.title !== "string" || !raw.title.trim()) {
    missing.push({ id: "title", name: "Title", kind: "string", required: true, source: "requirements" });
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    missing.push({ id: "summary", name: "Summary", kind: "string", required: true, source: "requirements" });
  }
  return missing;
}

function inferMissingFromMessage(message, raw) {
  const missing = [];
  if (/objectiveCriteria|subjectiveCriteria|criteria/.test(message)) {
    missing.push({
      id: "criteria",
      name: "Objective and/or subjective criteria",
      kind: "criteria",
      required: true,
      source: "requirements",
      notes: message,
    });
  }
  if (missing.length === 0) {
    missing.push({
      id: "requirements",
      name: "Complete task requirements",
      kind: "task_requirements",
      required: true,
      source: "caller",
      notes: message,
    });
  }
  // Attach whatever identity we already have for diagnostics only (not invented facts)
  if (isPlainObject(raw) && typeof raw.taskId === "string" && raw.taskId.trim()) {
    // no-op; identity present
  }
  return missing;
}

/**
 * Validate optional capabilityContract descriptor (synthetic fixtures only).
 */
export function validateCapabilityContract(raw) {
  if (raw == null) return null;
  if (!isPlainObject(raw)) {
    throw envelopeError(ERROR_CODES.INVALID_INPUT, "capabilityContract must be an object when present");
  }
  assertNoForbidden(raw, "capabilityContract");
  const id = requireNonEmptyString(raw.id, "capabilityContract.id", { max: 128 });
  const path =
    raw.path == null
      ? null
      : requireNonEmptyString(String(raw.path), "capabilityContract.path", { max: 500 });

  const inputs = [];
  if (raw.inputs != null) {
    if (!Array.isArray(raw.inputs)) {
      throw envelopeError(ERROR_CODES.INVALID_INPUT, "capabilityContract.inputs must be an array");
    }
    raw.inputs.forEach((item, i) => {
      if (!isPlainObject(item)) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `capabilityContract.inputs[${i}] must be an object`);
      }
      assertNoForbidden(item, `capabilityContract.inputs[${i}]`);
      inputs.push({
        id: requireNonEmptyString(item.id, `capabilityContract.inputs[${i}].id`, { max: 128 }),
        name: requireNonEmptyString(item.name || item.id, `capabilityContract.inputs[${i}].name`, { max: 240 }),
        kind: requireNonEmptyString(item.kind || "value", `capabilityContract.inputs[${i}].kind`, { max: 64 }),
        required: item.required !== false,
        source: "capabilityContract",
        notes: item.notes == null ? undefined : requireNonEmptyString(String(item.notes), `capabilityContract.inputs[${i}].notes`, { max: 500 }),
      });
    });
  }

  const outputs = [];
  if (raw.outputs != null) {
    if (!Array.isArray(raw.outputs)) {
      throw envelopeError(ERROR_CODES.INVALID_INPUT, "capabilityContract.outputs must be an array");
    }
    raw.outputs.forEach((item, i) => {
      if (!isPlainObject(item)) {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `capabilityContract.outputs[${i}] must be an object`);
      }
      outputs.push({
        id: requireNonEmptyString(item.id, `capabilityContract.outputs[${i}].id`, { max: 128 }),
        name: requireNonEmptyString(item.name || item.id, `capabilityContract.outputs[${i}].name`, { max: 240 }),
        kind: item.kind == null ? "artifact" : requireNonEmptyString(String(item.kind), `capabilityContract.outputs[${i}].kind`, { max: 64 }),
      });
    });
  }

  const evidenceHints = [];
  if (raw.evidenceHints != null) {
    if (!Array.isArray(raw.evidenceHints)) {
      throw envelopeError(ERROR_CODES.INVALID_INPUT, "capabilityContract.evidenceHints must be an array");
    }
    raw.evidenceHints.forEach((item, i) => {
      if (typeof item === "string") {
        evidenceHints.push({ id: `hint_${i}`, kind: "note", note: requireNonEmptyString(item, `evidenceHints[${i}]`, { max: 500 }) });
      } else if (isPlainObject(item)) {
        evidenceHints.push({
          id: item.id ? requireNonEmptyString(item.id, `evidenceHints[${i}].id`, { max: 128 }) : `hint_${i}`,
          kind: item.kind ? requireNonEmptyString(String(item.kind), `evidenceHints[${i}].kind`, { max: 64 }) : "note",
          note: item.note == null && item.description == null
            ? undefined
            : requireNonEmptyString(String(item.note || item.description), `evidenceHints[${i}].note`, { max: 500 }),
          checkKind: item.checkKind && Object.values(CHECK_KIND).includes(item.checkKind) ? item.checkKind : undefined,
        });
      } else {
        throw envelopeError(ERROR_CODES.INVALID_INPUT, `capabilityContract.evidenceHints[${i}] must be string or object`);
      }
    });
  }

  return { id, path, inputs, outputs, evidenceHints };
}
