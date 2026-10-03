import {
  CITED_BANKED_USDC,
  EARLY_X402_AMOUNT_USDC,
  EARLY_X402_OPERATION_ID,
  ERROR_CODES,
  PROPOSED_ENVELOPE_USDC,
} from "./pins.mjs";
import { refuse } from "./labels.mjs";

function listedOperations(options = {}) {
  const ids = [];
  if (Array.isArray(options.includeOperationIds)) ids.push(...options.includeOperationIds);
  if (options.includeOperation) ids.push(options.includeOperation);
  if (options.operationId) ids.push(options.operationId);
  return ids.filter(Boolean);
}

/**
 * Labelled useful-job runs have no job revenue. Settlements and the banked
 * 8.105 USDC table must not be summed into this job. F10's 2 USDC envelope
 * is a proposed portfolio budget, not this run's price.
 */
export function attributeJobRevenue(options = {}) {
  const ops = listedOperations(options);
  if (ops.includes(EARLY_X402_OPERATION_ID) || options.includeEarlyX402 === true) {
    return refuse(
      ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE,
      `cannot sum ${EARLY_X402_OPERATION_ID} (${EARLY_X402_AMOUNT_USDC} USDC) as this useful-job run's revenue`,
      {
        operationId: EARLY_X402_OPERATION_ID,
        amountUsdc: EARLY_X402_AMOUNT_USDC,
        jobRevenueUsdc: null,
        citedBankedUsdc: CITED_BANKED_USDC,
        proposedEnvelopeUsdc: PROPOSED_ENVELOPE_USDC,
      },
    );
  }

  const cited =
    options.citedBankedUsdc === true ||
    options.attributeCitedBanked === true ||
    options.amountUsdc === CITED_BANKED_USDC ||
    options.jobRevenueUsdc === CITED_BANKED_USDC ||
    options.includeCitedBanked === true;

  if (cited) {
    return refuse(
      ERROR_CODES.CITED_BANKED_USDC_IS_NOT_JOB_REVENUE,
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
      {
        citedBankedUsdc: CITED_BANKED_USDC,
        jobRevenueUsdc: null,
        proposedEnvelopeUsdc: PROPOSED_ENVELOPE_USDC,
      },
    );
  }

  if (ops.length > 0 || options.sumSettlements === true) {
    return refuse(
      ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE,
      "settlement fixtures are not this useful-job run's revenue",
      {
        includeOperationIds: ops,
        jobRevenueUsdc: null,
      },
    );
  }

  return {
    ok: true,
    jobRevenueUsdc: null,
    citedBankedUsdc: CITED_BANKED_USDC,
    citedBankedUsdcIsNotJobRevenue: true,
    proposedEnvelopeUsdc: PROPOSED_ENVELOPE_USDC,
    proposedEnvelopeIsNotJobRevenue: true,
    independentDemand: false,
  };
}

export function honestyEnvelope(extra = {}) {
  return {
    purchaseAuthority: false,
    purchaseAuthorized: false,
    independentDemand: false,
    organicDemand: false,
    jobRevenueUsdc: null,
    citedBankedUsdc: CITED_BANKED_USDC,
    citedBankedUsdcIsNotJobRevenue: true,
    proposedEnvelopeUsdc: PROPOSED_ENVELOPE_USDC,
    proposedEnvelopeIsNotJobRevenue: true,
    payments: "nonsettling-prototype",
    readyForRelease: false,
    i01EarnedWork: "not-this-family",
    ...extra,
  };
}
