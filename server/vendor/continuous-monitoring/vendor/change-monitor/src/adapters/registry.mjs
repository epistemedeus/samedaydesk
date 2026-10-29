import { releaseGateAdapter } from "./release-gate.mjs";
import { routeLockAdapter } from "./route-lock.mjs";
import { sourceProjectionAdapter } from "./source-projection.mjs";
import { observation } from "./shape.mjs";

export const ADAPTERS = Object.freeze({
  "release-gate": releaseGateAdapter,
  "route-lock": routeLockAdapter,
  "source-projection": sourceProjectionAdapter,
});

export function adapterFor(kind) {
  return ADAPTERS[kind] || null;
}

export function normalizeDocument(subscription, document, ctx = {}) {
  const adapter = adapterFor(subscription.source.kind);
  if (!adapter) {
    return observation(subscription, {
      adapterId: "none",
      evidenceClass: "incomparable",
      failureCode: "adapter_missing",
      correctsEvidenceId: ctx.correctsEvidenceId ?? null,
    });
  }
  return adapter.normalize(subscription, document, ctx);
}

export function failureObservation(subscription, sourceFailure, ctx = {}) {
  const code = typeof sourceFailure?.code === "string" && /^[a-z0-9_]+$/.test(sourceFailure.code)
    ? sourceFailure.code
    : "source_unreachable";
  return observation(subscription, {
    adapterId: "reader",
    evidenceClass: "source_failure",
    failureCode: code,
    sourceVersion: null,
    observedAt: null,
    coverage: null,
    nonSemantic: { message: typeof sourceFailure?.message === "string" ? sourceFailure.message.slice(0, 200) : null },
    correctsEvidenceId: ctx.correctsEvidenceId ?? null,
  });
}
