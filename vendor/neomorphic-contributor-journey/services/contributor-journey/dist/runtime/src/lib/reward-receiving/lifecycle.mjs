/**
 * Evidence-bound lifecycle projection.
 * Distinguishes an open buyer job, a sponsored evaluation, a reserved claim,
 * an accepted obligation, and an already-paid result. It does not pay.
 */

import { observedOrUnknown, projectActionability } from "./actionability.mjs";
import { assessSettlement } from "./settlement.mjs";
import { H15_KNOWN_TX } from "./evidence.mjs";

export const LIFECYCLE_SCHEMA = "neomorphic.reward-receiving.lifecycle.v1";

export const MACHINE_STATUSES = Object.freeze([
  "open_buyer_job",
  "sponsored_evaluation",
  "reserved_claim",
  "accepted_obligation",
  "already_paid",
]);

export function obligationKey(subject) {
  return [
    "obligation",
    subject.taskId,
    subject.slotId ?? "-",
    subject.submittedAt ?? "-",
    subject.termsVersion ?? "-",
    subject.choose ?? "-",
  ].join(":");
}

function authenticate(reader, subject) {
  const kind = reader?.kind ?? "public";
  if (kind === "authorized_original_claim") {
    const match = Boolean(subject.grantSha256) && reader.grantSha256 === subject.grantSha256;
    return {
      kind,
      authenticatedClaimant: match,
      reviewerIsClaimant: false,
      publicAcceptanceAuthenticatesClaimant: false,
      payoutRedirected: false,
      denial: match ? null : "grant_mismatch",
    };
  }
  const denial = kind === "reviewer"
    ? "reviewer_is_not_claimant"
    : "public_acceptance_is_not_a_claim";
  return {
    kind,
    authenticatedClaimant: false,
    reviewerIsClaimant: false,
    publicAcceptanceAuthenticatesClaimant: false,
    payoutRedirected: false,
    denial,
  };
}

function sampleLimits() {
  return {
    provesMinimumReward: false,
    provesApiFundedArbitrage: false,
    marksOtherTrialFunded: false,
    note: "A settled 0.20 sample does not prove a 0.10 minimum or profitable API-funded arbitrage.",
  };
}

function historyOf(subject) {
  return {
    sponsored: subject.evidenceClass === "sponsored",
    reserved: subject.reserved === true,
    accepted: subject.accepted === true,
    usefulNegative: subject.choose === "decline_all" && subject.useful !== false,
    expiryCancelsAccepted: false,
  };
}

/**
 * @param {object} input
 */
export function projectLifecycle(input) {
  const subject = input.subject ?? {};
  const reader = authenticate(input.reader, subject);
  const action = projectActionability({
    availability: subject.availability,
    jobType: subject.jobType,
    code: subject.code,
    label: subject.label,
    expectedProfit: input.expectedProfit,
    open: subject.open === true,
    acceptsSubmissions: subject.acceptsSubmissions,
    fees: input.fees,
    funding: input.funding,
    effort: input.effort,
  });
  const fees = observedOrUnknown(input.fees, "fees");
  const funding = observedOrUnknown(input.funding, "funding");
  const effort = observedOrUnknown(input.effort, "effort");
  const now = input.now ?? "2026-10-01T00:00:00Z";
  const expiresAt = subject.expiresAt ?? null;
  const expired = expiresAt != null && Date.parse(now) > Date.parse(expiresAt);
  const accepted = subject.accepted === true;
  const reserved = subject.reserved === true;
  const obligationId = accepted || subject.submittedAt ? obligationKey(subject) : null;
  const knownTx = input.knownTx === undefined ? H15_KNOWN_TX : input.knownTx;
  const settlement = assessSettlement(
    {
      taskId: subject.taskId,
      slotId: subject.slotId,
      amount: subject.amount,
      asset: subject.asset,
      network: subject.network,
      transactionHash: input.expected?.transactionHash,
      blockNumber: input.expected?.blockNumber,
      timestamp: input.expected?.timestamp,
    },
    input.receipt ?? null,
    knownTx,
  );
  const operatorSentAt = input.operatorSentAt ?? null;
  const chainVerified = settlement.verified === true;
  const partial = settlement.kind === "partial";

  let machineStatus = "not_a_buyer_job";
  if (chainVerified && accepted) machineStatus = "already_paid";
  else if (accepted) machineStatus = "accepted_obligation";
  else if (reserved && !expired) machineStatus = "reserved_claim";
  else if (reserved && expired) machineStatus = "not_a_buyer_job";
  else if (action.openBuyerJob) machineStatus = "open_buyer_job";
  else if (subject.evidenceClass === "sponsored" && subject.open === true && subject.acceptsSubmissions === true) {
    machineStatus = "sponsored_evaluation";
  } else if (subject.evidenceClass === "sponsored") machineStatus = "sponsored_evaluation";
  else if (action.hypothetical || action.referral) machineStatus = "not_a_buyer_job";

  const publicReader = reader.authenticatedClaimant !== true;
  let nextAction = "do_not_claim";
  if (machineStatus === "already_paid" && reader.authenticatedClaimant) nextAction = "closed_already_paid";
  else if (machineStatus === "already_paid") nextAction = "do_not_claim";
  else if (machineStatus === "accepted_obligation" && reader.authenticatedClaimant) nextAction = "no_further_work";
  else if (machineStatus === "accepted_obligation") nextAction = "do_not_claim";
  else if (machineStatus === "reserved_claim" && reader.authenticatedClaimant) nextAction = "submit_bound_work";
  else if (machineStatus === "reserved_claim") nextAction = "do_not_claim";
  else if (machineStatus === "open_buyer_job") nextAction = "read_buyer_terms";
  else if (machineStatus === "sponsored_evaluation" && subject.acceptsSubmissions === true && subject.open === true) {
    nextAction = "read_sponsored_terms";
  } else if (action.hypothetical || action.referral || machineStatus === "not_a_buyer_job") {
    nextAction = action.openBuyerJob ? "read_buyer_terms" : "do_not_treat_as_buyer_job";
  }

  if (publicReader && (machineStatus === "already_paid" || machineStatus === "accepted_obligation" || machineStatus === "reserved_claim")) {
    nextAction = "do_not_claim";
  }

  const usefulNegativeEarns = subject.choose === "decline_all"
    && subject.declineEarnsIdenticalReward !== false
    && accepted;
  const furtherWorkRequired = usefulNegativeEarns ? false : machineStatus === "reserved_claim" && reader.authenticatedClaimant;

  const projection = {
    schema: LIFECYCLE_SCHEMA,
    machineStatus,
    jobClass: subject.evidenceClass === "sponsored" && !action.openBuyerJob
      ? "sponsored_evaluation"
      : action.jobClass,
    nextAction,
    closedSlotNextAction: (accepted || (reserved && expired) || chainVerified) ? "do_not_claim" : null,
    closedSlot: Boolean(accepted || (reserved && expired) || subject.acceptsSubmissions === false),
    actionable: machineStatus === "open_buyer_job" || (machineStatus === "sponsored_evaluation" && subject.acceptsSubmissions === true && subject.open === true),
    paymentAuthority: "none",
    payoutEnabled: false,
    automatedPayout: false,
    distinctions: {
      openBuyerJob: machineStatus === "open_buyer_job",
      sponsoredEvaluation: subject.evidenceClass === "sponsored" || machineStatus === "sponsored_evaluation",
      reservedClaim: machineStatus === "reserved_claim",
      acceptedObligation: machineStatus === "accepted_obligation",
      alreadyPaid: machineStatus === "already_paid",
    },
    history: historyOf(subject),
    obligationId,
    submissionId: subject.submittedAt ? `submission:${subject.taskId}:${subject.slotId ?? "-"}:${subject.submittedAt}` : null,
    rewardCount: obligationId ? 1 : 0,
    stillOwed: accepted && !chainVerified,
    paidAmount: chainVerified ? subject.amount : "0",
    termsVersion: subject.termsVersion ?? null,
    amount: subject.amount ?? null,
    asset: subject.asset ?? null,
    network: subject.network ?? null,
    submittedAt: subject.submittedAt ?? null,
    acceptedAt: subject.acceptedAt ?? null,
    publishedAcceptedAt: subject.publishedAcceptedAt ?? null,
    choose: subject.choose ?? null,
    usefulNegativeEarns,
    furtherWorkRequired,
    expiry: {
      expiresAt,
      expired,
      cancelsAccepted: false,
      obligationRemains: accepted,
    },
    settlement: {
      ...settlement,
      operatorSentAt,
      operatorSentIsChainVerification: false,
      unconfirmed: accepted && !chainVerified,
      partial,
    },
    role: {
      ...reader,
      acceptedByRole: subject.acceptedByRole ?? null,
      fraudAlleged: false,
      roleAmbiguity: "reviewer_is_not_claimant",
    },
    claim: {
      originalGrantRepublished: false,
      publicAcceptanceIsGrant: false,
      reviewerIsClaimant: false,
      binding: obligationId ? {
        taskId: subject.taskId,
        slotId: subject.slotId ?? null,
        submittedAt: subject.submittedAt ?? null,
        termsVersion: subject.termsVersion ?? null,
        choose: subject.choose ?? null,
      } : null,
    },
    unknowns: { fees, funding, effort },
    actionability: action,
    sampleDoesNotProve: sampleLimits(),
    funded: false,
    duplicateRefused: false,
    idempotentReplay: false,
    correctionRefused: false,
    payoutRedirected: false,
  };
  projection.input = input;
  return projection;
}

export function publicView(projection) {
  const view = { ...projection };
  delete view.input;
  return view;
}

export function receiveSubmission(state, submission) {
  if (!state.obligationId && !state.submissionId) {
    return {
      ...state,
      submissionId: submission.id,
      rewardCount: 1,
      duplicateRefused: false,
      idempotentReplay: false,
    };
  }
  if (submission.id === state.submissionId) {
    return { ...state, idempotentReplay: true, duplicateRefused: false, rewardCount: 1 };
  }
  return {
    ...state,
    duplicateRefused: true,
    idempotentReplay: false,
    rewardCount: 1,
    machineStatus: state.machineStatus,
    paidAmount: state.paidAmount,
    reason: "duplicate_submission",
  };
}

export function applyCorrection(state, correction) {
  const keys = Object.keys(correction);
  const allowed = new Set(["acceptedAt", "publishedAcceptedAt"]);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return {
      ...state,
      correctionRefused: true,
      reason: "correction_would_retarget_reward",
      obligationId: state.obligationId,
      rewardCount: 1,
      payoutRedirected: false,
      machineStatus: state.machineStatus,
    };
  }
  return {
    ...state,
    acceptedAt: correction.acceptedAt ?? state.acceptedAt,
    publishedAcceptedAt: correction.publishedAcceptedAt ?? state.publishedAcceptedAt,
    correctionApplied: true,
    correctionRefused: false,
    obligationId: state.obligationId,
    rewardCount: 1,
    payoutRedirected: false,
    machineStatus: state.machineStatus,
    paidAmount: state.paidAmount,
  };
}

export function recordSettlement(state, receipt, knownTx = H15_KNOWN_TX) {
  const assessment = assessSettlement(state.input?.subject
    ? {
      taskId: state.input.subject.taskId,
      slotId: state.input.subject.slotId,
      amount: state.input.subject.amount,
      asset: state.input.subject.asset,
      network: state.input.subject.network,
      transactionHash: state.input.expected?.transactionHash,
      blockNumber: state.input.expected?.blockNumber,
      timestamp: state.input.expected?.timestamp,
    }
    : {
      taskId: state.claim?.binding?.taskId,
      slotId: state.claim?.binding?.slotId,
      amount: state.amount,
      asset: state.asset,
      network: state.network,
    }, receipt, knownTx);
  if (state.settlement?.verified === true && receipt?.transactionHash
    && state.settlement.transactionHash === String(receipt.transactionHash).toLowerCase()) {
    return { ...state, idempotentReplay: true, rewardCount: 1, paidAmount: state.paidAmount, payoutEnabled: false };
  }
  if (state.settlement?.verified === true) {
    return {
      ...state,
      duplicateRefused: true,
      reason: "second_settlement_refused",
      rewardCount: 1,
      paidAmount: state.paidAmount,
      payoutEnabled: false,
    };
  }
  if (!assessment.verified) {
    return {
      ...state,
      settlement: { ...state.settlement, ...assessment, operatorSentIsChainVerification: false },
      machineStatus: state.history?.accepted ? "accepted_obligation" : state.machineStatus,
      stillOwed: Boolean(state.history?.accepted),
      paidAmount: "0",
      payoutEnabled: false,
      rewardCount: state.rewardCount,
    };
  }
  return {
    ...state,
    settlement: { ...assessment, operatorSentAt: state.settlement?.operatorSentAt ?? null, operatorSentIsChainVerification: false, unconfirmed: false, partial: false },
    machineStatus: "already_paid",
    distinctions: {
      openBuyerJob: false,
      sponsoredEvaluation: state.distinctions?.sponsoredEvaluation === true,
      reservedClaim: false,
      acceptedObligation: false,
      alreadyPaid: true,
    },
    stillOwed: false,
    paidAmount: state.amount,
    rewardCount: 1,
    payoutEnabled: false,
    nextAction: state.role?.authenticatedClaimant ? "closed_already_paid" : "do_not_claim",
    closedSlotNextAction: "do_not_claim",
  };
}

export function replay(input) {
  const first = projectLifecycle(input);
  const second = projectLifecycle(input);
  return {
    obligationId: second.obligationId,
    sameObligation: first.obligationId === second.obligationId,
    rewardCount: second.rewardCount,
    machineStatus: second.machineStatus,
    paidAmount: second.paidAmount,
    restarted: true,
  };
}
