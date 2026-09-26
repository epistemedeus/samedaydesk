/**
 * buildBuyerContextPack — bounded invocation pack with dry-run readback.
 * Includes ONLY required/allowed fields; drops extras; never invents secrets.
 */
import {
  CAP01_NOT_HARD_DEP_NOTE,
  DRY_RUN_NOTE,
  ERROR_CODES,
  MUTATION_BOUNDARY,
  PACK_STATUS,
  REDACTED,
  REUSE_FROM,
  SCHEMA,
} from "./constants.mjs";
import {
  isPlainObject,
  packError,
  validateBuyerContextPackInput,
} from "./validate.mjs";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function redactValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return REDACTED;
  }
  // Objects/arrays: replace wholesale rather than inventing structure
  return REDACTED;
}

function lookupCallerValue(input, descriptor) {
  const { id, place } = descriptor;

  // Header place: prefer headerValues (by id or canonical header name), then callerProvided
  if (place === "header") {
    if (hasOwn(input.headerValues, id)) return { present: true, value: input.headerValues[id] };
    // Allow matching allowedHeaders name when descriptor id equals header name (case-insensitive)
    for (const [hk, hv] of Object.entries(input.headerValues)) {
      if (hk.toLowerCase() === id.toLowerCase()) {
        return { present: true, value: hv };
      }
    }
    if (hasOwn(input.callerProvided, id)) {
      return { present: true, value: input.callerProvided[id] };
    }
    return { present: false, value: undefined };
  }

  if (place === "body" && input.bodyProvided && hasOwn(input.bodyProvided, id)) {
    return { present: true, value: input.bodyProvided[id] };
  }

  if (hasOwn(input.callerProvided, id)) {
    return { present: true, value: input.callerProvided[id] };
  }

  return { present: false, value: undefined };
}

function collectExcludedExtras(input, allowedIds) {
  const extras = [];
  for (const key of Object.keys(input.callerProvided)) {
    if (!allowedIds.has(key)) extras.push({ id: key, source: "callerProvided" });
  }
  if (input.bodyProvided) {
    for (const key of Object.keys(input.bodyProvided)) {
      if (!allowedIds.has(key) && !extras.some((e) => e.id === key && e.source === "body")) {
        extras.push({ id: key, source: "body" });
      }
    }
  }
  // Header values whose names are not in allowedHeaders AND not a descriptor id
  const allowedHeaderNames = new Set(
    input.endpointScope.allowedHeaders.map((h) => h.toLowerCase()),
  );
  for (const key of Object.keys(input.headerValues)) {
    const isAllowedName = allowedHeaderNames.has(key.toLowerCase());
    const isDescriptor = allowedIds.has(key);
    if (!isAllowedName && !isDescriptor) {
      extras.push({ id: key, source: "headerValues" });
    }
  }
  return extras;
}

function buildDryRunReadback(input, includedInputs) {
  const { endpointScope } = input;
  const url = endpointScope.url || endpointScope.path || null;

  const headers = {};
  const bodyPreview = {};
  const queryPreview = {};

  for (const item of includedInputs) {
    const displayValue = item.secret ? REDACTED : item.value;
    if (item.place === "header") {
      // Map to allowed header name when possible
      const headerName =
        endpointScope.allowedHeaders.find((h) => h.toLowerCase() === item.id.toLowerCase()) ||
        item.id;
      // Only include if name is allowed OR allowedHeaders is empty (caller-declared via descriptor)
      const allowedEmpty = endpointScope.allowedHeaders.length === 0;
      const nameAllowed = endpointScope.allowedHeaders.some(
        (h) => h.toLowerCase() === headerName.toLowerCase(),
      );
      if (allowedEmpty || nameAllowed) {
        headers[headerName] = displayValue;
      }
    } else if (item.place === "query") {
      queryPreview[item.id] = displayValue;
    } else if (item.place === "path") {
      // Path params noted in bodyPreview under _path for dry-run visibility
      if (!bodyPreview._path) bodyPreview._path = {};
      bodyPreview._path[item.id] = displayValue;
    } else {
      bodyPreview[item.id] = displayValue;
    }
  }

  // Attach non-secret query to URL preview when url is absolute
  let urlOut = url;
  if (url && Object.keys(queryPreview).length > 0) {
    try {
      const u = new URL(url);
      for (const [k, v] of Object.entries(queryPreview)) {
        u.searchParams.set(k, v == null ? "" : String(v));
      }
      urlOut = u.toString();
    } catch {
      // path-only pattern: leave url as-is; query stays in bodyPreview._query
      bodyPreview._query = queryPreview;
    }
  } else if (!url || Object.keys(queryPreview).length > 0) {
    if (Object.keys(queryPreview).length > 0) bodyPreview._query = queryPreview;
  }

  // Strip empty helper containers
  if (bodyPreview._path && Object.keys(bodyPreview._path).length === 0) delete bodyPreview._path;

  return {
    method: endpointScope.method,
    url: urlOut,
    headers,
    bodyPreview,
  };
}

function rejectedEnvelope(rawInput, err, clock) {
  const taskId =
    isPlainObject(rawInput) && typeof rawInput.taskId === "string" && rawInput.taskId.trim()
      ? rawInput.taskId.trim()
      : null;
  return {
    schema: SCHEMA,
    taskId,
    generatedAt: new Date(clock()).toISOString(),
    status: PACK_STATUS.REJECTED,
    error: {
      code: err.code || ERROR_CODES.INVALID_INPUT,
      message: err.message,
      details: err.details ?? null,
    },
    endpointScope: null,
    includedInputs: [],
    excludedExtras: [],
    missingInputs: [],
    dryRunReadback: null,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    reuseFrom: [...REUSE_FROM],
    cap01Note: CAP01_NOT_HARD_DEP_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
  };
}

/**
 * Build buyer-controlled context pack.
 * Dry-run only — never makes network or paid calls.
 */
export function buildBuyerContextPack(rawInput, { clock = () => Date.now() } = {}) {
  let input;
  try {
    input = validateBuyerContextPackInput(rawInput);
  } catch (err) {
    if (err && err.code) {
      return rejectedEnvelope(rawInput, err, clock);
    }
    throw err;
  }

  const allowedIds = new Set(input.descriptors.map((d) => d.id));
  const excludedExtras = collectExcludedExtras(input, allowedIds);

  const includedInputs = [];
  const missingInputs = [];

  for (const desc of input.descriptors) {
    const { present, value } = lookupCallerValue(input, desc);

    if (!present) {
      if (desc.required) {
        missingInputs.push({
          id: desc.id,
          name: desc.name,
          kind: desc.kind,
          required: true,
          secret: desc.secret,
          place: desc.place,
          source: desc.source,
          notes: desc.notes || "Required by capability contract / requiredInputs but not in callerProvided",
        });
      }
      // Optional missing: omit from pack (do not invent)
      continue;
    }

    // Present but not allowed: treat as extra (should not happen if allowed defaults true)
    if (desc.allowed === false) {
      excludedExtras.push({ id: desc.id, source: "disallowed_descriptor" });
      continue;
    }

    includedInputs.push({
      id: desc.id,
      name: desc.name,
      kind: desc.kind,
      required: desc.required,
      secret: desc.secret,
      place: desc.place,
      source: desc.source,
      value: desc.secret ? undefined : value,
      valuePresent: true,
      valueRedacted: desc.secret === true,
    });
  }

  // Also drop headerValues that are not in allowedHeaders even if they match a descriptor —
  // if allowedHeaders is non-empty, enforce it for header place.
  if (input.endpointScope.allowedHeaders.length > 0) {
    const allowedHeaderNames = new Set(
      input.endpointScope.allowedHeaders.map((h) => h.toLowerCase()),
    );
    for (let i = includedInputs.length - 1; i >= 0; i -= 1) {
      const item = includedInputs[i];
      if (item.place !== "header") continue;
      if (!allowedHeaderNames.has(item.id.toLowerCase())) {
        // Keep if a matching allowed header name exists via alias? already checked by id.
        // Descriptor header id not in allowedHeaders → exclude from send set.
        excludedExtras.push({ id: item.id, source: "header_not_in_allowedHeaders" });
        // If it was required, surface as missing for the allowed send set
        if (item.required) {
          missingInputs.push({
            id: item.id,
            name: item.name,
            kind: item.kind,
            required: true,
            secret: item.secret,
            place: item.place,
            source: item.source,
            notes: "Header input present but name not listed in endpointScope.allowedHeaders",
          });
        }
        includedInputs.splice(i, 1);
      }
    }
  }

  let status = PACK_STATUS.READY;
  if (missingInputs.length > 0) {
    status = PACK_STATUS.PARTIAL_INPUT;
  }

  // Reconstruct values for dry-run (secrets → REDACTED)
  const includedForReadback = includedInputs.map((item) => {
    const { present, value } = lookupCallerValue(input, item);
    return {
      ...item,
      value: present ? value : undefined,
    };
  });

  const dryRunReadback = buildDryRunReadback(input, includedForReadback);

  // Guarantee secrets never appear in cleartext in readback
  for (const item of includedInputs) {
    if (!item.secret) continue;
    if (item.place === "header") {
      for (const [hk, hv] of Object.entries(dryRunReadback.headers)) {
        if (hk.toLowerCase() === item.id.toLowerCase() && hv !== REDACTED) {
          throw packError(ERROR_CODES.FORBIDDEN_CLAIM, `secret header ${item.id} leaked in readback`);
        }
      }
    } else if (item.place === "body") {
      if (
        hasOwn(dryRunReadback.bodyPreview, item.id) &&
        dryRunReadback.bodyPreview[item.id] !== REDACTED
      ) {
        throw packError(ERROR_CODES.FORBIDDEN_CLAIM, `secret body field ${item.id} leaked in readback`);
      }
    }
  }

  const out = {
    schema: SCHEMA,
    taskId: input.taskId,
    capabilityId: input.capabilityId,
    generatedAt: new Date(clock()).toISOString(),
    status,
    demo: input.demo === true,
    notes: input.notes,
    endpointScope: {
      method: input.endpointScope.method,
      url: input.endpointScope.url,
      path: input.endpointScope.path,
      allowedHeaders: [...input.endpointScope.allowedHeaders],
    },
    includedInputs: includedInputs.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      required: item.required,
      secret: item.secret,
      place: item.place,
      source: item.source,
      valuePresent: true,
      // Clear value only when not secret; secrets omit raw value
      ...(item.secret ? { value: REDACTED } : { value: lookupCallerValue(input, item).value }),
    })),
    excludedExtras,
    missingInputs,
    dryRunReadback,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    reuseFrom: [...REUSE_FROM],
    cap01Note: CAP01_NOT_HARD_DEP_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    consumerInstructions:
      "Supply taskId + (capabilityContract.inputs | requiredInputs) + callerProvided + endpointScope. " +
      "Run `node src/cli.mjs pack <input.json>`. Inspect dryRunReadback; secrets appear as [REDACTED]. " +
      "No network or paid calls are made.",
  };

  // Hard guarantee: never emit forbidden claim fields
  for (const key of ["buyerCount", "revenue", "rankingScore", "escrow", "custody", "claimAuthority"]) {
    if (hasOwn(out, key)) {
      throw packError(ERROR_CODES.FORBIDDEN_CLAIM, `${key} must not appear on pack`);
    }
  }

  return out;
}

export { REDACTED };
