import { PROVIDERS, SOURCE_TAGS } from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function readIdentity(raw) {
  if (!isPlainObject(raw)) {
    return {
      provider: null,
      jobRef: null,
      sharedEvidenceId: null,
      sourceTag: null,
      complete: false,
    };
  }
  const provider =
    typeof raw.provider === "string" && PROVIDERS.includes(raw.provider)
      ? raw.provider
      : null;
  const jobRef =
    typeof raw.jobRef === "string" && raw.jobRef.trim()
      ? raw.jobRef.trim()
      : null;
  const sharedEvidenceId =
    typeof raw.sharedEvidenceId === "string" && raw.sharedEvidenceId.trim()
      ? raw.sharedEvidenceId.trim()
      : null;
  const sourceTag =
    typeof raw.sourceTag === "string" && SOURCE_TAGS.includes(raw.sourceTag)
      ? raw.sourceTag
      : "catalog";
  return {
    provider,
    jobRef,
    sharedEvidenceId,
    sourceTag,
    complete: Boolean(provider && (jobRef || sharedEvidenceId)),
  };
}

/** Per-route refs so a shared caller namespace does not cartesian-join unrelated routes. */
export function namespacedRef(identity, routeKey, fallback) {
  const base = identity?.jobRef || identity?.sharedEvidenceId;
  if (!base || typeof routeKey !== "string" || !routeKey) return fallback;
  return `${base}:${routeKey}`;
}

/**
 * Source-compatible when DIST08 keys can align: matching sharedEvidenceId,
 * matching jobRef, or matching provider with a shared namespace.
 * Different providers with different jobRef/sharedEvidenceId must not join.
 * Grexal is never implied for an unrelated source.
 */
export function identitiesCompatible(a, b) {
  if (!a?.complete || !b?.complete) return false;
  if (
    a.sharedEvidenceId &&
    b.sharedEvidenceId &&
    a.sharedEvidenceId === b.sharedEvidenceId
  ) {
    return true;
  }
  if (a.jobRef && b.jobRef && a.jobRef === b.jobRef) {
    return a.provider === b.provider || Boolean(a.sharedEvidenceId && a.sharedEvidenceId === b.sharedEvidenceId);
  }
  if (a.provider && a.provider === b.provider && a.jobRef && a.jobRef === b.jobRef) {
    return true;
  }
  return false;
}

export function splitIdentities(input) {
  const top = readIdentity(input?.identity);
  const discovery = readIdentity(input?.discovery?.identity || input?.identity);
  const record = readIdentity(input?.record?.identity || input?.identity);
  return { top, discovery, record };
}
