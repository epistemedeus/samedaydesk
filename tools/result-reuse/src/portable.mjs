import { checkInputBounds } from "./limits.mjs";
import { exportContainsCredentialShape } from "./omit.mjs";
import {
  digestPublicInput,
  disallowedText,
  readBinding,
  readManifest,
  rejectingPrivate,
  resolveSavedObservation,
  verdictLimits,
} from "./export.mjs";

// A portable decision is a saved useful decision plus the public identity of the
// before-work manifest it was bound to. It is keyed by recipe, capture digest,
// prior digest and field list, never by taskId or subject, so a consumer with
// no shared Pilot state can check it against its own capture. It is opt-in and
// does not change the taskId/subject binding used by decide-or-reuse.
export const PORTABLE_SCHEMA = "samedaydesk.portable-decision.v1";
export const PORTABLE_EXPORT_MODE = "export-decision";
export const PORTABLE_IMPORT_MODE = "import-decision";
export const PORTABLE_RETIRE_MODE = "retire-decision";
export const PORTABLE_RIGHTS = Object.freeze({
  license: "CC0-1.0",
  dedication: "https://creativecommons.org/publicdomain/zero/1.0/",
  note: "public decision identity only; no warranty; not public-safe certified",
});
export const PORTABLE_REASONS = Object.freeze({
  invalidPortable: "invalid_portable",
  integrityMismatch: "integrity_mismatch",
  rightsMissing: "rights_missing",
  inputNotBeforeWork: "input_not_before_work",
  recipeChanged: "recipe_changed",
  captureDigestMismatch: "capture_digest_mismatch",
  priorDigestMismatch: "prior_digest_mismatch",
  fieldsMismatch: "fields_mismatch",
  retired: "retired",
  stale: "stale",
  staleUnverifiable: "stale_unverifiable",
  privateField: "private_field",
});
const LIFECYCLE_STATES = new Set(["active", "retired", "stale"]);

export function portableKey(manifest) {
  return {
    recipeId: manifest.recipeId,
    recipeVersion: manifest.recipeVersion,
    captureDigest: digestPublicInput(manifest.capture),
    priorDigest: digestPublicInput(manifest.prior),
    fieldsDigest: manifest.fields === undefined ? null : digestPublicInput(manifest.fields),
  };
}

export function exportPortableDecision(saved, manifest, options = {}) {
  if (options.optIn !== true) {
    return refusal(PORTABLE_EXPORT_MODE, "publishing a portable CC0 decision requires --opt-in");
  }
  if (!validInstant(options.createdAt)) {
    return refusal(PORTABLE_EXPORT_MODE, "--created-at must be an ISO-8601 instant");
  }
  if (options.staleAfter != null && !validInstant(options.staleAfter)) {
    return refusal(PORTABLE_EXPORT_MODE, "--stale-after must be an ISO-8601 instant");
  }
  for (const value of [manifest, saved]) {
    const bounds = checkInputBounds(value);
    if (!bounds.ok) return bounds;
  }
  if (rejectingPrivate(manifest) || disallowedText(manifest)) return privateRefusal(PORTABLE_EXPORT_MODE);
  const read = readManifest(manifest);
  if (!read.ok) return refusal(PORTABLE_EXPORT_MODE, read.message);
  const resolved = resolveSavedObservation(saved);
  if (!resolved.ok) return refusal(PORTABLE_EXPORT_MODE, resolved.message);
  const binding = readBinding(resolved.observation);
  if (!binding.ok) return refusal(PORTABLE_EXPORT_MODE, "saved observation is not a bound before-work decision");
  if (binding.binding.inputDigest !== digestPublicInput(manifest)) {
    return refusal(PORTABLE_EXPORT_MODE, "saved decision was not bound to this before-work manifest");
  }
  if (binding.binding.recipeId !== manifest.recipeId || binding.binding.recipeVersion !== manifest.recipeVersion) {
    return refusal(PORTABLE_EXPORT_MODE, "saved decision recipe does not match the before-work manifest");
  }
  const decision = structuredClone(binding.useful);
  if (rejectingPrivate(decision) || disallowedText(decision) || localPathIn(decision)) {
    return privateRefusal(PORTABLE_EXPORT_MODE);
  }
  const body = {
    schema: PORTABLE_SCHEMA,
    rights: { ...PORTABLE_RIGHTS },
    key: portableKey(manifest),
    publicIdentity: {
      captureUrl: manifest.capture.url,
      captureContentHash: manifest.capture.contentHash,
      priorSha256: manifest.prior.sha256,
      priorSequence: manifest.prior.sequence,
      priorCreatedAt: manifest.prior.createdAt,
    },
    decision,
    createdAt: options.createdAt,
    lifecycle: {
      state: "active",
      staleAfter: options.staleAfter ?? null,
      retiredAt: null,
      reason: null,
    },
    claims: {
      producerStateIncluded: false,
      localPathsIncluded: false,
      taskIdOrSubjectIncluded: false,
      publicSafeCertified: false,
      evidenceKind: "user_selected_unverified",
    },
  };
  const portable = seal(body);
  if (localPathIn(portable) || disallowedText(portable) || exportContainsCredentialShape(portable).length) {
    return privateRefusal(PORTABLE_EXPORT_MODE);
  }
  return { ok: true, mode: PORTABLE_EXPORT_MODE, producerInvoked: false, portable };
}

export function retirePortableDecision(portable, options = {}) {
  const valid = readPortable(portable);
  if (!valid.ok) return refusal(PORTABLE_RETIRE_MODE, valid.message);
  if (!validInstant(options.retiredAt)) return refusal(PORTABLE_RETIRE_MODE, "--retired-at must be an ISO-8601 instant");
  const state = options.state ?? "retired";
  if (state !== "retired" && state !== "stale") return refusal(PORTABLE_RETIRE_MODE, "retire state must be retired or stale");
  const reason = typeof options.reason === "string" ? options.reason.trim() : "";
  if (!reason || reason.length > 280 || disallowedText(reason) || localPathIn(reason)) {
    return refusal(PORTABLE_RETIRE_MODE, "--reason must be short public text");
  }
  const body = structuredClone(portable);
  delete body.integrity;
  body.lifecycle = { ...body.lifecycle, state, retiredAt: options.retiredAt, reason };
  return { ok: true, mode: PORTABLE_RETIRE_MODE, producerInvoked: false, portable: seal(body) };
}

// Import never runs, loads or names a producer. A hit returns the saved decision.
// Any mismatch returns recompute and leaves recomputing to the caller.
export function importPortableDecision(portable, manifest, options = {}) {
  for (const value of [manifest, portable]) {
    const bounds = checkInputBounds(value);
    if (!bounds.ok) return bounds;
  }
  const valid = readPortable(portable);
  if (!valid.ok) return recompute(valid.reason, valid.message);
  if (rejectingPrivate(manifest) || disallowedText(manifest)) {
    return recompute(PORTABLE_REASONS.privateField, "before-work manifest carries a private field");
  }
  const read = readManifest(manifest);
  if (!read.ok) return recompute(PORTABLE_REASONS.inputNotBeforeWork, read.message);
  const lifecycle = portable.lifecycle;
  if (lifecycle.state === "retired") {
    return recompute(PORTABLE_REASONS.retired, "portable decision was retired by its publisher", { retiredAt: lifecycle.retiredAt });
  }
  if (lifecycle.state === "stale") {
    return recompute(PORTABLE_REASONS.stale, "portable decision was marked stale by its publisher", { retiredAt: lifecycle.retiredAt });
  }
  if (lifecycle.staleAfter != null) {
    if (!validInstant(options.clock)) {
      return recompute(PORTABLE_REASONS.staleUnverifiable, "portable decision has staleAfter and no --clock was supplied");
    }
    if (Date.parse(options.clock) >= Date.parse(lifecycle.staleAfter)) {
      return recompute(PORTABLE_REASONS.stale, "portable decision is past its staleAfter instant");
    }
  }
  const mine = portableKey(manifest);
  const theirs = portable.key;
  if (mine.recipeId !== theirs.recipeId || mine.recipeVersion !== theirs.recipeVersion) {
    return recompute(PORTABLE_REASONS.recipeChanged, "recipe id or version does not match the portable decision", { key: mine });
  }
  if (mine.captureDigest !== theirs.captureDigest) {
    return recompute(PORTABLE_REASONS.captureDigestMismatch, "capture digest does not match the portable decision", { key: mine });
  }
  if (mine.priorDigest !== theirs.priorDigest) {
    return recompute(PORTABLE_REASONS.priorDigestMismatch, "prior digest does not match the portable decision", { key: mine });
  }
  if (mine.fieldsDigest !== theirs.fieldsDigest) {
    return recompute(PORTABLE_REASONS.fieldsMismatch, "field list does not match the portable decision", { key: mine });
  }
  return {
    ok: true,
    mode: PORTABLE_IMPORT_MODE,
    verdict: "reuse",
    decision: structuredClone(portable.decision),
    key: mine,
    rights: portable.rights,
    createdAt: portable.createdAt,
    integrity: portable.integrity,
    producerInvoked: false,
    ...verdictLimits(mine.recipeId),
  };
}

export function readPortable(portable) {
  const invalid = (message) => ({ ok: false, reason: PORTABLE_REASONS.invalidPortable, message });
  if (!portable || typeof portable !== "object" || Array.isArray(portable)) return invalid("portable decision must be an object");
  if (portable.schema !== PORTABLE_SCHEMA) return invalid(`portable decision schema must be ${PORTABLE_SCHEMA}`);
  if (portable.rights?.license !== PORTABLE_RIGHTS.license) {
    return { ok: false, reason: PORTABLE_REASONS.rightsMissing, message: "portable decision does not carry a CC0-1.0 rights field" };
  }
  const key = portable.key;
  if (!key || typeof key !== "object") return invalid("portable decision is missing its key");
  for (const name of ["recipeId", "recipeVersion", "captureDigest", "priorDigest"]) {
    if (typeof key[name] !== "string" || key[name] === "") return invalid(`portable decision key is missing ${name}`);
  }
  if (key.fieldsDigest !== null && typeof key.fieldsDigest !== "string") return invalid("portable decision key has an invalid fieldsDigest");
  if (!validInstant(portable.createdAt)) return invalid("portable decision is missing createdAt");
  if (!portable.lifecycle || !LIFECYCLE_STATES.has(portable.lifecycle.state)) return invalid("portable decision is missing its lifecycle marker");
  const decision = portable.decision;
  if (!decision || typeof decision !== "object" || decision.recipeId !== key.recipeId || decision.recipeVersion !== key.recipeVersion) {
    return invalid("portable decision body does not match its key");
  }
  if (typeof portable.integrity?.bodyDigest !== "string") return invalid("portable decision is missing its integrity digest");
  const body = { ...portable };
  delete body.integrity;
  if (digestPublicInput(body) !== portable.integrity.bodyDigest) {
    return { ok: false, reason: PORTABLE_REASONS.integrityMismatch, message: "portable decision body digest does not match" };
  }
  if (rejectingPrivate(portable) || disallowedText(portable) || localPathIn(portable)) {
    return { ok: false, reason: PORTABLE_REASONS.privateField, message: "portable decision carries a private field or local path" };
  }
  return { ok: true };
}

function seal(body) {
  return { ...body, integrity: { bodyDigest: digestPublicInput(body), note: "corruption check only; not a signature" } };
}

// Stricter than the shared filesystem-path check: a portable file names no
// local path at all, absolute, relative, home or file URL.
export function localPathIn(value) {
  if (typeof value === "string") {
    return /^(?:\/|\.{1,2}\/|~\/|file:)/i.test(value) || /^[A-Za-z]:[\\/]/.test(value);
  }
  if (Array.isArray(value)) return value.some(localPathIn);
  if (value && typeof value === "object") return Object.values(value).some(localPathIn);
  return false;
}

function validInstant(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function recompute(reason, message, extra = {}) {
  return {
    ok: true,
    mode: PORTABLE_IMPORT_MODE,
    verdict: "recompute",
    reason,
    message,
    producerInvoked: false,
    ...extra,
    ...verdictLimits(null),
  };
}

function refusal(mode, message) {
  return { ok: false, mode, message };
}

function privateRefusal(mode) {
  return { ok: false, mode, reason: PORTABLE_REASONS.privateField, message: "refusing a portable decision because a private field or local path is present" };
}
