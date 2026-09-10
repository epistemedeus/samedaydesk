import {
  ERROR_CODES,
  FORBIDDEN_BROADCAST_FIELDS,
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_JOB_KINDS,
  FORBIDDEN_SECRET_FIELDS,
  JOB_SCHEMA,
  RECIPE_SCHEMA,
  RECIPE_STATUS,
  REQUIRED_REUSE_POLICY,
  USEFUL_JOB_KINDS,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function recipeError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function rejectForbidden(obj, path = "") {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rejectForbidden(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_BROADCAST_FIELDS.includes(key)) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_BROADCAST,
        `Forbidden unsolicited broadcast field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_CLAIM_FIELDS.includes(key)) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

function assertReusePolicy(policy, path = "reusePolicy") {
  if (!isPlainObject(policy)) {
    throw recipeError(ERROR_CODES.MISSING_REQUIREMENT, `${path} required`, {
      missing: [path],
    });
  }
  if (policy.optInRequired !== true) {
    throw recipeError(
      ERROR_CODES.FORBIDDEN_OPT_IN,
      `${path}.optInRequired must be true (opt-in required for reuse)`,
      { path: `${path}.optInRequired`, got: policy.optInRequired ?? null },
    );
  }
  if (policy.broadcast !== false) {
    throw recipeError(
      ERROR_CODES.FORBIDDEN_BROADCAST,
      `${path}.broadcast must be false (no unsolicited broadcast)`,
      { path: `${path}.broadcast`, got: policy.broadcast ?? null },
    );
  }
  // Reject any extra broadcast-enabling flags
  if (policy.unsolicited === true || policy.autoBroadcast === true) {
    throw recipeError(
      ERROR_CODES.FORBIDDEN_BROADCAST,
      `${path}: unsolicited/autoBroadcast flags forbidden`,
      { path },
    );
  }
}

function assertJobRef(jobRef, path = "jobRef") {
  if (!isPlainObject(jobRef)) {
    throw recipeError(ERROR_CODES.MISSING_REQUIREMENT, `${path} required`, {
      missing: [path],
    });
  }
  if (typeof jobRef.kind !== "string" || !jobRef.kind.trim()) {
    throw recipeError(ERROR_CODES.MISSING_REQUIREMENT, `${path}.kind required`, {
      missing: [`${path}.kind`],
    });
  }
  const kind = jobRef.kind.trim();
  if (FORBIDDEN_JOB_KINDS.includes(kind)) {
    throw recipeError(
      ERROR_CODES.FORBIDDEN_JOB_KIND,
      `${path}.kind must be a concrete useful job (rejected generic: ${kind})`,
      { got: kind, allowed: Object.values(USEFUL_JOB_KINDS) },
    );
  }
  const allowed = Object.values(USEFUL_JOB_KINDS);
  if (!allowed.includes(kind)) {
    throw recipeError(
      ERROR_CODES.FORBIDDEN_JOB_KIND,
      `${path}.kind must be one of ${allowed.join("|")}`,
      { got: kind, allowed },
    );
  }
  // Require evidence or source path — not a bare kind label
  const evidencePath =
    typeof jobRef.evidencePath === "string" ? jobRef.evidencePath.trim() : "";
  const sourcePath =
    typeof jobRef.sourcePath === "string" ? jobRef.sourcePath.trim() : "";
  if (!evidencePath && !sourcePath) {
    throw recipeError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `${path} must cite evidencePath or sourcePath`,
      { missing: [`${path}.evidencePath|sourcePath`] },
    );
  }
}

/**
 * Validate a continuation job input document (build input).
 * Soft-missing opt-in / jobRef become blocked_missing_input in build;
 * hard rejects (broadcast, forbidden kinds, secrets) throw.
 */
export function validateJob(raw, { softMissing = false } = {}) {
  if (!isPlainObject(raw)) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "job document must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== JOB_SCHEMA) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, `schema must be ${JOB_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }

  const missing = [];

  if (!Object.prototype.hasOwnProperty.call(raw, "jobRef") || raw.jobRef == null) {
    missing.push("jobRef");
  } else {
    try {
      assertJobRef(raw.jobRef);
    } catch (err) {
      if (err.code === ERROR_CODES.MISSING_REQUIREMENT && softMissing) {
        missing.push(...(err.details?.missing || ["jobRef"]));
      } else {
        throw err;
      }
    }
  }

  // reusePolicy: missing or incomplete → soft missing when softMissing;
  // explicit optInRequired:false / broadcast:true always hard-rejects
  if (!Object.prototype.hasOwnProperty.call(raw, "reusePolicy") || raw.reusePolicy == null) {
    missing.push("reusePolicy");
  } else if (!isPlainObject(raw.reusePolicy)) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "reusePolicy must be an object");
  } else {
    if (raw.reusePolicy.optInRequired === false) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_OPT_IN,
        "reusePolicy.optInRequired must be true (opt-in required for reuse)",
        { path: "reusePolicy.optInRequired", got: false },
      );
    }
    if (raw.reusePolicy.broadcast === true) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_BROADCAST,
        "reusePolicy.broadcast must be false (no unsolicited broadcast)",
        { path: "reusePolicy.broadcast", got: true },
      );
    }
    if (
      raw.reusePolicy.optInRequired !== true ||
      raw.reusePolicy.broadcast !== false
    ) {
      // Incomplete policy counts as missing input (partial)
      if (raw.reusePolicy.optInRequired !== true) missing.push("reusePolicy.optInRequired");
      if (raw.reusePolicy.broadcast !== false) missing.push("reusePolicy.broadcast");
    } else {
      assertReusePolicy(raw.reusePolicy);
    }
  }

  if (typeof raw.captureStatus !== "string") {
    if (softMissing) missing.push("captureStatus");
    else {
      throw recipeError(ERROR_CODES.MISSING_REQUIREMENT, "captureStatus required", {
        missing: ["captureStatus"],
      });
    }
  } else {
    const allowedCapture = ["ok", "failed", "unavailable"];
    if (!allowedCapture.includes(raw.captureStatus)) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        `captureStatus must be one of ${allowedCapture.join(", ")}`,
        { got: raw.captureStatus },
      );
    }
    if (
      (raw.captureStatus === "failed" || raw.captureStatus === "unavailable") &&
      raw.forceNoUsers === true
    ) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable/failed capture must not be forced to no_users",
      );
    }
  }

  if (missing.length && softMissing) {
    const err = recipeError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `missing required inputs: ${missing.join(", ")}`,
      { missing },
    );
    throw err;
  }
  if (missing.length) {
    throw recipeError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `missing required inputs: ${missing.join(", ")}`,
      { missing },
    );
  }

  return raw;
}

/**
 * Validate a built continuation recipe.
 * Enforces opt-in, no-broadcast, useful jobRef, unavailable ≠ no_users.
 */
export function validateRecipe(raw) {
  if (!isPlainObject(raw)) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, "recipe must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== RECIPE_SCHEMA) {
    throw recipeError(ERROR_CODES.INVALID_INPUT, `schema must be ${RECIPE_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }

  const statuses = Object.values(RECIPE_STATUS);
  if (!statuses.includes(raw.status)) {
    throw recipeError(
      ERROR_CODES.INVALID_INPUT,
      `status must be one of ${statuses.join(", ")}`,
      { got: raw.status ?? null },
    );
  }

  // Hard invariant: unavailable ≠ no_users
  if (raw.status === RECIPE_STATUS.UNAVAILABLE) {
    if (Object.prototype.hasOwnProperty.call(raw, "priorDeliveryCount")) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable recipe must not include priorDeliveryCount (unavailable ≠ no_users)",
      );
    }
    if (raw.labels?.collapsedUnavailableAsNoUsers === true) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable capture must stay distinct from no_users",
      );
    }
  }
  if (raw.status === RECIPE_STATUS.NO_USERS) {
    if (raw.priorDeliveryCount !== 0 && raw.priorDeliveryCount !== undefined) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        "no_users requires priorDeliveryCount===0 when set",
      );
    }
  }

  // Available / blocked recipes that carry a recipe body must obey reuse + jobRef
  if (raw.status === RECIPE_STATUS.AVAILABLE) {
    assertJobRef(raw.jobRef);
    assertReusePolicy(raw.reusePolicy);
    if (!Array.isArray(raw.commands)) {
      throw recipeError(ERROR_CODES.INVALID_INPUT, "available recipe requires commands[]");
    }
    if (typeof raw.afterDeliveryStep !== "string" || !raw.afterDeliveryStep.trim()) {
      throw recipeError(
        ERROR_CODES.INVALID_INPUT,
        "available recipe requires afterDeliveryStep",
      );
    }
  }

  // Even blocked recipes must not smuggle broadcast:true / optIn:false if policy present
  if (raw.reusePolicy != null) {
    if (raw.reusePolicy.optInRequired === false) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_OPT_IN,
        "recipe.reusePolicy.optInRequired must be true",
      );
    }
    if (raw.reusePolicy.broadcast === true) {
      throw recipeError(
        ERROR_CODES.FORBIDDEN_BROADCAST,
        "recipe.reusePolicy.broadcast must be false",
      );
    }
  }

  return raw;
}

export { assertJobRef, assertReusePolicy };
