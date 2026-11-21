/**
 * Availability and job type decide whether a row is an open buyer job.
 * A positive modeled expected value does not.
 */

export const NOT_A_CURRENT_BUYER_JOB_LABEL = "not a current buyer job";
export const NOT_A_CURRENT_BUYER_JOB_CODE = "not_a_current_buyer_job";

const AVAILABILITY = {
  hypothetical_not_a_live_listing: { jobClass: "hypothetical", buyerJob: false },
  current_official_listing_not_marketplace_work: { jobClass: "referral", buyerJob: false },
  not_current: { jobClass: "historical", buyerJob: false },
  stale_not_current: { jobClass: "historical", buyerJob: false },
  current_buyer_job: { jobClass: "open_buyer_job", buyerJob: true },
};

export function unknown(field) {
  return { kind: "unknown", field };
}

export function observedOrUnknown(value, field) {
  if (value && typeof value === "object" && (value.kind === "unknown" || value.kind === "stated" || value.kind === "measured" || value.kind === "missing")) {
    return value;
  }
  return unknown(field);
}

function profitValue(expectedProfit) {
  if (expectedProfit == null) return null;
  if (typeof expectedProfit === "string" || typeof expectedProfit === "number") return Number(expectedProfit);
  if (typeof expectedProfit.value === "string" || typeof expectedProfit.value === "number") return Number(expectedProfit.value);
  return null;
}

/**
 * @param {object} input availability, jobType, optional expectedProfit, fees, funding, effort
 */
export function projectActionability(input) {
  const availability = input.availability ?? "unknown";
  const spec = AVAILABILITY[availability] ?? null;
  const jobType = input.jobType ?? input.code ?? "unknown";
  const label = input.label ?? (spec && spec.buyerJob === false ? NOT_A_CURRENT_BUYER_JOB_LABEL : null);
  const code = input.code ?? (spec && spec.buyerJob === false ? NOT_A_CURRENT_BUYER_JOB_CODE : jobType);
  const profit = profitValue(input.expectedProfit);
  const positiveEv = profit != null && Number.isFinite(profit) && profit > 0;
  const availabilitySaysBuyer = spec?.buyerJob === true;
  const jobTypeSaysBuyer = jobType === "buyer_job";
  const agreement = spec == null
    ? false
    : (availabilitySaysBuyer === jobTypeSaysBuyer) || jobType === NOT_A_CURRENT_BUYER_JOB_CODE || jobType === "referral";
  const openFlag = input.open === true && input.acceptsSubmissions !== false;
  const openBuyerJob = availabilitySaysBuyer && jobTypeSaysBuyer && agreement && openFlag;
  const jobClass = openBuyerJob ? "open_buyer_job" : (spec?.jobClass ?? "unknown");

  return {
    availability,
    jobType,
    jobClass,
    label,
    code,
    currentBuyerJob: false === spec?.buyerJob ? false : openBuyerJob,
    openBuyerJob,
    actionable: openBuyerJob,
    machineStatus: openBuyerJob ? "open_buyer_job" : (jobClass === "unknown" ? "not_a_buyer_job" : "not_a_buyer_job"),
    referral: jobClass === "referral",
    hypothetical: jobClass === "hypothetical",
    expectedProfitUsed: false,
    positiveExpectedValueIgnored: positiveEv,
    manufacturedFromEv: false,
    availabilityAuthoritative: true,
    jobTypeAuthoritative: true,
    agreement,
    fees: observedOrUnknown(input.fees, "fees"),
    funding: observedOrUnknown(input.funding, "funding"),
    effort: observedOrUnknown(input.effort, "effort"),
    nextAction: openBuyerJob ? "read_buyer_terms" : "do_not_treat_as_buyer_job",
  };
}
