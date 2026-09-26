/**
 * Explicit trust boundary for town-square content.
 * Supplied JSON/text is data only. Payload fields are never executed or ranked.
 */

import { LIMITS, TRUST } from "./constants.mjs";
import { townError } from "./cursor.mjs";

const CREDENTIAL_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "password",
  "secret",
  "apiKey",
  "privateKey",
  "grant",
]);

export function assertTrustLabel(trust) {
  if (trust !== TRUST.fixture && trust !== TRUST.supplied_unverified) {
    throw townError("invalid_trust", "trust must be fixture or supplied-unverified");
  }
  return trust;
}

export function clampLimit(limit, fallback = LIMITS.pageDefault) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LIMITS.pageMax, Math.max(1, Math.trunc(n)));
}

export function assertBoundedText(value, field = "text") {
  if (typeof value !== "string") {
    throw townError("invalid_input", `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw townError("invalid_input", `${field} is required`);
  if (trimmed.length > LIMITS.textMax) {
    throw townError("bounded_input", `${field} exceeds ${LIMITS.textMax} characters`);
  }
  return trimmed;
}

export function assertId(value, field = "id") {
  const text = assertBoundedText(value, field);
  if (text.length > LIMITS.idMax) {
    throw townError("bounded_input", `${field} exceeds ${LIMITS.idMax} characters`);
  }
  if (!/^[A-Za-z0-9_.:~-]+$/.test(text)) {
    throw townError("invalid_input", `${field} has unsupported characters`);
  }
  return text;
}

/**
 * Evidence URLs are references only. Never fetched or executed by this module.
 */
export function sanitizeEvidence(evidence) {
  if (evidence == null) return null;
  if (typeof evidence !== "object" || Array.isArray(evidence)) {
    throw townError("invalid_input", "evidence must be an object");
  }
  const uri = evidence.uri;
  if (typeof uri !== "string") throw townError("invalid_input", "evidence.uri is required");
  let url;
  try {
    url = new URL(uri.trim());
  } catch {
    throw townError("invalid_evidence", "evidence.uri must be an absolute http(s) URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw townError("invalid_evidence", "evidence.uri must be http(s)");
  }
  if (url.username || url.password) {
    throw townError("invalid_evidence", "evidence.uri must not embed credentials");
  }
  if (url.href.length > LIMITS.uriMax) {
    throw townError("bounded_input", "evidence.uri exceeds length limit");
  }
  const version = assertBoundedText(evidence.version ?? "unversioned", "evidence.version");
  if (version.length > 256) throw townError("bounded_input", "evidence.version too long");
  const label =
    evidence.label == null ? null : assertBoundedText(String(evidence.label), "evidence.label");
  return {
    uri: url.href,
    version,
    label,
    fetch: false,
    execute: false,
  };
}

/** Recursively refuse credential-shaped keys in supplied objects. */
export function refuseCredentialFields(value, path = "$") {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => refuseCredentialFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEYS.has(key)) {
      throw townError("credential_refused", `credential field refused at ${path}.${key}`);
    }
    refuseCredentialFields(child, `${path}.${key}`);
  }
}

/**
 * Treat embedded instruction-like text as ordinary data.
 * Returns a redaction mark for observers; never interprets the text as commands.
 */
export function markHostileAsData(text) {
  const patterns = [
    /ignore (all |previous |prior )?instructions/i,
    /system\s*:/i,
    /<\s*script\b/i,
    /\bdo not follow\b.*\boperator\b/i,
  ];
  const hits = patterns.filter((re) => re.test(text)).length;
  return {
    treatedAsData: true,
    instructionLike: hits > 0,
    execute: false,
  };
}

export function safeEvidenceHref(raw) {
  try {
    const evidence = sanitizeEvidence({ uri: raw, version: "link" });
    return evidence.uri.startsWith("https:") ? evidence.uri : null;
  } catch {
    return null;
  }
}

export function setText(node, value) {
  if (!node) return;
  node.textContent = value == null ? "" : String(value);
}

export function clone(value) {
  return structuredClone(value);
}
