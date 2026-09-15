export const PROJECTION_SCHEMA = "samedaydesk.refund-obligation-projection.v1";
export const POLICY_SCHEMA = "samedaydesk.refund-policy.v1";
export const REFUND_CLAIMS = Object.freeze(["none", "unknown", "not-offered"]);
export const REFUND_CLAIM_SOURCES = Object.freeze([
  "explicit_policy",
  "no_policy",
  "no_matching_rule",
]);
export const OUTCOME_KINDS = Object.freeze([
  "analysis",
  "operational_error",
  "engine_failure",
  "transport_failure",
  "unknown",
]);
export const OPERATIONAL_ERROR_DELIVERIES = Object.freeze([
  "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  "intake_required",
]);
export const CITED_BANKED_USDC = "8.105";
export const D13_LEDGER_SCHEMA = "samedaydesk.buyer-value-ledger.v1";
export const D13_LEDGER_ROW_SCHEMA = "samedaydesk.buyer-value-ledger.row.v1";
export const PR52_RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";

export const TESTED_BINDINGS = Object.freeze({
  evidenceRecords: "tools/evidence-records on this SDS checkout",
  d13BuyerValueLedger: {
    sha: "aa306e291adfdd499ca971af01625ccc4bfee5c4",
    schema: D13_LEDGER_SCHEMA,
    rowSchema: D13_LEDGER_ROW_SCHEMA,
    remaining:
      "Wave5 D13 may amend the ledger. This projector consumes the W4 pin row shape only and does not copy the ledger kernel.",
  },
  pr52PaidWrappers: {
    sha: "aeef964fa188443078958d9d6d393afae1d542ee",
    receiptSchema: PR52_RECEIPT_SCHEMA,
    remaining:
      "D01 may amend the wrapper. This projector reads engineResult.ok/refused from the published receipt schema and does not wrap jobs.",
  },
  i01HashTerms: {
    pin: "819fa637ecf5e5177c84efc16fcaa18d57017631",
    remaining: "hashTermsVersion stays injected. Unlike terms documents are not forced equal.",
  },
});
