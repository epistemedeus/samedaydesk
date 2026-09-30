import {
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

export function briefError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw briefError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw briefError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function assertNoForbidden(record, label) {
  for (const key of FORBIDDEN_BRIEF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw briefError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

/**
 * Validate supplied task requirements before brief generation.
 * Returns a normalized shallow copy. Does not invent missing facts.
 */
export function validateTaskRequirements(raw) {
  if (!isPlainObject(raw)) {
    throw briefError(ERROR_CODES.INVALID_INPUT, "task requirements must be an object");
  }
  assertNoForbidden(raw, "requirements");

  const schema = raw.schema;
  if (schema != null && schema !== REQUIREMENTS_SCHEMA) {
    throw briefError(
      ERROR_CODES.INVALID_INPUT,
      `requirements.schema must be ${REQUIREMENTS_SCHEMA} when present`,
    );
  }

  const taskId = requireNonEmptyString(raw.taskId, "requirements.taskId", { max: 128 });
  const title = requireNonEmptyString(raw.title, "requirements.title", { max: 240 });
  const summary = requireNonEmptyString(raw.summary, "requirements.summary", { max: 2000 });

  if (!isPlainObject(raw.artifact) && raw.artifact != null) {
    throw briefError(ERROR_CODES.INVALID_INPUT, "requirements.artifact must be an object when present");
  }
  const artifact = isPlainObject(raw.artifact) ? { ...raw.artifact } : {};
  if (artifact.format != null) {
    artifact.format = requireNonEmptyString(artifact.format, "requirements.artifact.format", {
      max: 64,
    });
  }
  if (artifact.maxBytes != null) {
    if (!Number.isInteger(artifact.maxBytes) || artifact.maxBytes < 1) {
      throw briefError(ERROR_CODES.INVALID_INPUT, "requirements.artifact.maxBytes must be a positive integer");
    }
  }
  if (artifact.requiredFields != null) {
    if (!Array.isArray(artifact.requiredFields) || !artifact.requiredFields.every((f) => typeof f === "string" && f.trim())) {
      throw briefError(ERROR_CODES.INVALID_INPUT, "requirements.artifact.requiredFields must be a string array");
    }
    artifact.requiredFields = artifact.requiredFields.map((f) => f.trim());
  }

  for (const key of ["objectiveCriteria", "subjectiveCriteria", "criteria"]) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && !Array.isArray(raw[key])) {
      throw briefError(
        ERROR_CODES.INVALID_INPUT,
        `requirements.${key} must be an array when present`,
      );
    }
  }

  const objective = Array.isArray(raw.objectiveCriteria) ? raw.objectiveCriteria : null;
  const subjective = Array.isArray(raw.subjectiveCriteria) ? raw.subjectiveCriteria : null;

  if (objective === null && subjective === null && !Array.isArray(raw.criteria)) {
    throw briefError(
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
        throw briefError(ERROR_CODES.INVALID_INPUT, `requirements.criteria[${i}] must be an object`);
      }
      const klass = item.class || item.kind;
      if (klass === CRITERION_CLASS.OBJECTIVE || klass === "machine" || item.machineCheckable === true) {
        normalizedObjective.push(normalizeObjectiveCriterion(item, `criteria[${i}]`));
      } else if (klass === CRITERION_CLASS.SUBJECTIVE || klass === "manual" || item.machineCheckable === false) {
        normalizedSubjective.push(normalizeSubjectiveCriterion(item, `criteria[${i}]`));
      } else {
        throw briefError(
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
    throw briefError(ERROR_CODES.MISSING_REQUIREMENT, "at least one criterion is required");
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
    sourceLabel: raw.sourceLabel == null ? null : requireNonEmptyString(String(raw.sourceLabel), "requirements.sourceLabel", { max: 240 }),
  };
}

function normalizeObjectiveCriterion(item, label) {
  if (!isPlainObject(item)) {
    throw briefError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(item, label);
  const id = requireNonEmptyString(item.id, `${label}.id`, { max: 128 });
  const description = requireNonEmptyString(item.description, `${label}.description`, { max: 500 });
  const check = item.check;
  if (!isPlainObject(check)) {
    throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.check must be an object`);
  }
  const kind = requireNonEmptyString(check.kind, `${label}.check.kind`, { max: 64 });
  if (!Object.values(CHECK_KIND).includes(kind)) {
    throw briefError(ERROR_CODES.UNSUPPORTED_CHECK, `${label}.check.kind unsupported: ${kind}`, {
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
    throw briefError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(item, label);
  const id = requireNonEmptyString(item.id, `${label}.id`, { max: 128 });
  const description = requireNonEmptyString(item.description, `${label}.description`, { max: 500 });
  const reviewHint =
    item.reviewHint == null
      ? "Human review required; not machine-resolved by this brief."
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
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.equals is required`);
      }
      break;
    case CHECK_KIND.JSON_PATH_TYPE:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      requireNonEmptyString(check.type, `${label}.type`, { max: 32 });
      if (!JSON_TYPES.includes(check.type)) {
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.type must be one of ${JSON_TYPES.join(",")}`);
      }
      break;
    case CHECK_KIND.STRING_MAX_LENGTH:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Number.isInteger(check.max) || check.max < 1) {
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.max must be a positive integer`);
      }
      break;
    case CHECK_KIND.ARRAY_MIN_LENGTH:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Number.isInteger(check.min) || check.min < 0) {
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.min must be a non-negative integer`);
      }
      break;
    case CHECK_KIND.ENUM_IN:
      requireNonEmptyString(check.path, `${label}.path`, { max: 200 });
      if (!Array.isArray(check.values) || check.values.length < 1) {
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.values must be a non-empty array`);
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
        throw briefError(ERROR_CODES.INVALID_INPUT, `${label}.pattern is not a valid RegExp`);
      }
      break;
    default:
      throw briefError(ERROR_CODES.UNSUPPORTED_CHECK, `unsupported check kind ${kind}`);
  }
}
