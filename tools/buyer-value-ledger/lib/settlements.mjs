import {
  EARLY_X402_AMOUNT_USDC,
  EARLY_X402_OPERATION_ID,
  EVIDENCE_RECORDS_LIB,
  ERROR_CODES,
  SETTLEMENT_FIXTURE_EARLY_X402,
} from "./pins.mjs";
import { isAnalysisOutcome } from "./outcome.mjs";

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

export function settlementJobId(record) {
  if (typeof record?.jobId === "string" && record.jobId.length > 0) return record.jobId;
  if (typeof record?.settlement?.jobId === "string" && record.settlement.jobId.length > 0) {
    return record.settlement.jobId;
  }
  return null;
}

/**
 * Join a labelled run to a settlement only with exact operationId AND job
 * correspondence. Evidence-records settlement schema has no jobId, so those
 * fixtures stay unbound. Do not hash settlement terms to the request hash.
 */
export function joinSettlement({
  operationId,
  jobId = null,
  outcomeKind = null,
  records = [],
} = {}) {
  if (operationId == null || operationId === "") {
    return {
      matched: false,
      operationIdFound: false,
      unknown: true,
      boundToThisJob: false,
      thisJobPayment: false,
      reason: "no_operation_id",
      operationId: null,
      jobRevenueUsdc: null,
    };
  }
  if (typeof operationId !== "string") {
    return {
      matched: false,
      operationIdFound: false,
      unknown: true,
      boundToThisJob: false,
      thisJobPayment: false,
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
      operationIdFound: false,
      unknown: true,
      boundToThisJob: false,
      thisJobPayment: false,
      reason: hits.length === 0 ? "no_exact_operation_id" : "ambiguous_operation_id",
      operationId,
      jobRevenueUsdc: null,
    };
  }

  const { record, validation } = hits[0];
  const settlement = record.settlement;
  const settlementJob = settlementJobId(record);
  const boundToThisJob = Boolean(jobId && settlementJob && settlementJob === jobId);
  const deliveryKnown =
    typeof settlement.validDeliveryStatus === "string" &&
    settlement.validDeliveryStatus.length > 0 &&
    settlement.validDeliveryStatus !== "unknown";
  const thisJobPayment =
    boundToThisJob &&
    deliveryKnown &&
    isAnalysisOutcome(outcomeKind) &&
    validation?.ok === true;

  return {
    matched: boundToThisJob,
    operationIdFound: true,
    unknown: !boundToThisJob,
    boundToThisJob,
    thisJobPayment,
    reason: boundToThisJob ? "bound_job_and_operation" : "unrelated_or_unbound_payment",
    operationId,
    settlementJobId: settlementJob,
    requestedJobId: jobId || null,
    settlementBuyerClass: settlement.buyerClass,
    amountUsdc: settlement.amountUsdc,
    validDeliveryStatus: settlement.validDeliveryStatus,
    recordId: record.recordId,
    evidenceValid: validation?.ok === true,
    independentDemand: false,
    jobRevenueUsdc: null,
    note: boundToThisJob
      ? "settlement bound by exact operationId and jobId; not live paid work"
      : "operationId observed but not this job's settlement; not this job's revenue",
  };
}

export function earlyX402Pin() {
  return {
    path: SETTLEMENT_FIXTURE_EARLY_X402,
    operationId: EARLY_X402_OPERATION_ID,
    amountUsdc: EARLY_X402_AMOUNT_USDC,
    jobRevenue: false,
    boundToVendorBudgetImpact: false,
  };
}
