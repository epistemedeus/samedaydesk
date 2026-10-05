import {
  CITED_BANKED_USDC,
  D13_LEDGER_ROW_SCHEMA,
  D13_LEDGER_SCHEMA,
  OPERATIONAL_ERROR_DELIVERIES,
  OUTCOME_KINDS,
  PR52_RECEIPT_SCHEMA,
} from "./contract.mjs";
import { refuse } from "./refuse.mjs";

export function factsFromSettlement(record) {
  const settlement = record?.settlement && typeof record.settlement === "object" ? record.settlement : {};
  const delivery =
    typeof settlement.validDeliveryStatus === "string" ? settlement.validDeliveryStatus : "";
  return {
    operationId: typeof settlement.operationId === "string" ? settlement.operationId : null,
    amountUsdc: typeof settlement.amountUsdc === "string" ? settlement.amountUsdc : null,
    buyerClass: typeof settlement.buyerClass === "string" ? settlement.buyerClass : null,
    delivery,
    sourceKind: typeof record?.sourceKind === "string" ? record.sourceKind : null,
    outcomeKind: outcomeKindFromDelivery(delivery),
    factKind: "settlement",
  };
}

export function outcomeKindFromDelivery(delivery) {
  if (OPERATIONAL_ERROR_DELIVERIES.includes(delivery)) return "operational_error";
  if (delivery === "" || delivery === "unknown") return "unknown";
  return "analysis";
}

export function loadLedgerDocument(document) {
  if (!document || typeof document !== "object" || document.schema !== D13_LEDGER_SCHEMA) {
    refuse("d13_ledger_schema", `ledger must use ${D13_LEDGER_SCHEMA}`);
  }
  if (document.jobRevenueUsdc === CITED_BANKED_USDC) {
    refuse(
      "cited_banked_usdc_is_not_job_revenue",
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
    );
  }
  if (document.jobRevenueUsdc != null) {
    refuse("settlement_is_not_job_revenue", "buyer-value ledger jobRevenueUsdc is not a refund policy");
  }
  if (document.citedBankedUsdcIsNotJobRevenue === false) {
    refuse(
      "cited_banked_usdc_is_not_job_revenue",
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
    );
  }
  const rows = Array.isArray(document.rows) ? document.rows : [];
  return rows.map(factsFromLedgerRow);
}

export function factsFromLedgerRow(row) {
  if (!row || row.schema !== D13_LEDGER_ROW_SCHEMA) {
    refuse("d13_ledger_schema", `ledger row must use ${D13_LEDGER_ROW_SCHEMA}`);
  }
  if (row.jobRevenueUsdc === CITED_BANKED_USDC) {
    refuse(
      "cited_banked_usdc_is_not_job_revenue",
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
    );
  }
  const join = row.settlementJoin && typeof row.settlementJoin === "object" ? row.settlementJoin : {};
  const engine = row.engine && typeof row.engine === "object" ? row.engine : {};
  const delivery =
    typeof join.validDeliveryStatus === "string" ? join.validDeliveryStatus : "";
  return {
    operationId: typeof join.operationId === "string" ? join.operationId : null,
    amountUsdc: typeof join.amountUsdc === "string" ? join.amountUsdc : null,
    buyerClass:
      typeof join.settlementBuyerClass === "string" ? join.settlementBuyerClass : row.buyerClass ?? null,
    delivery,
    sourceKind: "buyer_value_ledger",
    outcomeKind: outcomeKindFromLedger(row, engine, delivery),
    factKind: "ledger_row",
    jobId: row.jobId ?? null,
    usableOutput: row.usableOutput === true,
  };
}

function outcomeKindFromLedger(row, engine, delivery) {
  if (engine.ok === true && (row.usableOutput === true || engine.refused === true)) {
    return "analysis";
  }
  if (engine.ok === false && Number.isInteger(engine.exitCode) && engine.exitCode !== 0) {
    return "engine_failure";
  }
  if (engine.ok === false) return "transport_failure";
  return outcomeKindFromDelivery(delivery);
}

export function factsFromPr52Receipt(receipt) {
  if (!receipt || receipt.schema !== PR52_RECEIPT_SCHEMA) {
    refuse("invalid_pr52_receipt", `receipt must use ${PR52_RECEIPT_SCHEMA}`);
  }
  const engine = receipt.engineResult && typeof receipt.engineResult === "object" ? receipt.engineResult : null;
  let outcomeKind = "unknown";
  if (!engine) outcomeKind = "transport_failure";
  else if (engine.ok === true && engine.refused === true) outcomeKind = "analysis";
  else if (engine.ok === true) outcomeKind = "analysis";
  else if (engine.ok === false) outcomeKind = "engine_failure";
  return {
    operationId: typeof receipt.operationId === "string" ? receipt.operationId : receipt.jobId ?? null,
    amountUsdc: null,
    buyerClass: null,
    delivery: "",
    sourceKind: "pr52_receipt",
    outcomeKind,
    factKind: "pr52_receipt",
    jobId: receipt.jobId ?? null,
    sold: receipt.sold === true,
  };
}

export function overlayLedgerFacts(settlementFacts, ledgerFacts) {
  const extra = ledgerFacts.find((item) => item.operationId && item.operationId === settlementFacts.operationId);
  if (!extra) return settlementFacts;
  const outcomeKind = extra.outcomeKind;
  if (!OUTCOME_KINDS.includes(outcomeKind)) {
    refuse("invalid_outcome_kind", `ledger outcomeKind is not in the closed set: ${outcomeKind}`);
  }
  return {
    ...settlementFacts,
    outcomeKind,
    ledgerJobId: extra.jobId,
    usableOutput: extra.usableOutput,
  };
}
