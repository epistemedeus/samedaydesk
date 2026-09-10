import {
  CAPTURE_OUTCOME,
  ERROR_CODES,
  EVENT_KINDS,
  EVENTS_SCHEMA,
  TAGGED_SCHEMA,
} from "./constants.mjs";
import { linkError, validateSignal, validateTaggedLinks } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

/**
 * Emit privacy-bounded result events from tagged links + a capture signal.
 * Outcomes: recorded | unavailable | no_users (never collapse unavailable→no_users).
 * MUST NOT claim buyerIntent / purchaseIntent or equate activation with intent.
 */
export function emitResultEvents(tagged, signal, options = {}) {
  const clock = options.clock || defaultClock;
  const taggedDoc = validateTaggedLinks(tagged);
  let sig;
  try {
    sig = validateSignal(signal);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: EVENTS_SCHEMA,
        outcome: CAPTURE_OUTCOME.UNAVAILABLE,
        generatedAt: new Date(clock()).toISOString(),
        taggedSchema: tagged?.schema ?? null,
        cite: taggedDoc.cite || null,
        events: [],
        missingInputs: err.details?.missing || [err.message],
        privacyNotes: privacyNotes(),
        mutationBoundary: mutationBoundary(),
        error: { code: err.code, message: err.message, details: err.details || null },
        // Explicitly omit activationCount — unavailable ≠ no_users
      };
    }
    throw err;
  }

  // Capture failed / unavailable → outcome unavailable (no activationCount)
  if (sig.captureStatus === "failed" || sig.captureStatus === "unavailable") {
    return {
      schema: EVENTS_SCHEMA,
      outcome: CAPTURE_OUTCOME.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "capture_failed_or_unavailable",
      generatedAt: new Date(clock()).toISOString(),
      taggedSchema: TAGGED_SCHEMA,
      cite: taggedDoc.cite || sig.cite || null,
      reason: sig.reason || "event capture unavailable",
      events: [],
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Capture failed or unavailable — do not claim zero activations.",
        "unavailable ≠ no_users.",
      ],
      claims: {
        activationEqualsBuyerIntent: false,
      },
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
      // Explicitly omit activationCount
    };
  }

  // Capture ok
  const presentations = Array.isArray(sig.presentations) ? sig.presentations : [];
  const activations = Array.isArray(sig.activations) ? sig.activations : [];
  const linkById = new Map((taggedDoc.links || []).map((l) => [l.id, l]));

  const events = [];

  for (const p of presentations) {
    const link = linkById.get(p.linkId) || null;
    events.push({
      kind: EVENT_KINDS.LINK_PRESENTED,
      linkId: p.linkId,
      sourceTag: link?.sourceTag ?? p.sourceTag ?? null,
      at: p.at || null,
      // Privacy-bounded: no intent fields
      impliesBuyerIntent: false,
    });
  }

  for (const a of activations) {
    const link = linkById.get(a.linkId) || null;
    events.push({
      kind: EVENT_KINDS.LINK_ACTIVATED,
      linkId: a.linkId,
      sourceTag: link?.sourceTag ?? a.sourceTag ?? null,
      at: a.at || null,
      channel: a.channel || "synthetic",
      // Hard: activation is not buyer intent
      impliesBuyerIntent: false,
      equatesActivationWithIntent: false,
    });
  }

  const activationCount = activations.length;

  if (activationCount === 0) {
    return {
      schema: EVENTS_SCHEMA,
      outcome: CAPTURE_OUTCOME.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_activations",
      generatedAt: new Date(clock()).toISOString(),
      taggedSchema: TAGGED_SCHEMA,
      cite: taggedDoc.cite || sig.cite || null,
      reason: sig.reason || "capture succeeded; zero link activations",
      activationCount: 0,
      presentationCount: presentations.length,
      events,
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Capture succeeded with zero activations (no_users).",
        "This is distinct from unavailable (capture failed).",
        "Zero activations still must not be labeled buyer intent.",
      ],
      claims: {
        activationEqualsBuyerIntent: false,
      },
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
    };
  }

  return {
    schema: EVENTS_SCHEMA,
    outcome: CAPTURE_OUTCOME.RECORDED,
    label: "capture_succeeded_events_recorded",
    generatedAt: new Date(clock()).toISOString(),
    taggedSchema: TAGGED_SCHEMA,
    cite: taggedDoc.cite || sig.cite || null,
    activationCount,
    presentationCount: presentations.length,
    events,
    missingInputs: [],
    privacyNotes: privacyNotes(),
    truthNotes: [
      "Recorded linkPresented / linkActivated only — synthetic fixtures unless cited.",
      "Activation does NOT imply buyerIntent or purchaseIntent.",
      "Do not invent live marketplace traffic.",
    ],
    claims: {
      activationEqualsBuyerIntent: false,
    },
    mutationBoundary: mutationBoundary(),
    evidenceIndex: "evidence/INDEX.md",
  };
}

/** Guard used by tests: unavailable and no_users must remain distinct. */
export function assertCaptureDistinct(unavailableEvents, noUsersEvents) {
  if (!unavailableEvents || unavailableEvents.outcome !== CAPTURE_OUTCOME.UNAVAILABLE) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "expected unavailable outcome");
  }
  if (Object.prototype.hasOwnProperty.call(unavailableEvents, "activationCount")) {
    throw linkError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report activationCount (would collapse into no_users)",
    );
  }
  if (!noUsersEvents || noUsersEvents.outcome !== CAPTURE_OUTCOME.NO_USERS) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "expected no_users outcome");
  }
  if (unavailableEvents.outcome === noUsersEvents.outcome) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "capture outcomes collapsed");
  }
  if (unavailableEvents.code === noUsersEvents.code) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "capture codes collapsed");
  }
  return true;
}

/** Guard: activation events must not imply buyer intent. */
export function assertActivationNotIntent(resultEvents) {
  if (!resultEvents || !Array.isArray(resultEvents.events)) {
    throw linkError(ERROR_CODES.INVALID_INPUT, "expected result events");
  }
  for (const ev of resultEvents.events) {
    if (ev.kind === EVENT_KINDS.LINK_ACTIVATED) {
      if (ev.impliesBuyerIntent === true || ev.equatesActivationWithIntent === true) {
        throw linkError(
          ERROR_CODES.FORBIDDEN_INTENT,
          "linkActivated must not imply buyer intent",
        );
      }
      if ("buyerIntent" in ev || "purchaseIntent" in ev) {
        throw linkError(
          ERROR_CODES.FORBIDDEN_INTENT,
          "linkActivated must not carry buyerIntent/purchaseIntent fields",
        );
      }
    }
  }
  if (resultEvents.claims?.activationEqualsBuyerIntent === true) {
    throw linkError(
      ERROR_CODES.FORBIDDEN_INTENT,
      "claims.activationEqualsBuyerIntent must be false",
    );
  }
  return true;
}

function privacyNotes() {
  return [
    "Privacy-bounded fields only: linkPresented, linkActivated, sourceTag.",
    "Forbidden: buyerIntent, purchaseIntent, activation-equals-intent.",
    "unavailable omits activationCount; no_users sets activationCount=0.",
  ];
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login",
      "agensi Bot login",
      "price / publish / review-submit",
      "invent live clicks or buyers",
      "equate activation with buyerIntent",
      "collapse unavailable into no_users",
    ],
    ownerOfPublicationAndPrice: "Root",
  };
}
