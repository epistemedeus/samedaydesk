const ANALYSIS_KINDS = new Set([
  "analysis_success",
  "analysis_no_change",
  "analysis_refusal",
]);

/**
 * Transport/engine failure is not a valid analysis refusal.
 * A refused or unchanged report can still be useful delivery, never paid work
 * by itself.
 */
export function classifyOutcome({ status, json, error } = {}) {
  if (status == null) return "transport_failure";
  if (status !== 0) return "engine_failure";
  if (error && !json) return "transport_failure";
  if (!json) return "transport_failure";
  if (json.ok === false) return "engine_failure";
  const st = json.status;
  if (st === "refused") return "analysis_refusal";
  if (st === "no-change" || st === "no_change" || st === "unchanged") {
    return "analysis_no_change";
  }
  return "analysis_success";
}

export function isAnalysisOutcome(kind) {
  return ANALYSIS_KINDS.has(kind);
}

export function paidWorkBlockers({
  kitVerified = true,
  outcomeKind,
  producedThisRun,
  usableOutput,
  settlementJoin,
  sample,
  buyerClass,
  purchaseAuthority = false,
} = {}) {
  const blockers = [];
  if (kitVerified !== true) blockers.push("wrong_source_cache");
  if (
    !isAnalysisOutcome(outcomeKind) ||
    producedThisRun !== true ||
    usableOutput !== true
  ) {
    blockers.push("failed_result");
  }
  if (settlementJoin?.boundToThisJob !== true || settlementJoin?.thisJobPayment !== true) {
    blockers.push("unrelated_or_unbound_payment");
  }
  if (sample === true) blockers.push("sample_is_not_paid_work");
  if (buyerClass === "owner-qa" || buyerClass === "fixture-buyer") {
    blockers.push("labelled_run_is_not_paid_work");
  }
  if (purchaseAuthority !== true) blockers.push("nonsettling_prototype");
  return blockers;
}

export function classifyUsefulPaidWork(input = {}) {
  const blockers = paidWorkBlockers(input);
  return {
    usefulPaidWork: blockers.length === 0,
    usefulDelivery:
      isAnalysisOutcome(input.outcomeKind) &&
      input.producedThisRun === true &&
      input.usableOutput === true,
    blockers,
  };
}
