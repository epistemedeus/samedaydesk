export const OUTCOMES = Object.freeze([
  "unchanged",
  "changed",
  "partial",
  "error",
  "stale_baseline",
  "timed_out",
]);

export function classifyStaleBaseline(priorCreatedAt, clock, horizonHours) {
  if (!priorCreatedAt || !clock || horizonHours == null) {
    return { stale: false, reason: "horizon_not_supplied" };
  }
  const priorMs = Date.parse(priorCreatedAt);
  const clockMs = Date.parse(clock);
  if (!Number.isFinite(priorMs) || !Number.isFinite(clockMs)) {
    return { stale: false, reason: "unparseable_clock" };
  }
  const ageHours = (clockMs - priorMs) / 3_600_000;
  if (ageHours > Number(horizonHours)) {
    return {
      stale: true,
      reason: "prior_older_than_horizon",
      ageHours,
      horizonHours: Number(horizonHours),
    };
  }
  return { stale: false, ageHours, horizonHours: Number(horizonHours) };
}

export function recoveryPlan(outcome, detail = {}) {
  switch (outcome) {
    case "unchanged":
      return {
        action: "keep_prior",
        operatorNext:
          "No content change against the immutable prior. Keep the prior; schedule the next operator-supplied run.",
        detail,
      };
    case "changed":
      return {
        action: "review_and_sequence",
        operatorNext:
          "Review the evidence, then write a new sequenced artifact. Do not overwrite the immutable prior.",
        detail,
      };
    case "partial":
      return {
        action: "keep_partial_rows",
        operatorNext:
          "Keep successful rows visible. Retry only the failed sources with a fresh operator run. Partial is not a refund.",
        detail,
      };
    case "stale_baseline":
      return {
        action: "refresh_baseline",
        operatorNext:
          "Prior is older than the operator horizon. Capture a fresh baseline as a new sequenced artifact before alerting on change.",
        detail,
      };
    case "timed_out":
      return {
        action: "bounded_retry_then_stop",
        operatorNext:
          "The observation or compare step timed out. Keep the immutable prior and any partial evidence. Retry only on a fresh operator run. Do not replay payment while the outcome is uncertain.",
        detail,
      };
    case "error":
    default:
      return {
        action: "bounded_retry_then_stop",
        operatorNext:
          "Apply the recipe's bounded retry policy, then stop with the error evidence. Do not invent success or replay payment.",
        detail,
      };
  }
}
