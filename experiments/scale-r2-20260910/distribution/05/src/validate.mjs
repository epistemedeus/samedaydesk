import {
  EARNINGS_STATUS,
  ERROR_CODES,
  EVENT_KINDS,
  EVENTS_SCHEMA,
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  PROVIDERS,
  SUMMARY_SCHEMA,
  SUMMARY_STATUS,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function readbackError(code, message, details = null) {
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
    if (FORBIDDEN_CLAIM_FIELDS.includes(key)) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

function validateEvent(ev, index) {
  const path = `events[${index}]`;
  if (!isPlainObject(ev)) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  const kinds = Object.values(EVENT_KINDS);
  if (!kinds.includes(ev.kind)) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.kind must be one of ${kinds.join("|")}`,
      { got: ev.kind ?? null },
    );
  }
  const providers = Object.values(PROVIDERS);
  if (!providers.includes(ev.provider)) {
    throw readbackError(
      ERROR_CODES.FORBIDDEN_PROVIDER,
      `${path}.provider must be grexal|agensi (reject other marketplaces)`,
      { got: ev.provider ?? null },
    );
  }
  if (ev.evidenceRef !== undefined && ev.evidenceRef !== null) {
    if (typeof ev.evidenceRef !== "string" || !ev.evidenceRef.trim()) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.evidenceRef must be a non-empty string when set`,
      );
    }
  }

  // Earnings: no synthetic revenue; evidenceRef required; amount only if present in evidence
  if (ev.kind === EVENT_KINDS.EARNINGS) {
    if (ev.synthetic === true) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        `${path}: synthetic earnings forbidden (no invented revenue)`,
        { path, field: "synthetic" },
      );
    }
    if (typeof ev.evidenceRef !== "string" || !ev.evidenceRef.trim()) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        `${path}: earnings require evidenceRef (no invented amounts)`,
        { path, missing: ["evidenceRef"] },
      );
    }
    if (ev.amount !== undefined && ev.amount !== null) {
      if (!isPlainObject(ev.amount)) {
        throw readbackError(ERROR_CODES.INVALID_INPUT, `${path}.amount must be an object`);
      }
      if (typeof ev.amount.value !== "number" || !Number.isFinite(ev.amount.value)) {
        throw readbackError(
          ERROR_CODES.INVALID_INPUT,
          `${path}.amount.value must be a finite number when amount is set`,
        );
      }
      if (typeof ev.amount.currency !== "string" || !ev.amount.currency.trim()) {
        throw readbackError(
          ERROR_CODES.INVALID_INPUT,
          `${path}.amount.currency required when amount is set`,
        );
      }
    }
  } else if (ev.amount !== undefined && ev.amount !== null) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.amount is only allowed on earnings events`,
    );
  }

  if (ev.synthetic === true && ev.kind !== EVENT_KINDS.EARNINGS) {
    // synthetic fixtures for non-earnings event kinds are allowed for tests,
    // but must not invent money — already guarded above for earnings
  }
}

/**
 * Validate observed marketplace events document.
 * Rejects non-grexal/agensi providers and synthetic/invented earnings.
 */
export function validateEvents(raw) {
  if (!isPlainObject(raw)) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "events document must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== EVENTS_SCHEMA) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, `schema must be ${EVENTS_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }
  if (typeof raw.captureStatus !== "string") {
    throw readbackError(ERROR_CODES.MISSING_REQUIREMENT, "captureStatus required", {
      missing: ["captureStatus"],
    });
  }
  const allowedCapture = ["ok", "failed", "unavailable"];
  if (!allowedCapture.includes(raw.captureStatus)) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      `captureStatus must be one of ${allowedCapture.join(", ")}`,
      { got: raw.captureStatus },
    );
  }
  if (
    (raw.captureStatus === "failed" || raw.captureStatus === "unavailable") &&
    raw.forceNoUsers === true
  ) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable/failed capture must not be forced to no_users",
    );
  }
  if (!Array.isArray(raw.events)) {
    throw readbackError(ERROR_CODES.MISSING_REQUIREMENT, "events must be an array", {
      missing: ["events"],
    });
  }
  raw.events.forEach((e, i) => validateEvent(e, i));
  return raw;
}

/**
 * Validate a collected readback summary.
 * Enforces unavailable ≠ no_users and no invented earnings.
 */
export function validateSummary(raw) {
  if (!isPlainObject(raw)) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "summary must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== SUMMARY_SCHEMA) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, `schema must be ${SUMMARY_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  const statuses = Object.values(SUMMARY_STATUS);
  if (!statuses.includes(raw.status)) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      `status must be one of ${statuses.join(", ")}`,
      { got: raw.status ?? null },
    );
  }

  // Hard invariant: unavailable ≠ no_users
  if (raw.status === SUMMARY_STATUS.UNAVAILABLE) {
    if (Object.prototype.hasOwnProperty.call(raw, "installCount")) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable summary must not include installCount (unavailable ≠ no_users)",
      );
    }
    if (Object.prototype.hasOwnProperty.call(raw, "runCount")) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable summary must not include runCount (unavailable ≠ no_users)",
      );
    }
    if (raw.labels?.collapsedUnavailableAsNoUsers === true) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable capture must stay distinct from no_users",
      );
    }
  }
  if (raw.status === SUMMARY_STATUS.NO_USERS) {
    if (raw.installCount !== 0 && raw.installCount !== undefined) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        "no_users requires installCount===0 when set",
      );
    }
    if (raw.runCount !== 0 && raw.runCount !== undefined) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        "no_users requires runCount===0 when set",
      );
    }
  }

  if (raw.earnings) {
    if (!isPlainObject(raw.earnings)) {
      throw readbackError(ERROR_CODES.INVALID_INPUT, "earnings must be an object when set");
    }
    const eStatuses = Object.values(EARNINGS_STATUS);
    if (!eStatuses.includes(raw.earnings.status)) {
      throw readbackError(
        ERROR_CODES.INVALID_INPUT,
        `earnings.status must be one of ${eStatuses.join(", ")}`,
      );
    }
    if (raw.earnings.status === EARNINGS_STATUS.UNAVAILABLE) {
      if (Array.isArray(raw.earnings.amounts) && raw.earnings.amounts.length > 0) {
        throw readbackError(
          ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
          "unavailable earnings must not carry invented amounts",
        );
      }
      // Must not claim zero revenue as a stand-in for unavailable
      if (raw.earnings.zeroRevenueClaim === true) {
        throw readbackError(
          ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
          "unavailable earnings must not claim zero revenue",
        );
      }
    }
    if (raw.earnings.status === EARNINGS_STATUS.OBSERVED) {
      if (!Array.isArray(raw.earnings.amounts) || raw.earnings.amounts.length < 1) {
        throw readbackError(
          ERROR_CODES.INVALID_INPUT,
          "observed earnings require at least one amount from evidence",
        );
      }
      for (const amt of raw.earnings.amounts) {
        if (!amt?.evidenceRef) {
          throw readbackError(
            ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
            "observed earnings amounts require evidenceRef",
          );
        }
        if (amt.synthetic === true) {
          throw readbackError(
            ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
            "observed earnings must not be synthetic",
          );
        }
      }
    }
  }

  if (Array.isArray(raw.providersAccepted)) {
    for (const p of raw.providersAccepted) {
      if (!Object.values(PROVIDERS).includes(p)) {
        throw readbackError(
          ERROR_CODES.FORBIDDEN_PROVIDER,
          `summary must not accept provider ${p}`,
        );
      }
    }
  }

  return raw;
}
