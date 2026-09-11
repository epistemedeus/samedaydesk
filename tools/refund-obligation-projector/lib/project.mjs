import { createAdapters } from "./adapters.mjs";
import { assertRefundClaim, classifyRefundClaim } from "./claim.mjs";
import { refuse } from "./refuse.mjs";

export const PROJECTION_SCHEMA = "samedaydesk.refund-obligation-projection.v1";
export const EVIDENCE_KINDS = Object.freeze(["fixture", "local_runtime", "external"]);

export function projectRecords(records, adapters = createAdapters(), options = {}) {
  applyForbiddenOptions(options, adapters);

  const catalog = adapters.evidence.loadCatalog();
  const rows = [];
  const rejected = [];

  for (const record of records) {
    const validated = adapters.evidence.validateRecord(record, catalog);
    if (!validated.ok) {
      rejected.push({
        recordId: typeof record?.recordId === "string" ? record.recordId : null,
        errors: validated.errors,
      });
      continue;
    }

    const termsVersion = record?.settlement?.termsVersion ?? options.termsVersion ?? null;
    const terms = adapters.terms.assertKind(termsVersion);
    if (!terms.ok) {
      rejected.push({
        recordId: typeof record?.recordId === "string" ? record.recordId : null,
        errors: [{ code: terms.code, path: "$.termsVersion", message: terms.message }],
      });
      continue;
    }

    if (!record.settlement || typeof record.settlement !== "object") {
      rejected.push({
        recordId: typeof record?.recordId === "string" ? record.recordId : null,
        errors: [
          {
            code: "missing_settlement",
            path: "$.settlement",
            message: "settlement observations are required to project refund claims",
          },
        ],
      });
      continue;
    }

    const amountUsdc = adapters.evidence.formatUsdc(
      adapters.evidence.parseUsdc(record.settlement.amountUsdc),
    );
    const refundClaim = assertRefundClaim(classifyRefundClaim(record));
    rows.push({
      operationId: record.settlement.operationId,
      amountUsdc,
      buyerClass: record.settlement.buyerClass,
      delivery: record.settlement.validDeliveryStatus,
      refundClaim,
      paidOut: false,
    });
  }

  if (rejected.length > 0) {
    return { ok: false, rejected, projection: null };
  }

  rows.sort((a, b) => a.operationId.localeCompare(b.operationId));
  const evidenceKind = EVIDENCE_KINDS.includes(options.evidenceKind)
    ? options.evidenceKind
    : "fixture";

  return {
    ok: true,
    rejected: [],
    projection: {
      schema: PROJECTION_SCHEMA,
      mode: "read_only",
      nonsettling: true,
      evidenceKind,
      citedBankedUsdc: adapters.evidence.formatUsdc(
        adapters.evidence.parseUsdc(adapters.evidence.citedBankedUsdc),
      ),
      citedBankedSpendable: false,
      payableAsserted: false,
      stripeRefundsCalled: false,
      obligationsPostedAsPaid: false,
      revenueAcrossBuyerClass: null,
      paidOut: false,
      records: rows,
    },
  };
}

export function loadSettlementRecords(dir, adapters = createAdapters()) {
  const files = adapters.evidence.listJsonFiles(dir ?? adapters.evidence.settlementFixtureDir());
  return files.map((filePath) => ({ filePath, record: adapters.evidence.loadJson(filePath) }));
}

export function projectDir(dir, adapters = createAdapters(), options = {}) {
  const loaded = loadSettlementRecords(dir, adapters);
  return projectRecords(
    loaded.map((item) => item.record),
    adapters,
    options,
  );
}

export function asRevenue(_projection) {
  refuse(
    "sum_across_buyer_class_as_revenue",
    "cannot sum independent and owner (or any buyerClass mix) as revenue",
  );
}

function applyForbiddenOptions(options, adapters) {
  if (options.executeRefund) adapters.stripe.executeRefund();
  if (options.postPaid) adapters.obligations.postPaid();
  if (options.sumAsRevenue) asRevenue(null);
}
