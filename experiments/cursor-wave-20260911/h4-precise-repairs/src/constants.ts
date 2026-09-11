import type { SubjectJobId } from "./types.ts";

export const SDS_START_HEAD = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const FEATURE_BRANCH = "fable/h4-precise-repairs";
export const H4R_BRANCH = "fable/h4r-defect-corpus";
export const MERCHANT_PIN = "a143898dd1ec35c097ca7eb0b472f30dad1ee319";
export const SESSION_ID = "1434eeed-5e5c-48d1-b2d1-1ea29c966400";
export const H4R_SESSION_ID = "512803b8-c0dc-4a9d-a58f-1ab2d07cc0a3";
export const COMPARE_URL =
  "https://github.com/epistemedeus/samedaydesk/compare/main...fable/h4r-defect-corpus";

export const SUBJECT_JOB_IDS: readonly SubjectJobId[] = Object.freeze([
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
]);

/** Live unpaid-402 pins. This pack must not change them. */
export const LIVE_PRICES = Object.freeze({
  extract: Object.freeze({
    route: "/extract",
    display: "$0.005",
    amountAtomic: "5000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
  }),
  "seller-integrity-audit": Object.freeze({
    route: "/commerce/seller-integrity-audit",
    display: "$0.01",
    amountAtomic: "10000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
  }),
});

export const DEFAULT_ROLLBACK =
  "Discard the intake record. Do not retry payment. Do not change live prices. Do not reassign verifyPayment or settlePayment.";

export const SHA256_RE = /^[a-fA-F0-9]{64}$/;
