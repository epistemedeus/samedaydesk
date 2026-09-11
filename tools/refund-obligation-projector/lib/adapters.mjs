import {
  listJsonFiles,
  loadCatalog,
  loadJson,
  settlementFixtureDir,
  validateRecord,
} from "../../evidence-records/lib.mjs";
import { CITED_BANKED_USDC, formatUsdc, parseUsdc } from "../../evidence/reconcile.mjs";
import { refuse } from "./refuse.mjs";
import { createTermsAdapter } from "./terms.mjs";

export const LATER_BINDINGS = Object.freeze({
  evidenceRecords: "tools/evidence-records on SDS main 5b97d1b02e786acd1895cfa1508087ae3f7a1545",
  reconcile: "tools/evidence/reconcile.mjs",
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
      citedBankedUsdc: CITED_BANKED_USDC,
      ...overrides.evidence,
    },
    terms: createTermsAdapter(overrides.terms),
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
    laterBindings: { ...LATER_BINDINGS, ...overrides.laterBindings },
  };
}
