import { LAYERS, MATCH_REFUSAL } from "./constants.mjs";
import { inputsCompatible, validateCapability } from "./validate.mjs";

/**
 * Deterministic machine matching.
 * Order: exact outcome overlap desc, then fresh-price preferred, then runnable layer,
 * then stable id ascending. No reputation or paid boost.
 */
export function matchCapabilities(catalog, request, { nowMs = Date.now() } = {}) {
  const outcome = typeof request?.outcome === "string" ? request.outcome.trim().toLowerCase() : "";
  const outcomes = Array.isArray(request?.outcomes)
    ? request.outcomes.map((o) => String(o).trim().toLowerCase()).filter(Boolean)
    : outcome
      ? [outcome]
      : [];
  const inputs = request?.inputs && typeof request.inputs === "object" ? request.inputs : {};

  const admitted = [];
  const rejected = [];

  for (const raw of catalog || []) {
    const validation = validateCapability(raw, { nowMs });
    if (!validation.ok) {
      rejected.push({
        id: raw?.id ?? null,
        refusals: validation.refusals,
        errors: validation.errors,
      });
      continue;
    }

    const capOutcomes = raw.outcomes.map((o) => o.toLowerCase());
    const overlap = outcomes.filter((o) => capOutcomes.includes(o));
    if (outcomes.length && overlap.length === 0) {
      rejected.push({
        id: raw.id,
        refusals: [MATCH_REFUSAL.NO_RESULT],
        errors: ["no outcome overlap"],
      });
      continue;
    }

    const compat = inputsCompatible(raw, inputs);
    if (Object.keys(inputs).length > 0 && !compat.ok) {
      rejected.push({
        id: raw.id,
        refusals: [MATCH_REFUSAL.INCOMPATIBLE_INPUT],
        errors: [
          ...compat.missing.map((k) => `missing input ${k}`),
          ...compat.incompatible.map((k) => `incompatible input ${k}`),
        ],
        missing: compat.missing,
        incompatible: compat.incompatible,
      });
      continue;
    }

    const stale = validation.stale;
    admitted.push({
      capability: raw,
      overlap,
      overlapCount: overlap.length,
      stale,
      runnable: raw.layer === LAYERS.RUNNABLE || Boolean(raw.runnableAdapterId),
      layer: raw.layer,
    });
  }

  admitted.sort((a, b) => {
    if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    if (a.runnable !== b.runnable) return a.runnable ? -1 : 1;
    return String(a.capability.id).localeCompare(String(b.capability.id));
  });

  return {
    matches: admitted,
    rejected,
    empty: admitted.length === 0,
    refusal: admitted.length === 0 ? MATCH_REFUSAL.NO_RESULT : null,
  };
}

/**
 * Apply a correction record that supersedes a prior capability or evidence id.
 * Corrections never silently rewrite; they produce a new view.
 */
export function applyCorrection(catalog, correction) {
  if (!correction || typeof correction !== "object") {
    throw new Error("correction must be an object");
  }
  if (!correction.supersedesId || !correction.replacement) {
    throw new Error("correction requires supersedesId and replacement");
  }
  const next = [];
  let found = false;
  for (const item of catalog || []) {
    if (item.id === correction.supersedesId) {
      found = true;
      const corrected = {
        ...correction.replacement,
        id: correction.replacement.id || `${correction.supersedesId}:corrected`,
        correctsId: correction.supersedesId,
        correctionNote: correction.note || "explicit correction",
      };
      next.push(corrected);
      next.push({
        ...item,
        supersededBy: corrected.id,
        active: false,
      });
    } else {
      next.push(item);
    }
  }
  if (!found) {
    throw new Error(`no capability ${correction.supersedesId} to correct`);
  }
  return next;
}
