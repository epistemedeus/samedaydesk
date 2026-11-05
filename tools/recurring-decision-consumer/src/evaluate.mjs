import { digestPayload, pickFields } from "./digest.mjs";
import { parseClock, withinHorizon } from "./freshness.mjs";
import {
  INTENT_SCHEMA,
  OUTCOMES,
  REASONS,
  RESULT_SCHEMA,
  SUPPORTED_CAPTURE_SCHEMAS,
} from "./pins.mjs";

function resultShell(partial) {
  return {
    schema: RESULT_SCHEMA,
    useful: false,
    previous: null,
    statePath: null,
    cannotEstablish: [
      "This run-once consumer does not claim live recurrence.",
      "It does not establish that later callers accepted the same decision.",
      "Voluntary paid choice remains an outside experiment, not a fixture assertion.",
    ],
    ...partial,
  };
}

function invalid(message, extra = {}) {
  return {
    ok: false,
    ...resultShell({
      outcome: OUTCOMES.unknown,
      reason: REASONS.invalidInput,
      freshness: {
        clock: extra.clock ?? null,
        horizonHours: extra.horizonHours ?? null,
        priorAt: null,
        captureAt: null,
        withinHorizon: false,
      },
      decision: {
        intentId: extra.intentId ?? "",
        subject: extra.subject ?? "",
        changedFields: [],
        unchangedFields: [],
        digestPrior: null,
        digestCapture: null,
      },
      controls: {
        falseChange: false,
        missedChange: false,
        referenceMatched: null,
        referenceLabel: null,
      },
      message,
    }),
  };
}

function validateIntent(intent) {
  if (!intent || typeof intent !== "object") return "intent required";
  if (intent.schema !== INTENT_SCHEMA) return "intent schema unsupported";
  if (!intent.intentId || !intent.subject) return "intent requires intentId and subject";
  if (!Array.isArray(intent.fields) || intent.fields.length < 1) return "intent.fields required";
  if (intent.compare !== "field_equality" && intent.compare !== "payload_digest") {
    return "intent.compare unsupported";
  }
  return null;
}

function validateCapture(capture, label) {
  if (capture == null) return { missing: true };
  if (typeof capture !== "object") return { error: `${label} must be an object` };
  if (!SUPPORTED_CAPTURE_SCHEMAS.includes(capture.schema)) {
    return { unsupported: true };
  }
  if (!capture.captureId || !capture.subject || !capture.capturedAt || typeof capture.payload !== "object") {
    return { error: `${label} missing required capture fields` };
  }
  if (capture.permission && capture.permission.permitted === false) {
    return { notPermitted: true };
  }
  return { ok: true };
}

function hasOwnField(payload, field) {
  return payload != null && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, field);
}

function compareFields(priorPayload, capturePayload, fields) {
  const changed = [];
  const unchanged = [];
  const absentBoth = [];
  for (const field of fields) {
    const leftPresent = hasOwnField(priorPayload, field);
    const rightPresent = hasOwnField(capturePayload, field);
    if (!leftPresent && !rightPresent) {
      absentBoth.push(field);
      continue;
    }
    const left = leftPresent ? priorPayload[field] : undefined;
    const right = rightPresent ? capturePayload[field] : undefined;
    if (leftPresent && rightPresent && stableEqual(left, right)) unchanged.push(field);
    else changed.push(field);
  }
  return { changed, unchanged, absentBoth };
}

function stableEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyReferenceControls(outcome, reference) {
  if (!reference || typeof reference !== "object") {
    return {
      falseChange: false,
      missedChange: false,
      referenceMatched: null,
      referenceLabel: null,
    };
  }
  const expected = reference.expectedOutcome;
  const matched = expected === outcome;
  const falseChange = outcome === OUTCOMES.usefulChange && expected === OUTCOMES.usefulNoChange;
  const missedChange = outcome === OUTCOMES.usefulNoChange && expected === OUTCOMES.usefulChange;
  return {
    falseChange,
    missedChange,
    referenceMatched: matched,
    referenceLabel: expected ?? null,
  };
}

/**
 * Run-once consumer: saved permitted captures + intent + freshness + retained previous.
 * Returns useful change / useful no-change, or stale / unavailable / unsupported / unknown.
 */
export function evaluateDecision({
  intent,
  prior,
  capture,
  clock,
  horizonHours,
  previous = null,
  reference = null,
  statePath = null,
}) {
  const intentError = validateIntent(intent);
  if (intentError) return invalid(intentError, { clock, horizonHours });

  const clockParsed = parseClock(clock, "clock");
  if (!clockParsed.ok) return invalid(clockParsed.message, { clock, horizonHours, intentId: intent.intentId, subject: intent.subject });
  if (!Number.isFinite(horizonHours) || horizonHours < 0) {
    return invalid("horizonHours must be a non-negative number", {
      clock: clockParsed.iso,
      horizonHours,
      intentId: intent.intentId,
      subject: intent.subject,
    });
  }

  const priorCheck = validateCapture(prior, "prior");
  const captureCheck = validateCapture(capture, "capture");

  if (captureCheck.missing) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unavailable,
        useful: false,
        reason: REASONS.captureMissing,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: null,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unavailable, reference),
        previous,
        statePath,
      }),
    };
  }

  if (captureCheck.unsupported || (intent.supportedCaptureSchemas
    && Array.isArray(intent.supportedCaptureSchemas)
    && capture
    && !intent.supportedCaptureSchemas.includes(capture.schema))) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unsupported,
        useful: false,
        reason: REASONS.captureUnsupported,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: capture?.capturedAt ?? null,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unsupported, reference),
        previous,
        statePath,
      }),
    };
  }

  if (priorCheck.unsupported) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unsupported,
        useful: false,
        reason: REASONS.captureUnsupported,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: capture?.capturedAt ?? null,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unsupported, reference),
        previous,
        statePath,
      }),
    };
  }

  if (priorCheck.error) return invalid(priorCheck.error, { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
  if (captureCheck.error) return invalid(captureCheck.error, { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
  if (captureCheck.notPermitted) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unavailable,
        useful: false,
        reason: REASONS.notPermitted,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: capture.capturedAt,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unavailable, reference),
        previous,
        statePath,
      }),
    };
  }

  if (capture.subject !== intent.subject || (prior && !priorCheck.missing && prior.subject !== intent.subject)) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unsupported,
        useful: false,
        reason: REASONS.subjectMismatch,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: capture.capturedAt,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unsupported, reference),
        previous,
        statePath,
      }),
    };
  }

  const captureFresh = withinHorizon(clockParsed.ms, capture.capturedAt, horizonHours);
  if (!captureFresh.ok) return invalid(captureFresh.message, { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
  if (!captureFresh.within) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.stale,
        useful: false,
        reason: REASONS.captureStale,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior?.capturedAt ?? null,
          captureAt: capture.capturedAt,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.stale, reference),
        previous,
        statePath,
      }),
    };
  }

  if (priorCheck.missing) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unavailable,
        useful: false,
        reason: REASONS.priorMissing,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: null,
          captureAt: capture.capturedAt,
          withinHorizon: true,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: intent.fields.slice(),
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unavailable, reference),
        previous,
        statePath,
      }),
    };
  }

  if (priorCheck.notPermitted) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.unavailable,
        useful: false,
        reason: REASONS.notPermitted,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior.capturedAt,
          captureAt: capture.capturedAt,
          withinHorizon: true,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.unavailable, reference),
        previous,
        statePath,
      }),
    };
  }

  const priorFresh = withinHorizon(clockParsed.ms, prior.capturedAt, horizonHours);
  if (!priorFresh.ok) return invalid(priorFresh.message, { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
  if (!priorFresh.within) {
    return {
      ok: true,
      ...resultShell({
        outcome: OUTCOMES.stale,
        useful: false,
        reason: REASONS.priorStale,
        freshness: {
          clock: clockParsed.iso,
          horizonHours,
          priorAt: prior.capturedAt,
          captureAt: capture.capturedAt,
          withinHorizon: false,
        },
        decision: {
          intentId: intent.intentId,
          subject: intent.subject,
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: applyReferenceControls(OUTCOMES.stale, reference),
        previous,
        statePath,
      }),
    };
  }

  let digestPrior = null;
  let digestCapture = null;
  let changedFields = [];
  let unchangedFields = [];
  let absentFields = [];
  let outcome;
  let reason;

  try {
    if (intent.compare === "payload_digest") {
      const priorSlice = pickFields(prior.payload, intent.fields);
      const captureSlice = pickFields(capture.payload, intent.fields);
      digestPrior = digestPayload(priorSlice);
      digestCapture = digestPayload(captureSlice);
      const same = digestPrior === digestCapture;
      outcome = same ? OUTCOMES.usefulNoChange : OUTCOMES.usefulChange;
      reason = same ? REASONS.digestsMatch : REASONS.digestsDiffer;
      if (same) unchangedFields = intent.fields.slice();
      else changedFields = intent.fields.slice();
    } else {
      const cmp = compareFields(prior.payload, capture.payload, intent.fields);
      changedFields = cmp.changed;
      unchangedFields = cmp.unchanged;
      absentFields = cmp.absentBoth;
      digestPrior = digestPayload(pickFields(prior.payload, intent.fields));
      digestCapture = digestPayload(pickFields(capture.payload, intent.fields));
      if (changedFields.length > 0) {
        outcome = OUTCOMES.usefulChange;
        reason = REASONS.fieldsDiffer;
      } else if (absentFields.length > 0) {
        outcome = OUTCOMES.unknown;
        reason = REASONS.fieldsAbsent;
      } else {
        outcome = OUTCOMES.usefulNoChange;
        reason = REASONS.fieldsMatch;
      }
    }
  } catch (error) {
    if (error?.code === "OVERSIZE") return invalid(error.message, { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
    return invalid("cannot compare payloads", { clock: clockParsed.iso, horizonHours, intentId: intent.intentId, subject: intent.subject });
  }

  const controls = applyReferenceControls(outcome, reference);
  if (controls.falseChange) reason = REASONS.referenceFalseChange;
  if (controls.missedChange) reason = REASONS.referenceMissedChange;

  const useful = (outcome === OUTCOMES.usefulChange || outcome === OUTCOMES.usefulNoChange)
    && !controls.falseChange
    && !controls.missedChange;

  return {
    ok: true,
    ...resultShell({
      outcome,
      useful,
      reason,
      freshness: {
        clock: clockParsed.iso,
        horizonHours,
        priorAt: prior.capturedAt,
        captureAt: capture.capturedAt,
        withinHorizon: true,
      },
      decision: {
        intentId: intent.intentId,
        subject: intent.subject,
        changedFields,
        unchangedFields,
        absentFields,
        digestPrior,
        digestCapture,
      },
      controls,
      previous,
      statePath,
    }),
  };
}
