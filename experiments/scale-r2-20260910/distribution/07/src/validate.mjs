import {
  ERROR_CODES,
  FORBIDDEN_BROADCAST_FIELDS,
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  PACKET_SCHEMA,
  PACKET_STATUS,
  REQUEST_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function packetError(code, message, details = null) {
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
      throw packetError(
        ERROR_CODES.FORBIDDEN_BROADCAST,
        `Forbidden unsolicited broadcast field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_CLAIM_FIELDS.includes(key)) {
      throw packetError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw packetError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

/**
 * Validate a verified-request input document (build input).
 * Soft-missing core ids become blocked_missing_input in build;
 * hard rejects (broadcast, revenue claims, secrets) throw.
 */
export function validateRequest(raw, { softMissing = false } = {}) {
  if (!isPlainObject(raw)) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "request document must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== REQUEST_SCHEMA) {
    throw packetError(ERROR_CODES.INVALID_INPUT, `schema must be ${REQUEST_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }

  const missing = [];

  if (typeof raw.requestId !== "string" || !raw.requestId.trim()) {
    missing.push("requestId");
  }
  if (typeof raw.requesterId !== "string" || !raw.requesterId.trim()) {
    missing.push("requesterId");
  }
  if (typeof raw.problemSummary !== "string" || !raw.problemSummary.trim()) {
    missing.push("problemSummary");
  }

  if (typeof raw.captureStatus !== "string") {
    if (softMissing) missing.push("captureStatus");
    else {
      throw packetError(ERROR_CODES.MISSING_REQUIREMENT, "captureStatus required", {
        missing: ["captureStatus"],
      });
    }
  } else {
    const allowedCapture = ["ok", "failed", "unavailable"];
    if (!allowedCapture.includes(raw.captureStatus)) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        `captureStatus must be one of ${allowedCapture.join(", ")}`,
        { got: raw.captureStatus },
      );
    }
    if (
      (raw.captureStatus === "failed" || raw.captureStatus === "unavailable") &&
      raw.forceNoUsers === true
    ) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable/failed capture must not be forced to no_users",
      );
    }
  }

  // Booleans required for ready/kill path when capture is ok
  if (raw.captureStatus === "ok") {
    if (typeof raw.unresolved !== "boolean") {
      if (softMissing) missing.push("unresolved");
      else {
        throw packetError(ERROR_CODES.MISSING_REQUIREMENT, "unresolved boolean required", {
          missing: ["unresolved"],
        });
      }
    }
    if (typeof raw.requesterAlreadyHasFix !== "boolean") {
      if (softMissing) missing.push("requesterAlreadyHasFix");
      else {
        throw packetError(
          ERROR_CODES.MISSING_REQUIREMENT,
          "requesterAlreadyHasFix boolean required",
          { missing: ["requesterAlreadyHasFix"] },
        );
      }
    }
  }

  if (missing.length) {
    throw packetError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `missing required inputs: ${missing.join(", ")}`,
      { missing },
    );
  }

  return raw;
}

/**
 * Validate a built counterparty handoff packet.
 * Enforces kill-path empty runCommands, unavailable ≠ no_users, no revenue claims.
 */
export function validatePacket(raw) {
  if (!isPlainObject(raw)) {
    throw packetError(ERROR_CODES.INVALID_INPUT, "packet must be a plain object");
  }
  rejectForbidden(raw);

  if (raw.schema !== PACKET_SCHEMA) {
    throw packetError(ERROR_CODES.INVALID_INPUT, `schema must be ${PACKET_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }

  const statuses = Object.values(PACKET_STATUS);
  if (!statuses.includes(raw.status)) {
    throw packetError(
      ERROR_CODES.INVALID_INPUT,
      `status must be one of ${statuses.join(", ")}`,
      { got: raw.status ?? null },
    );
  }

  // Hard invariant: unavailable ≠ no_users
  if (raw.status === PACKET_STATUS.UNAVAILABLE) {
    if (Object.prototype.hasOwnProperty.call(raw, "requesterCount")) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable packet must not include requesterCount (unavailable ≠ no_users)",
      );
    }
    if (raw.labels?.collapsedUnavailableAsNoUsers === true) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable capture must stay distinct from no_users",
      );
    }
    if (Array.isArray(raw.runCommands) && raw.runCommands.length > 0) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable packet must not emit executable runCommands",
      );
    }
  }

  if (raw.status === PACKET_STATUS.NO_USERS) {
    if (raw.requesterCount !== 0 && raw.requesterCount !== undefined) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "no_users requires requesterCount===0 when set",
      );
    }
    if (Array.isArray(raw.runCommands) && raw.runCommands.length > 0) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "no_users packet must not emit executable runCommands",
      );
    }
  }

  // Kill path: never produce executable handoff commands
  if (raw.status === PACKET_STATUS.KILLED_REQUESTER_HAS_FIX) {
    if (!Array.isArray(raw.runCommands) || raw.runCommands.length !== 0) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "killed_requester_has_fix must have empty runCommands[]",
      );
    }
    if (raw.killReason == null || typeof raw.killReason !== "string") {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "killed_requester_has_fix requires killReason",
      );
    }
  }

  if (raw.status === PACKET_STATUS.READY_HANDOFF) {
    if (!isPlainObject(raw.artifactRef)) {
      throw packetError(ERROR_CODES.INVALID_INPUT, "ready_handoff requires artifactRef");
    }
    if (!Array.isArray(raw.runCommands) || raw.runCommands.length < 1) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "ready_handoff requires non-empty runCommands[]",
      );
    }
    if (!Array.isArray(raw.acceptanceChecks) || raw.acceptanceChecks.length < 1) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "ready_handoff requires acceptanceChecks[]",
      );
    }
    if (!isPlainObject(raw.privacyBounds)) {
      throw packetError(ERROR_CODES.INVALID_INPUT, "ready_handoff requires privacyBounds");
    }
    if (raw.artifactRef.customerExecutionRevenuePayout === true) {
      throw packetError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        "artifactRef must not claim customerExecutionRevenuePayout",
      );
    }
  }

  if (raw.status === PACKET_STATUS.BLOCKED_MISSING_INPUT) {
    if (!Array.isArray(raw.missingInputs) || raw.missingInputs.length < 1) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "blocked_missing_input requires missingInputs[]",
      );
    }
    if (Array.isArray(raw.runCommands) && raw.runCommands.length > 0) {
      throw packetError(
        ERROR_CODES.INVALID_INPUT,
        "blocked_missing_input must not emit executable runCommands",
      );
    }
  }

  return raw;
}
