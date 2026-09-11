import {
  CITED_BANKED_USDC,
  EARLY_X402_OPERATION_ID,
  ERROR_CODES,
  TX_RE,
} from "./pins.mjs";
import { refuse } from "./refuse.mjs";

export function classifyPayment(fields = {}, settlement = null, options = {}) {
  if (options.citedBankedUsdc === true || options.amountUsdc === CITED_BANKED_USDC) {
    return refuse(
      ERROR_CODES.CITED_BANKED_IS_NOT_PAID_RETURN,
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's paid return`,
    );
  }
  if (fields.sample === true && options.claimPaidReturn === true) {
    return refuse(ERROR_CODES.SAMPLE_IS_NOT_PAID_RETURN, "SAMPLE / --example cannot be a paid return");
  }
  if (fields.fundingState === "reserved-fixture" && options.claimPaidReturn === true) {
    return refuse(ERROR_CODES.FIXTURE_IS_NOT_PAID_RETURN, "reserved-fixture is not a settled paid return");
  }
  if (fields.sold === true && !settlement) {
    return refuse(
      ERROR_CODES.SOLD_WITHOUT_SETTLEMENT_JOIN,
      "wrapper sold=true without an exact settlement join is not paid return",
    );
  }

  if (settlement) {
    const operationId = settlement.operationId;
    const jobOperationId = options.operationId;
    if (!operationId || !jobOperationId || operationId !== jobOperationId) {
      return refuse(
        ERROR_CODES.SETTLEMENT_IS_NOT_THIS_JOB,
        "settlement operationId must equal this job's operationId",
        { settlementOperationId: operationId || null, jobOperationId: jobOperationId || null },
      );
    }
    if (operationId === EARLY_X402_OPERATION_ID) {
      return refuse(
        ERROR_CODES.SETTLEMENT_IS_NOT_THIS_JOB,
        "early-x402-revenue is not this useful-job's paid return",
      );
    }
    if (typeof settlement.transaction !== "string" || !TX_RE.test(settlement.transaction)) {
      return {
        ok: true,
        state: "none",
        settled: false,
        reason: "settlement-missing-transaction",
      };
    }
    return {
      ok: true,
      state: "settled",
      settled: true,
      operationId,
      settlementBuyerClass: settlement.buyerClass || "unknown",
      amountUsdc: settlement.amountUsdc || null,
    };
  }

  if (fields.fundingState === "reserved-fixture") {
    return { ok: true, state: "reserved-fixture", settled: false };
  }
  if (fields.fundingState === "rejected") {
    return { ok: true, state: "rejected", settled: false };
  }
  return { ok: true, state: "none", settled: false };
}
