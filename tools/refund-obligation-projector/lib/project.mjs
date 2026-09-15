import { createAdapters } from "./adapters.mjs";
import { projectClaim } from "./claim.mjs";
import {
  CITED_BANKED_USDC,
  PROJECTION_SCHEMA,
} from "./contract.mjs";
import {
  factsFromPr52Receipt,
  factsFromSettlement,
  loadLedgerDocument,
  overlayLedgerFacts,
} from "./facts.mjs";
import { parsePolicy } from "./policy.mjs";
import { refuse } from "./refuse.mjs";

export { PROJECTION_SCHEMA };
export const EVIDENCE_KINDS = Object.freeze(["fixture", "local_runtime", "external"]);

export function projectRecords(records, adapters = createAdapters(), options = {}) {
  applyForbiddenOptions(options, adapters);
  const policy = resolvePolicy(options, adapters);
  const ledgerFacts = loadLedgerFacts(options, adapters);

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

    const termsVersion = record?.settlement?.termsVersion ?? options.termsVersion ?? policy?.termsVersion ?? null;
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
    const facts = overlayReceiptFacts(
      overlayLedgerFacts(factsFromSettlement(record), ledgerFacts),
      options,
    );
    const claim = projectClaim(facts, policy);
    rows.push({
      operationId: record.settlement.operationId,
      amountUsdc,
      buyerClass: record.settlement.buyerClass,
      delivery: record.settlement.validDeliveryStatus,
      outcomeKind: facts.outcomeKind,
      refundClaim: claim.refundClaim,
      refundClaimSource: claim.refundClaimSource,
      policyId: claim.policyId,
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

  const projection = {
    schema: PROJECTION_SCHEMA,
    mode: "read_only",
    nonsettling: true,
    evidenceKind,
    citedBankedUsdcAttached: false,
    payableAsserted: false,
    stripeRefundsCalled: false,
    obligationsPostedAsPaid: false,
    revenueAcrossBuyerClass: null,
    paidOut: false,
    records: rows,
  };
  assertNoCitedBanked(projection);
  return { ok: true, rejected: [], projection };
}

export function projectDossier(operationId, records, adapters = createAdapters(), options = {}) {
  if (typeof operationId !== "string" || operationId.length === 0) {
    return {
      ok: false,
      code: "no_exact_operation_id",
      rejected: [
        {
          recordId: null,
          errors: [
            {
              code: "no_exact_operation_id",
              path: "$.operationId",
              message: "dossier requires one exact operationId",
            },
          ],
        },
      ],
      projection: null,
    };
  }
  const matched = records.filter((record) => record?.settlement?.operationId === operationId);
  if (matched.length !== 1) {
    return {
      ok: false,
      code: "no_exact_operation_id",
      rejected: [
        {
          recordId: typeof matched[0]?.recordId === "string" ? matched[0].recordId : null,
          errors: [
            {
              code: "no_exact_operation_id",
              path: "$.operationId",
              message: "dossier requires exactly one settlement with that operationId",
            },
          ],
        },
      ],
      projection: null,
    };
  }
  return projectRecords(matched, adapters, { ...options, dossier: true });
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

function resolvePolicy(options, adapters) {
  if (Object.hasOwn(options, "policy") && options.policy == null) return null;
  if (options.policy) return parsePolicy(options.policy, adapters.terms);
  return null;
}

function loadLedgerFacts(options, adapters) {
  if (!options.ledger) return [];
  const loaded = adapters.jobFacts.loadLedger(options.ledger);
  return loadLedgerDocument(loaded);
}

function overlayReceiptFacts(facts, options) {
  if (!options.receipt) return facts;
  const extra = factsFromPr52Receipt(options.receipt);
  if (extra.operationId !== facts.operationId) return facts;
  return { ...facts, outcomeKind: extra.outcomeKind };
}

function applyForbiddenOptions(options, adapters) {
  if (options.executeRefund) adapters.stripe.executeRefund();
  if (options.postPaid) adapters.obligations.postPaid();
  if (options.sumAsRevenue) asRevenue(null);
  if (options.attachCitedBanked) adapters.citedBanked.attach();
}

function assertNoCitedBanked(projection) {
  const body = JSON.stringify(projection);
  if (body.includes(CITED_BANKED_USDC)) {
    refuse(
      "cited_banked_usdc_is_not_job_revenue",
      `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
    );
  }
}
