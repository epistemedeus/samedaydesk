/**
 * Validate Cap07 buyer-controlled context pack input.
 * Mirrors Cap01 capabilityContract.inputs / requiredInputs semantics locally.
 */
import {
  ALLOWED_METHODS,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  INPUT_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function packError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw packError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw packError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw packError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
  for (const [k, v] of Object.entries(record)) {
    if (isPlainObject(v)) assertNoForbidden(v, `${label}.${k}`);
    else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (isPlainObject(item)) assertNoForbidden(item, `${label}.${k}[${i}]`);
      });
    }
  }
}

/**
 * Normalize one Cap01-shaped required input descriptor.
 * secret:true (or kind === "secret") marks values for dry-run redaction.
 */
export function normalizeInputDescriptor(item, label) {
  if (!isPlainObject(item)) {
    throw packError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(item, label);

  const id = requireNonEmptyString(item.id, `${label}.id`, { max: 128 });
  const name = requireNonEmptyString(item.name || item.id, `${label}.name`, { max: 240 });
  const kind = requireNonEmptyString(item.kind || "value", `${label}.kind`, { max: 64 });
  const required = item.required !== false;
  const secret = item.secret === true || kind === "secret";
  const allowed = item.allowed !== false; // optional inputs may still be allowed when present
  const notes =
    item.notes == null
      ? undefined
      : requireNonEmptyString(String(item.notes), `${label}.notes`, { max: 500 });
  const place =
    item.place == null
      ? inferPlace(id, kind)
      : requireNonEmptyString(String(item.place), `${label}.place`, { max: 32 });

  if (!["body", "header", "query", "path"].includes(place)) {
    throw packError(
      ERROR_CODES.INVALID_INPUT,
      `${label}.place must be body|header|query|path`,
    );
  }

  return {
    id,
    name,
    kind,
    required,
    allowed,
    secret,
    place,
    notes,
    source: item.source || "capabilityContract",
  };
}

function inferPlace(id, kind) {
  const lower = String(id).toLowerCase();
  if (
    kind === "header" ||
    lower.includes("authorization") ||
    lower === "content_type" ||
    lower === "content-type" ||
    lower.startsWith("header_") ||
    lower.startsWith("hdr_")
  ) {
    return "header";
  }
  if (kind === "query" || lower.startsWith("query_") || lower.startsWith("q_")) {
    return "query";
  }
  if (kind === "path" || lower.startsWith("path_")) {
    return "path";
  }
  return "body";
}

/**
 * Validate endpointScope: method + path/url pattern + allowed header NAMES only.
 * Never accepts secret values inside endpointScope.
 */
export function validateEndpointScope(raw) {
  if (!isPlainObject(raw)) {
    throw packError(ERROR_CODES.INVALID_INPUT, "endpointScope must be an object");
  }
  assertNoForbidden(raw, "endpointScope");

  // Reject secret values smuggled into endpoint scope
  for (const bad of ["headers", "headerValues", "authorization", "apiKey", "api_key", "token", "secret"]) {
    if (Object.prototype.hasOwnProperty.call(raw, bad)) {
      throw packError(
        ERROR_CODES.FORBIDDEN_ENDPOINT,
        `endpointScope must not include secret values (${bad}); supply header NAMES only via allowedHeaders`,
        { field: bad },
      );
    }
  }

  const methodRaw = requireNonEmptyString(raw.method, "endpointScope.method", { max: 16 });
  const method = methodRaw.toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    throw packError(
      ERROR_CODES.INVALID_INPUT,
      `endpointScope.method must be one of ${ALLOWED_METHODS.join(",")}`,
      { method },
    );
  }

  const url =
    raw.url == null
      ? null
      : requireNonEmptyString(String(raw.url), "endpointScope.url", { max: 2000 });
  const path =
    raw.path == null && raw.urlPattern == null
      ? null
      : requireNonEmptyString(
          String(raw.path ?? raw.urlPattern),
          "endpointScope.path",
          { max: 500 },
        );

  if (!url && !path) {
    throw packError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "endpointScope requires url and/or path (url pattern)",
    );
  }

  if (url) {
    // Bound to https for dry-run packs (no live calls; still reject obviously unsafe schemes)
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw packError(ERROR_CODES.INVALID_INPUT, "endpointScope.url must be a valid absolute URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw packError(
        ERROR_CODES.FORBIDDEN_ENDPOINT,
        `endpointScope.url scheme must be http(s); got ${parsed.protocol}`,
      );
    }
  }

  let allowedHeaders = [];
  if (raw.allowedHeaders != null) {
    if (!Array.isArray(raw.allowedHeaders)) {
      throw packError(ERROR_CODES.INVALID_INPUT, "endpointScope.allowedHeaders must be an array");
    }
    allowedHeaders = raw.allowedHeaders.map((h, i) => {
      if (typeof h !== "string" || !h.trim()) {
        throw packError(
          ERROR_CODES.INVALID_INPUT,
          `endpointScope.allowedHeaders[${i}] must be a non-empty header name string`,
        );
      }
      // Names only — reject "Name: value" forms
      if (h.includes(":") || h.includes("\n") || h.includes("\r")) {
        throw packError(
          ERROR_CODES.FORBIDDEN_ENDPOINT,
          `endpointScope.allowedHeaders[${i}] must be a header name only (no values)`,
        );
      }
      return h.trim();
    });
  }

  return {
    method,
    url,
    path,
    urlPattern: path,
    allowedHeaders,
  };
}

/**
 * Resolve the list of allowed/required input descriptors from either:
 *   - capabilityContract.inputs (Cap01-shaped), or
 *   - requiredInputs[] (Cap01 envelope shape), or
 *   - both (union by id; contract wins on conflict for metadata)
 */
export function resolveInputDescriptors(raw) {
  const byId = new Map();

  if (raw.capabilityContract != null) {
    if (!isPlainObject(raw.capabilityContract)) {
      throw packError(ERROR_CODES.INVALID_INPUT, "capabilityContract must be an object when present");
    }
    assertNoForbidden(raw.capabilityContract, "capabilityContract");
    const contractId = requireNonEmptyString(
      raw.capabilityContract.id,
      "capabilityContract.id",
      { max: 128 },
    );
    const inputs = raw.capabilityContract.inputs;
    if (inputs != null) {
      if (!Array.isArray(inputs)) {
        throw packError(ERROR_CODES.INVALID_INPUT, "capabilityContract.inputs must be an array");
      }
      inputs.forEach((item, i) => {
        const norm = normalizeInputDescriptor(item, `capabilityContract.inputs[${i}]`);
        byId.set(norm.id, { ...norm, source: "capabilityContract", contractId });
      });
    }
  }

  if (raw.requiredInputs != null) {
    if (!Array.isArray(raw.requiredInputs)) {
      throw packError(ERROR_CODES.INVALID_INPUT, "requiredInputs must be an array when present");
    }
    raw.requiredInputs.forEach((item, i) => {
      const norm = normalizeInputDescriptor(item, `requiredInputs[${i}]`);
      if (!byId.has(norm.id)) {
        byId.set(norm.id, { ...norm, source: norm.source || "requiredInputs" });
      }
    });
  }

  if (byId.size === 0) {
    throw packError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "capabilityContract.inputs or requiredInputs[] is required",
    );
  }

  return [...byId.values()];
}

/**
 * Validate full Cap07 pack input. Soft-missing required values are NOT thrown here —
 * pack builder lists them in missingInputs. Hard invalids / forbidden throw.
 */
export function validateBuyerContextPackInput(raw) {
  if (!isPlainObject(raw)) {
    throw packError(ERROR_CODES.INVALID_INPUT, "buyer context pack input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (raw.schema != null && raw.schema !== INPUT_SCHEMA && raw.schema !== SCHEMA) {
    throw packError(
      ERROR_CODES.INVALID_INPUT,
      `input.schema must be ${INPUT_SCHEMA} (or pack schema) when present`,
    );
  }

  const taskId = requireNonEmptyString(raw.taskId, "taskId", { max: 128 });

  const capabilityId =
    raw.capabilityId == null && raw.capabilityContract?.id == null
      ? null
      : requireNonEmptyString(
          String(raw.capabilityId ?? raw.capabilityContract.id),
          "capabilityId",
          { max: 128 },
        );

  const descriptors = resolveInputDescriptors(raw);
  const endpointScope = validateEndpointScope(raw.endpointScope);

  if (!isPlainObject(raw.callerProvided) && raw.callerProvided != null) {
    throw packError(ERROR_CODES.INVALID_INPUT, "callerProvided must be an object when present");
  }
  const callerProvided = isPlainObject(raw.callerProvided) ? { ...raw.callerProvided } : {};
  assertNoForbidden(callerProvided, "callerProvided");

  // Optional explicit header value map (names must be in allowedHeaders)
  let headerValues = {};
  if (raw.headerValues != null) {
    if (!isPlainObject(raw.headerValues)) {
      throw packError(ERROR_CODES.INVALID_INPUT, "headerValues must be an object when present");
    }
    assertNoForbidden(raw.headerValues, "headerValues");
    headerValues = { ...raw.headerValues };
  }

  // Optional body override (still filtered to allowed input ids)
  let bodyProvided = null;
  if (raw.body != null) {
    if (!isPlainObject(raw.body)) {
      throw packError(ERROR_CODES.INVALID_INPUT, "body must be an object when present");
    }
    assertNoForbidden(raw.body, "body");
    bodyProvided = { ...raw.body };
  }

  return {
    schema: INPUT_SCHEMA,
    taskId,
    capabilityId,
    descriptors,
    endpointScope,
    callerProvided,
    headerValues,
    bodyProvided,
    demo: raw.demo === true,
    notes:
      raw.notes == null
        ? null
        : requireNonEmptyString(String(raw.notes), "notes", { max: 2000 }),
  };
}
