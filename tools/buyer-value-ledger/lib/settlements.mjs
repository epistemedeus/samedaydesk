import {
  EARLY_X402_AMOUNT_USDC,
  EARLY_X402_OPERATION_ID,
  EVIDENCE_RECORDS_LIB,
  ERROR_CODES,
  SETTLEMENT_FIXTURE_EARLY_X402,
} from "./pins.mjs";

export async function importEvidenceRecords(libPath = EVIDENCE_RECORDS_LIB) {
  return import(libPath);
}

/**
 * Load settlement fixtures through the published evidence-records API.
 * Injected adapter: later Root/I01 bindings can replace this without a kernel copy.
 */
export function createSettlementAdapter({ evidenceLibPath = EVIDENCE_RECORDS_LIB } = {}) {
  return {
    async load() {
      const lib = await importEvidenceRecords(evidenceLibPath);
      const catalog = lib.loadCatalog();
      const dir = lib.settlementFixtureDir();
      const files = lib.listJsonFiles(dir);
      const records = files.map((filePath) => {
        const record = lib.loadJson(filePath);
        const validation = lib.validateRecord(record, catalog);
        return { filePath, record, validation };
      });
      return { catalog, records };
    },
  };
}

export const defaultSettlementAdapter = createSettlementAdapter();

export function operationIdOf(record) {
  const settlement = record?.settlement && typeof record.settlement === "object" ? record.settlement : {};
  if (typeof settlement.operationId === "string" && settlement.operationId.length > 0) {
    return settlement.operationId;
  }
  return null;
}

/**
 * Join a labelled run to a settlement fixture only with an exact operationId.
 * Missing or non-matching ids stay unknown. Never infers demand from the join.
 */
export function joinSettlement({ operationId, records = [] } = {}) {
  if (operationId == null || operationId === "") {
    return {
      matched: false,
      unknown: true,
      reason: "no_operation_id",
      operationId: null,
      jobRevenueUsdc: null,
    };
  }
  if (typeof operationId !== "string") {
    return {
      matched: false,
      unknown: true,
      reason: "invalid_operation_id",
      operationId: null,
      code: ERROR_CODES.JOIN_WITHOUT_EXACT_OPERATION_ID,
      jobRevenueUsdc: null,
    };
  }

  const hits = records.filter((item) => operationIdOf(item.record) === operationId);
  if (hits.length !== 1) {
    return {
      matched: false,
      unknown: true,
      reason: hits.length === 0 ? "no_exact_operation_id" : "ambiguous_operation_id",
      operationId,
      jobRevenueUsdc: null,
    };
  }

  const { record, validation } = hits[0];
  const settlement = record.settlement;
  return {
    matched: true,
    unknown: false,
    operationId,
    settlementBuyerClass: settlement.buyerClass,
    amountUsdc: settlement.amountUsdc,
    validDeliveryStatus: settlement.validDeliveryStatus,
    recordId: record.recordId,
    evidenceValid: validation?.ok === true,
    independentDemand: false,
    jobRevenueUsdc: null,
    note: "settlement fixture joined by exact operationId; not this job's revenue",
  };
}

export function earlyX402Pin() {
  return {
    path: SETTLEMENT_FIXTURE_EARLY_X402,
    operationId: EARLY_X402_OPERATION_ID,
    amountUsdc: EARLY_X402_AMOUNT_USDC,
    jobRevenue: false,
  };
}
