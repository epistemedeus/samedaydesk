import {
  listJsonFiles,
  loadCatalog,
  loadJson,
  settlementFixtureDir,
  validateRecord,
} from "../../evidence-records/lib.mjs";
import { formatUsdc, parseUsdc } from "../../evidence/reconcile.mjs";
import { CITED_BANKED_USDC, TESTED_BINDINGS } from "./contract.mjs";
import { refuse } from "./refuse.mjs";
import { createTermsAdapter } from "./terms.mjs";

export const LATER_BINDINGS = Object.freeze({
  evidenceRecords: TESTED_BINDINGS.evidenceRecords,
  reconcile: "tools/evidence/reconcile.mjs (USDC parse/format only; banked total is not a job field)",
  d13BuyerValueLedger: TESTED_BINDINGS.d13BuyerValueLedger,
  pr52PaidWrappers: TESTED_BINDINGS.pr52PaidWrappers,
  earnedWorkHashTerms:
    "inject Neo PR54 packs/funded-task-terms hashTermsVersion; do not import original F01 integer termsVersion",
  earnedWorkKernel: "I01 Neo PR54 owns earned-work core; this projector does not copy it",
  stripeRefunds: "not bound; executeRefund always refuses",
  obligationPayout: "not bound; postPaid always refuses",
});

export function createAdapters(overrides = {}) {
  return {
    evidence: {
      loadCatalog,
      validateRecord,
      listJsonFiles,
      loadJson,
      settlementFixtureDir,
      parseUsdc,
      formatUsdc,
      ...overrides.evidence,
    },
    terms: createTermsAdapter(overrides.terms),
    jobFacts: {
      loadLedger(document) {
        return document;
      },
      ...overrides.jobFacts,
    },
    stripe: {
      executeRefund() {
        refuse("execute_refund_refused", "this projector never calls Stripe refunds");
      },
      ...overrides.stripe,
    },
    obligations: {
      postPaid() {
        refuse("post_paid_refused", "this projector never posts obligations as paid");
      },
      ...overrides.obligations,
    },
    citedBanked: {
      attach() {
        refuse(
          "cited_banked_usdc_is_not_job_revenue",
          `${CITED_BANKED_USDC} USDC is the banked settlement observation, not this job's revenue`,
        );
      },
      ...overrides.citedBanked,
    },
    laterBindings: { ...LATER_BINDINGS, ...overrides.laterBindings },
  };
}
