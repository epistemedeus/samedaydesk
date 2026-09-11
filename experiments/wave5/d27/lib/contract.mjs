import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_OUTPUTS, OWNED, SELECTED_JOB, TESTED_WRAPPER_SHA } from "./paths.mjs";

export const CONTRACT_SCHEMA = "samedaydesk.wave5.d27.independent-runtime-trial.v1";

export const BUYER_CLASS = Object.freeze({
  OWNER_QA: "owner-qa",
  RECRUITED_INDEPENDENT: "recruited-independent",
  UNKNOWN: "unknown",
});

export const KIND = Object.freeze({
  HONESTY_REFUSE: "honesty-refuse",
  TRANSPORT_FAILURE: "transport-failure",
  WRAPPER_REFUSAL: "wrapper-refusal",
  SAMPLE_NOT_SALE: "sample-not-sale",
  INCOMPLETE_DELIVERY: "incomplete-delivery",
  USEFUL_REFUSAL: "useful-refusal",
  USEFUL_NO_CHANGE: "useful-no-change",
  USEFUL_CHANGE: "useful-change",
  USEFUL_PARTIAL: "useful-partial",
});

export const WRAPPER_REFUSE_CODES = Object.freeze([
  "unknown-job",
  "missing-job",
  "missing-required-inputs",
  "input-malformed",
  "input-missing-file",
  "input-not-file",
  "input-oversize",
  "input-root-not-directory",
  "sample-not-a-sale",
  "live-sale-not-available",
  "live-settle-out-of-scope",
  "reserved-fixture-requires-payment",
  "fixture-cannot-live-settle",
]);

export const ANALYSIS_KIND = Object.freeze({
  actionable: KIND.USEFUL_CHANGE,
  informational: KIND.USEFUL_NO_CHANGE,
  refused: KIND.USEFUL_REFUSAL,
  partial: KIND.USEFUL_PARTIAL,
});

export function contractRecord() {
  return JSON.parse(readFileSync(join(OWNED, "CONTRACT.json"), "utf8"));
}

export function demandRecord({ buyerClass, recruitmentEvidence = null }) {
  return {
    claimed: false,
    buyerClass,
    recruited: buyerClass === BUYER_CLASS.RECRUITED_INDEPENDENT && Boolean(recruitmentEvidence),
    independentUtility: "unobserved",
    organicRepeat: "unobserved",
    note:
      buyerClass === BUYER_CLASS.OWNER_QA
        ? "Owner QA dry-run. Not a recruited buyer and not organic demand."
        : "Recruitment paperwork does not attest usefulness or repeat demand.",
  };
}

export { EXPECTED_OUTPUTS, SELECTED_JOB, TESTED_WRAPPER_SHA };
