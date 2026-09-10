import {
  CAPTURE_OUTCOME,
  ENTRIES_SCHEMA,
  ERROR_CODES,
  EVENT_KINDS,
  EVENTS_SCHEMA,
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_INTENT_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  OPAQUE_TAG_KEY_RE,
  OPAQUE_TAG_VALUE_RE,
  SIGNAL_SCHEMA,
  SOURCE_TAGS,
  TAGGED_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function linkError(code, message, details = null) {
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
    if (FORBIDDEN_INTENT_FIELDS.includes(key)) {
      throw linkError(
        ERROR_CODES.FORBIDDEN_INTENT,
        `Forbidden intent-equating field: ${key} (activation ≠ buyer intent)`,
        { path: here, field: key },
      );
    }
    if (FORBIDDEN_CLAIM_FIELDS.includes(key)) {
      throw linkError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue/traffic field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw linkError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

function isValidHref(href) {
  if (typeof href !== "string" || !href.trim()) return false;
  // Absolute http(s) URL or relative path starting with /
  if (href.startsWith("/")) return href.length > 1 || href === "/";
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateEntry(entry, index) {
  const path = `entries[${index}]`;
  if (!isPlainObject(entry)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  if (typeof entry.id !== "string" || !entry.id.trim()) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `${path}.id must be a non-empty string`);
  }
  if (typeof entry.label !== "string" || !entry.label.trim()) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `${path}.label must be a non-empty string`);
  }
  if (!isValidHref(entry.href)) {
    throw linkError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.href must be an http(s) URL or absolute path`,
      { got: entry.href ?? null },
    );
  }
  if (entry.source !== undefined && entry.source !== null) {
    const allowed = Object.values(SOURCE_TAGS);
    if (!allowed.includes(entry.source)) {
      throw linkError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.source must be one of ${allowed.join("|")}`,
        { got: entry.source },
      );
    }
  }
  if (entry.opaqueTags !== undefined) {
    if (!isPlainObject(entry.opaqueTags)) {
      throw linkError(ERROR_CODES.INVALID_INPUT, `${path}.opaqueTags must be an object when set`);
    }
    for (const [k, v] of Object.entries(entry.opaqueTags)) {
      if (!OPAQUE_TAG_KEY_RE.test(k)) {
        throw linkError(ERROR_CODES.INVALID_INPUT, `${path}.opaqueTags key invalid: ${k}`);
      }
      if (typeof v !== "string" || !OPAQUE_TAG_VALUE_RE.test(v)) {
        throw linkError(ERROR_CODES.INVALID_INPUT, `${path}.opaqueTags.${k} value invalid`);
      }
      if (k === "source") {
        throw linkError(
          ERROR_CODES.INVALID_INPUT,
          `${path}.opaqueTags must not override reserved key 'source'`,
        );
      }
    }
  }
}

/**
 * Validate product entry inventory. Throws on malformed / forbidden.
 * Missing source on an entry is handled as partial by tagEntries.
 */
export function validateEntries(raw) {
  if (!isPlainObject(raw)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "entries document must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== ENTRIES_SCHEMA) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `schema must be ${ENTRIES_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }
  if (!Array.isArray(raw.entries)) {
    throw linkError(ERROR_CODES.MISSING_REQUIREMENT, "entries must be an array", {
      missing: ["entries"],
    });
  }
  if (raw.entries.length < 1) {
    throw linkError(ERROR_CODES.MISSING_REQUIREMENT, "entries must be non-empty", {
      missing: ["entries"],
    });
  }
  raw.entries.forEach((e, i) => validateEntry(e, i));
  return raw;
}

export function validateTaggedLinks(raw) {
  if (!isPlainObject(raw)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "tagged links must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== TAGGED_SCHEMA) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `schema must be ${TAGGED_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.status !== "string" || !raw.status) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "tagged.status required");
  }
  if (!Array.isArray(raw.links)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "tagged.links must be an array");
  }
  for (const link of raw.links) {
    if (link?.sourceTag && !Object.values(SOURCE_TAGS).includes(link.sourceTag)) {
      throw linkError(ERROR_CODES.INVALID_INPUT, `invalid sourceTag: ${link.sourceTag}`);
    }
    if (link?.impliesBuyerIntent === true || link?.equatesActivationWithIntent === true) {
      throw linkError(
        ERROR_CODES.FORBIDDEN_INTENT,
        "tagged link must not claim buyer intent from activation",
      );
    }
  }
  return raw;
}

export function validateSignal(raw) {
  if (!isPlainObject(raw)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "signal must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== SIGNAL_SCHEMA) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `schema must be ${SIGNAL_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.captureStatus !== "string") {
    throw linkError(ERROR_CODES.MISSING_REQUIREMENT, "captureStatus required", {
      missing: ["captureStatus"],
    });
  }
  const allowedCapture = ["ok", "failed", "unavailable"];
  if (!allowedCapture.includes(raw.captureStatus)) {
    throw linkError(
      ERROR_CODES.INVALID_INPUT,
      `captureStatus must be one of ${allowedCapture.join(", ")}`,
      { got: raw.captureStatus },
    );
  }
  if (raw.activations !== undefined && !Array.isArray(raw.activations)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "activations must be an array when set");
  }
  if (raw.presentations !== undefined && !Array.isArray(raw.presentations)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "presentations must be an array when set");
  }
  // Hard: capture failed/unavailable must not claim zero activations as no_users
  if (
    (raw.captureStatus === "failed" || raw.captureStatus === "unavailable") &&
    raw.forceNoUsers === true
  ) {
    throw linkError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable/failed capture must not be forced to no_users",
    );
  }
  return raw;
}

export function validateResultEvents(raw) {
  if (!isPlainObject(raw)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "result events must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== EVENTS_SCHEMA) {
    throw linkError(ERROR_CODES.INVALID_INPUT, `schema must be ${EVENTS_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  const outcomes = Object.values(CAPTURE_OUTCOME);
  if (!outcomes.includes(raw.outcome)) {
    throw linkError(
      ERROR_CODES.INVALID_INPUT,
      `outcome must be one of ${outcomes.join(", ")}`,
      { got: raw.outcome ?? null },
    );
  }
  // Hard invariant: unavailable ≠ no_users
  if (raw.outcome === CAPTURE_OUTCOME.UNAVAILABLE) {
    if (Object.prototype.hasOwnProperty.call(raw, "activationCount")) {
      throw linkError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable outcome must not include activationCount (unavailable ≠ no_users)",
      );
    }
    if (raw.labels?.collapsedUnavailableAsNoUsers === true) {
      throw linkError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable capture must stay distinct from no_users",
      );
    }
  }
  if (raw.outcome === CAPTURE_OUTCOME.NO_USERS) {
    if (raw.activationCount !== 0 && raw.activationCount !== undefined) {
      throw linkError(
        ERROR_CODES.INVALID_INPUT,
        "no_users requires activationCount===0 when set",
      );
    }
  }
  if (Array.isArray(raw.events)) {
    for (const ev of raw.events) {
      if (ev?.kind && !Object.values(EVENT_KINDS).includes(ev.kind)) {
        throw linkError(ERROR_CODES.INVALID_INPUT, `invalid event kind: ${ev.kind}`);
      }
      if (ev?.buyerIntent !== undefined || ev?.purchaseIntent !== undefined) {
        throw linkError(
          ERROR_CODES.FORBIDDEN_INTENT,
          "result events must not carry buyerIntent/purchaseIntent",
        );
      }
      if (ev?.impliesBuyerIntent === true) {
        throw linkError(
          ERROR_CODES.FORBIDDEN_INTENT,
          "event must not set impliesBuyerIntent",
        );
      }
    }
  }
  if (raw.claims?.activationEqualsBuyerIntent === true) {
    throw linkError(
      ERROR_CODES.FORBIDDEN_INTENT,
      "claims.activationEqualsBuyerIntent forbidden",
    );
  }
  return raw;
}
