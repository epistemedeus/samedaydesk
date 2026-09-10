/**
 * Optional prior loading for issue-evidence.
 * Present priors stay immutable. Absent prior means first observation.
 */

import { loadPrior, assertImmutable } from "./prior.mjs";

export function loadOptionalPrior(priorPath) {
  if (!priorPath) {
    return { ok: true, present: false, prior: null, path: null };
  }
  const loaded = loadPrior(priorPath);
  if (!loaded.ok) return { ...loaded, present: true };
  return {
    ok: true,
    present: true,
    path: loaded.path,
    prior: loaded.prior,
    bytes: loaded.bytes,
  };
}

export function assertPriorImmutable(priorPath, nextBytes) {
  return assertImmutable(priorPath, nextBytes);
}

export function priorObservationPayload(prior) {
  if (!prior) return null;
  if (prior.payload?.observation) {
    return {
      observation: prior.payload.observation,
      fingerprint: prior.payload.fingerprint || null,
    };
  }
  if (prior.payload?.evidence?.observation) {
    return {
      observation: prior.payload.evidence.observation,
      fingerprint: prior.payload.evidence.fingerprint || null,
    };
  }
  return null;
}
