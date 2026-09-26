/** Journey outcomes — never invent completed without checks + decision gates. */
export const JOURNEY_OUTCOME = Object.freeze({
  ACCEPTED: "accepted",
  NEEDS_AMENDMENT: "needs_amendment",
  NEEDS_REVIEW: "needs_review",
  STOPPED: "stopped",
  REJECTED: "rejected",
});

/** How acceptance was earned — automatic objective evidence ≠ counterparty acceptance. */
export const ACCEPTANCE_KIND = Object.freeze({
  AUTOMATIC_OBJECTIVE_EVIDENCE: "automatic_objective_evidence",
  COUNTERPARTY_ACCEPTANCE: "counterparty_acceptance",
  NONE: "none",
});

export const OBJECTIVE_LAYER = Object.freeze({
  COMPLETE: "complete",
  INCOMPLETE: "incomplete",
  NOT_APPLICABLE: "not_applicable",
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A supplied decision must be an object with decision accept|reject. Omitted is valid. */
export function requesterDecisionIsValid(decision) {
  if (decision == null) return true;
  return isPlainObject(decision) && (decision.decision === "accept" || decision.decision === "reject");
}

/**
 * Derive outcome from objective checks + subjective + optional explicit requester decision.
 *
 * Contract (preserve S151 automation; keep S171 reject-first + revision binding):
 * - Explicit reject is always terminal and wins first.
 * - Explicit accept must bind artifactSha256 AND revisionSha256 to current snapshots.
 * - Fully objective (objectiveComplete && zero subjective) may complete automatically
 *   from evidence — no new human approval ritual for every objective task.
 * - Subjective remaining → needs_review until bound counterparty accept (or reject).
 * - No objective layer is not_applicable: needs_review / bound accept, never auto-accept.
 * - Evidence is never synthesized. Malformed supplied decisions stop rather than fall through.
 */
export function deriveJourneyOutcome({
  objectiveComplete,
  objectiveLayer = null,
  subjectiveUnresolvedCount,
  requesterDecision = null,
  boundArtifactSha256 = null,
  boundRevisionSha256 = null,
}) {
  const d = requesterDecision;

  if (d != null && !requesterDecisionIsValid(d)) {
    return {
      outcome: JOURNEY_OUTCOME.STOPPED,
      lifecycleMayComplete: false,
      reason: "malformed_requester_decision",
      acceptanceKind: ACCEPTANCE_KIND.NONE,
    };
  }

  // Explicit reject always wins before auto-complete or accept paths.
  if (d && d.decision === "reject") {
    return {
      outcome: JOURNEY_OUTCOME.REJECTED,
      lifecycleMayComplete: false,
      reason: "explicit_requester_reject",
      acceptanceKind: ACCEPTANCE_KIND.NONE,
    };
  }

  const layer =
    objectiveLayer === OBJECTIVE_LAYER.NOT_APPLICABLE ||
    objectiveLayer === OBJECTIVE_LAYER.COMPLETE ||
    objectiveLayer === OBJECTIVE_LAYER.INCOMPLETE
      ? objectiveLayer
      : objectiveComplete === true
        ? OBJECTIVE_LAYER.COMPLETE
        : OBJECTIVE_LAYER.INCOMPLETE;

  if (layer === OBJECTIVE_LAYER.INCOMPLETE) {
    return {
      outcome: JOURNEY_OUTCOME.NEEDS_AMENDMENT,
      lifecycleMayComplete: false,
      reason: "objective_incomplete",
      acceptanceKind: ACCEPTANCE_KIND.NONE,
    };
  }

  const subjectiveCount = subjectiveUnresolvedCount ?? 0;

  if (d && d.decision === "accept") {
    if (!d.artifactSha256 || d.artifactSha256 !== boundArtifactSha256) {
      return {
        outcome: JOURNEY_OUTCOME.NEEDS_REVIEW,
        lifecycleMayComplete: false,
        reason: "accept_requires_matching_artifactSha256",
        acceptanceKind: ACCEPTANCE_KIND.NONE,
      };
    }
    if (!d.revisionSha256 || d.revisionSha256 !== boundRevisionSha256) {
      return {
        outcome: JOURNEY_OUTCOME.NEEDS_REVIEW,
        lifecycleMayComplete: false,
        reason: "accept_requires_matching_revisionSha256",
        acceptanceKind: ACCEPTANCE_KIND.NONE,
      };
    }
    return {
      outcome: JOURNEY_OUTCOME.ACCEPTED,
      lifecycleMayComplete: true,
      reason: "explicit_requester_accept_bound",
      acceptanceKind: ACCEPTANCE_KIND.COUNTERPARTY_ACCEPTANCE,
    };
  }

  if (subjectiveCount > 0) {
    return {
      outcome: JOURNEY_OUTCOME.NEEDS_REVIEW,
      lifecycleMayComplete: false,
      reason: "subjective_unresolved",
      acceptanceKind: ACCEPTANCE_KIND.NONE,
    };
  }

  if (layer === OBJECTIVE_LAYER.NOT_APPLICABLE) {
    return {
      outcome: JOURNEY_OUTCOME.STOPPED,
      lifecycleMayComplete: false,
      reason: "objective_layer_not_applicable",
      acceptanceKind: ACCEPTANCE_KIND.NONE,
    };
  }

  // Fully objective: automatic evidence completion (original automation contract).
  return {
    outcome: JOURNEY_OUTCOME.ACCEPTED,
    lifecycleMayComplete: true,
    reason: "objective_complete_no_subjective",
    acceptanceKind: ACCEPTANCE_KIND.AUTOMATIC_OBJECTIVE_EVIDENCE,
  };
}
