import {
  ERROR_CODES,
  FORBIDDEN_PROPOSAL_FIELDS,
  PROPOSAL_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compareError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function assertNoForbidden(record, label, forbidden) {
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw compareError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

/**
 * Normalize one supplied proposal. Terms and evidence only — no reputation.
 */
export function validateProposal(raw, index = 0) {
  const label = `proposals[${index}]`;
  if (!isPlainObject(raw)) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(raw, label, FORBIDDEN_PROPOSAL_FIELDS);

  if (raw.schema != null && raw.schema !== PROPOSAL_SCHEMA) {
    throw compareError(
      ERROR_CODES.INVALID_INPUT,
      `${label}.schema must be ${PROPOSAL_SCHEMA} when present`,
    );
  }

  const id = requireNonEmptyString(raw.id, `${label}.id`, { max: 128 });
  const proposerLabel = requireNonEmptyString(
    raw.proposerLabel,
    `${label}.proposerLabel`,
    { max: 240 },
  );
  const summary =
    raw.summary == null
      ? null
      : requireNonEmptyString(raw.summary, `${label}.summary`, { max: 2000 });

  const terms = isPlainObject(raw.terms) ? { ...raw.terms } : {};
  if (terms.priceAmount != null) {
    if (typeof terms.priceAmount !== "string" && typeof terms.priceAmount !== "number") {
      throw compareError(ERROR_CODES.INVALID_INPUT, `${label}.terms.priceAmount must be string or number`);
    }
    terms.priceAmount = String(terms.priceAmount);
  }
  if (terms.currency != null) {
    terms.currency = requireNonEmptyString(terms.currency, `${label}.terms.currency`, { max: 16 });
  }
  if (terms.deliveryNotes != null) {
    terms.deliveryNotes = requireNonEmptyString(
      terms.deliveryNotes,
      `${label}.terms.deliveryNotes`,
      { max: 1000 },
    );
  }

  const claimedRequirements = Array.isArray(raw.claimedRequirements)
    ? raw.claimedRequirements.map((item, i) => {
        if (!isPlainObject(item)) {
          throw compareError(ERROR_CODES.INVALID_INPUT, `${label}.claimedRequirements[${i}] must be object`);
        }
        return {
          criterionId: requireNonEmptyString(
            item.criterionId,
            `${label}.claimedRequirements[${i}].criterionId`,
            { max: 128 },
          ),
          claim: requireNonEmptyString(item.claim, `${label}.claimedRequirements[${i}].claim`, {
            max: 500,
          }),
          evidenceRef:
            item.evidenceRef == null
              ? null
              : requireNonEmptyString(
                  item.evidenceRef,
                  `${label}.claimedRequirements[${i}].evidenceRef`,
                  { max: 500 },
                ),
        };
      })
    : [];

  let artifact = null;
  if (raw.artifact !== undefined && raw.artifact !== null) {
    if (!isPlainObject(raw.artifact)) {
      throw compareError(ERROR_CODES.INVALID_INPUT, `${label}.artifact must be an object when present`);
    }
    artifact = raw.artifact;
  }

  return {
    schema: PROPOSAL_SCHEMA,
    id,
    proposerLabel,
    summary,
    terms,
    claimedRequirements,
    artifact,
    demo: raw.demo === true,
  };
}

export function validateBrief(brief) {
  if (!isPlainObject(brief)) {
    throw compareError(ERROR_CODES.MISSING_BRIEF, "brief must be an object");
  }
  if (!Array.isArray(brief.objectiveChecks)) {
    throw compareError(ERROR_CODES.MISSING_BRIEF, "brief.objectiveChecks must be an array");
  }
  return brief;
}
