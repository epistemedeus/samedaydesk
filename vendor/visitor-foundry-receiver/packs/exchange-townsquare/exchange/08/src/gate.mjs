/**
 * Journey acquisition/admission gate — same spirit as first-job acquisition:
 * verify before continuing; stop on unsafe/unsupported; never invent readiness.
 */

export const GATE_DECISION = Object.freeze({
  PASS: "pass",
  STOP: "stop",
  CONTINUE_WITH_AMEND: "continue_with_amend",
});

/**
 * Gate on file-set admission (EXCHANGE-04) before deliverable attach.
 */
export function evaluateAdmissionGate(admission, { allowPartial = false } = {}) {
  if (!admission || typeof admission !== "object") {
    return {
      decision: GATE_DECISION.STOP,
      reason: "missing_admission_result",
      continueJourney: false,
      attachDeliverable: false,
    };
  }
  if (admission.summary?.unsafePathCount > 0 || admission.summary?.unsupportedFormatCount > 0) {
    return {
      decision: GATE_DECISION.STOP,
      reason: "unsafe_or_unsupported_files",
      continueJourney: false,
      attachDeliverable: false,
      admissionStatus: admission.status,
    };
  }
  if (admission.status === "rejected") {
    return {
      decision: GATE_DECISION.STOP,
      reason: "admission_rejected",
      continueJourney: false,
      attachDeliverable: false,
      admissionStatus: admission.status,
    };
  }
  if (admission.status === "partial") {
    if (allowPartial) {
      return {
        decision: GATE_DECISION.CONTINUE_WITH_AMEND,
        reason: "partial_admission_allowed",
        continueJourney: true,
        attachDeliverable: true,
        admissionStatus: admission.status,
      };
    }
    return {
      decision: GATE_DECISION.STOP,
      reason: "partial_admission_blocked",
      continueJourney: false,
      attachDeliverable: false,
      admissionStatus: admission.status,
      hint: "Supply missing required files or pass allowPartialAdmission: true to continue into correction.",
    };
  }
  if (admission.status === "admitted") {
    return {
      decision: GATE_DECISION.PASS,
      reason: "admission_admitted",
      continueJourney: true,
      attachDeliverable: true,
      admissionStatus: admission.status,
    };
  }
  return {
    decision: GATE_DECISION.STOP,
    reason: "unknown_admission_status",
    continueJourney: false,
    attachDeliverable: false,
    admissionStatus: admission.status,
  };
}

/**
 * Gate proposal choice from EXCHANGE-02 comparison — do not bind conflicts/missing by default.
 */
export function evaluateProposalGate(comparison, chosenProposalId, { allowWeakProposal = false } = {}) {
  const row = comparison?.comparisons?.find((c) => c.proposalId === chosenProposalId);
  if (!row) {
    return {
      decision: GATE_DECISION.STOP,
      reason: "chosen_proposal_missing_from_comparison",
      continueJourney: false,
    };
  }
  if (row.status === "meets") {
    return { decision: GATE_DECISION.PASS, reason: "proposal_meets", continueJourney: true, proposalStatus: row.status };
  }
  if (row.status === "partial" && allowWeakProposal) {
    return {
      decision: GATE_DECISION.CONTINUE_WITH_AMEND,
      reason: "partial_proposal_allowed",
      continueJourney: true,
      proposalStatus: row.status,
    };
  }
  if (
    allowWeakProposal &&
    (row.status === "conflicts" ||
      row.status === "missing_evidence" ||
      row.status === "unverified_evidence")
  ) {
    return {
      decision: GATE_DECISION.CONTINUE_WITH_AMEND,
      reason: "weak_proposal_explicitly_allowed",
      continueJourney: true,
      proposalStatus: row.status,
    };
  }
  return {
    decision: GATE_DECISION.STOP,
    reason: `proposal_status_${row.status}`,
    continueJourney: false,
    proposalStatus: row.status,
    hint: "Pick a meets proposal or pass allowWeakProposal: true.",
  };
}
