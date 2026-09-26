/**
 * R2-CAPABILITIES-06: Partial delivery composition.
 * Combine parts only when schema, scope, and freshness support the job.
 * Preserve holes — never invent fill. Own-property payload keys only.
 */

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function ownPayloadEntries(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(Object.getOwnPropertyDescriptors(payload))
    .filter(([k, d]) => !BLOCKED_KEYS.has(k) && d.enumerable)
    .map(([k, d]) => [k, d.value]);
}

function hasOwnPresent(obj, key) {
  if (BLOCKED_KEYS.has(key)) return false;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return false;
  return obj[key] !== null && obj[key] !== undefined;
}

/**
 * @param {object} input
 * @param {object} input.job - { schema, scope, freshnessRequired?, requiredFields? }
 * @param {object[]} input.parts - [{ id, schema, scope, freshness, payload, status? }]
 */
export function composePartial(input = {}) {
  const job = asObject(input.job, "job");
  const parts = Array.isArray(input.parts) ? input.parts : null;
  if (!parts) throw new Error("parts must be an array");

  const gaps = [];
  // Trim before empty→null so whitespace-only schema/scope is diagnostic-missing.
  const jobSchemaRaw = job.schema;
  const jobScopeRaw = job.scope;
  const jobSchemaTrimmed =
    jobSchemaRaw == null ? "" : String(jobSchemaRaw).trim();
  const jobScopeTrimmed = jobScopeRaw == null ? "" : String(jobScopeRaw).trim();
  const jobSchema = jobSchemaTrimmed === "" ? null : jobSchemaTrimmed;
  const jobScope = jobScopeTrimmed === "" ? null : jobScopeTrimmed;

  if (jobSchema == null) {
    gaps.push({
      kind: "job-schema-missing",
      reason: "job.schema missing (null/empty/whitespace); not treated as universal compatibility",
    });
  }
  if (jobScope == null) {
    gaps.push({
      kind: "job-scope-missing",
      reason: "job.scope missing (null/empty/whitespace); not treated as universal compatibility",
    });
  }

  const freshnessRequired = job.freshnessRequired == null ? null : job.freshnessRequired;
  const requiredFields = Array.isArray(job.requiredFields) ? job.requiredFields.map(String) : [];

  /** Explicit successful part.status values only. Absent/unknown/running/typo/completed are holes. */
  const SUCCESS_STATUS = new Set(["complete"]);

  const accepted = [];
  const rejected = [];
  const composed = Object.create(null);

  for (const [i, part] of parts.entries()) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      rejected.push({ index: i, reasons: ["part is not an object"] });
      continue;
    }
    const id = String(part.id || `part-${i}`);
    const reasons = [];

    const rawStatus = part.status;
    const partStatus =
      rawStatus == null || rawStatus === ""
        ? null
        : String(rawStatus).trim();
    if (partStatus == null) {
      reasons.push("part.status missing; explicit status complete required (supplied assertion, not attestation)");
    } else if (!SUCCESS_STATUS.has(partStatus)) {
      reasons.push(
        `part.status=${partStatus} not eligible for composition (require complete; failed|partial|rejected|unknown|running|completed|typos remain holes)`,
      );
    }

    const partSchema =
      part.schema == null ? null : String(part.schema).trim() || null;
    const partScope = part.scope == null ? null : String(part.scope).trim() || null;

    if (jobSchema == null) {
      reasons.push("job.schema missing; cannot match part");
    } else if (!partSchema) {
      reasons.push("schema missing on part");
    } else if (partSchema !== jobSchema) {
      reasons.push(`schema mismatch: part=${part.schema} job=${jobSchema}`);
    }

    if (jobScope == null) {
      reasons.push("job.scope missing; cannot match part");
    } else if (!partScope) {
      reasons.push("scope missing on part");
    } else if (partScope !== jobScope) {
      reasons.push(`scope mismatch: part=${part.scope} job=${jobScope}`);
    }

    if (freshnessRequired != null) {
      if (part.freshness == null || part.freshness === "") {
        reasons.push("freshness missing on part");
      } else {
        const fr = freshnessSupports(part.freshness, freshnessRequired);
        if (fr.ok !== true) {
          reasons.push(fr.reason || `freshness gap: part=${stringifyFresh(part.freshness)}`);
        }
      }
    }

    if (reasons.length) {
      rejected.push({ id, reasons });
      gaps.push({ kind: "part-rejected", id, reasons });
      continue;
    }
    accepted.push(id);
    for (const [k, v] of ownPayloadEntries(part.payload)) {
      if (composed[k] === undefined) composed[k] = v;
      else if (JSON.stringify(composed[k]) !== JSON.stringify(v)) {
        gaps.push({
          kind: "field-conflict",
          field: k,
          reason: "conflicting values across accepted parts; left first value, conflict retained",
          values: [composed[k], v],
        });
      }
    }
  }

  const missingFields = requiredFields.filter((f) => !hasOwnPresent(composed, f));
  for (const f of missingFields) {
    gaps.push({
      kind: "missing-field",
      field: f,
      reason: "required by job; not supplied as a non-null own property by accepted parts",
    });
  }

  const holeIds = rejected.map((r) => r.id).filter(Boolean);

  let status = "complete";
  if (gaps.length || missingFields.length || rejected.length) status = "partial";
  if (accepted.length === 0) status = "empty";
  // Failed/partial/rejected part.status forces non-complete even if other parts filled fields.
  if (rejected.some((r) => (r.reasons || []).some((x) => String(x).includes("part.status=")))) {
    if (accepted.length === 0) status = "empty";
    else status = "partial";
  }

  const payload = Object.create(null);
  for (const k of Reflect.ownKeys(composed)) {
    if (typeof k !== "string" || BLOCKED_KEYS.has(k)) continue;
    payload[k] = composed[k];
  }

  return {
    schema: "s138.partial-composition.v1",
    capabilityId: "R2-CAPABILITIES-06",
    job: {
      schema: jobSchema,
      scope: jobScope,
      freshnessRequired: freshnessRequired || null,
      requiredFields,
    },
    status,
    acceptedParts: accepted,
    rejectedParts: rejected,
    payload,
    gaps,
    holes: holeIds,
    notes: [
      "Gaps are retained; composition does not invent fill.",
      "part.status must be explicit complete; absent/unknown/running/failed/partial/completed/typos remain holes.",
      "part.status failed|partial|rejected is excluded.",
      "Explicit complete is a supplied assertion, not attested execution.",
      "null/undefined required fields are missing; prototype keys are ignored.",
      "Missing or whitespace-only job.schema/job.scope is diagnostic missing, not universal compatibility.",
      "Missing job.schema or job.scope is not universal compatibility.",
    ],
  };
}

function stringifyFresh(f) {
  if (typeof f === "string") return f;
  try {
    return JSON.stringify(f);
  } catch {
    return String(f);
  }
}

/**
 * @returns {{ok:boolean, reason?:string}}
 */
export function freshnessSupports(partFresh, required) {
  if (required == null) return { ok: true };

  if (typeof required === "object" && !Array.isArray(required)) {
    if (Object.prototype.hasOwnProperty.call(required, "maxAgeSeconds")) {
      const max = required.maxAgeSeconds;
      if (typeof max !== "number" || !Number.isFinite(max) || max < 0) {
        return { ok: false, reason: "freshnessRequired.maxAgeSeconds invalid (need finite >= 0)" };
      }
      const age = partFresh && typeof partFresh === "object" ? partFresh.ageSeconds : null;
      if (typeof age !== "number" || !Number.isFinite(age) || age < 0) {
        return { ok: false, reason: "part.freshness.ageSeconds invalid (need finite >= 0)" };
      }
      return age <= max
        ? { ok: true }
        : { ok: false, reason: `freshness age ${age} exceeds maxAgeSeconds ${max}` };
    }
    if (required.asOf) {
      const asOf = Date.parse(String(required.asOf));
      if (Number.isNaN(asOf)) {
        return { ok: false, reason: "freshnessRequired.asOf is not a valid time" };
      }
      const captured =
        partFresh && typeof partFresh === "object" ? Date.parse(String(partFresh.capturedAt || "")) : NaN;
      if (Number.isNaN(captured)) {
        return { ok: false, reason: "part.freshness.capturedAt missing/invalid" };
      }
      return captured >= asOf
        ? { ok: true }
        : { ok: false, reason: `capturedAt before required asOf` };
    }
    return { ok: false, reason: "freshnessRequired object missing maxAgeSeconds or asOf" };
  }

  if (typeof partFresh === "string" && typeof required === "string") {
    const a = Date.parse(partFresh);
    const b = Date.parse(required);
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      return a >= b ? { ok: true } : { ok: false, reason: "part timestamp before required as-of" };
    }
    if (required === "any") return { ok: true };
    if (required === "fresh") {
      return partFresh === "fresh"
        ? { ok: true }
        : { ok: false, reason: `required fresh, got ${partFresh}` };
    }
    return partFresh === required
      ? { ok: true }
      : { ok: false, reason: `freshness token mismatch part=${partFresh} required=${required}` };
  }

  return { ok: false, reason: "freshness comparison unsupported for given shapes" };
}
