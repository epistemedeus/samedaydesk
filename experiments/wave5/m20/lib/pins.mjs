import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");

const pin = JSON.parse(readFileSync(join(OWNED_DIR, "PIN.json"), "utf8"));

export const READOUT_CONTRACT = pin.contract;
export const TASK_ID = pin.id;
export const SDS52_SHA = pin.tested.sds52;
export const W4_COMMERCE_16 = pin.tested.w4commerce16;
export const W4_COMMERCE_03 = pin.tested.w4commerce03;
export const W4_COMMERCE_06 = pin.tested.w4commerce06;
export const D01_READ_ONLY = pin.tested.d01ReadOnly;
export const PILOT_PACKET = pin.tested.pilotPacket;
export const REMAINING_BINDING = pin.remainingBinding;

export const WRAPPER_INDEX = join(REPO_ROOT, "server/paid-useful-jobs/index.mjs");
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const CALLER_BUDGET_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json",
);
export const CALLER_BUDGET_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json",
);
export const RESERVED_PAYMENT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
);

export const RUN_BUYER_CLASSES = Object.freeze(["owner-qa", "fixture-buyer", "unknown"]);
export const SETTLEMENT_BUYER_CLASSES = Object.freeze(["independent", "owner", "sponsored", "unknown"]);
export const USE_CLASSES = Object.freeze(["no-reply", "failed-use", "useful-use", "paid-return"]);
export const TERMS_KINDS = Object.freeze([
  "disclosure",
  "kernel",
  "settlement-ledger",
  "wrapper-receipt",
]);

export const CITED_BANKED_USDC = "8.105";
export const EARLY_X402_OPERATION_ID = "early-x402-revenue";
export const TX_RE = /^0x[a-f0-9]{64}$/;

export const SIBLING_SLOTS = Object.freeze([
  { id: "W5-D27", rel: "experiments/wave5/d27/RECEIPT.md" },
  { id: "W5-M15", rel: "experiments/wave5/m15/RECEIPT.md" },
  { id: "W5-M16", rel: "experiments/wave5/m16/RECEIPT.md" },
  { id: "W5-M17", rel: "experiments/wave5/m17/RECEIPT.md" },
  { id: "W5-M18", rel: "experiments/wave5/m18/RECEIPT.md" },
  { id: "W5-M19", rel: "experiments/wave5/m19/RECEIPT.md" },
]);

export const ERROR_CODES = Object.freeze({
  MISSING_BUYER_CLASS: "missing_buyer_class",
  UNKNOWN_BUYER_CLASS: "unknown_buyer_class",
  INDEPENDENT_DEMAND_PROHIBITED: "analytics_count_is_independent_demand",
  ORGANIC_DEMAND_PROHIBITED: "organic_demand_prohibited",
  FIXTURE_BUYER_IS_NOT_INDEPENDENT: "fixture_buyer_is_not_independent",
  SETTLEMENT_IS_NOT_THIS_JOB: "settlement_is_not_this_job",
  CITED_BANKED_IS_NOT_PAID_RETURN: "cited_banked_usdc_is_not_paid_return",
  SOLD_WITHOUT_SETTLEMENT_JOIN: "sold_without_settlement_join",
  UNLIKE_TERMS_FORCED_EQUAL: "unlike_terms_forced_equal",
  SAMPLE_IS_NOT_PAID_RETURN: "sample_is_not_paid_return",
  FIXTURE_IS_NOT_PAID_RETURN: "fixture_is_not_paid_return",
  INVALID_JSON: "invalid_json",
  UNKNOWN_KIND: "unknown_observation_kind",
  MISSING_ID: "missing_observation_id",
  UNKNOWN_COMMAND: "unknown_command",
  MISSING_INPUT: "missing_input",
});

export const DOMAIN_ANALYSIS = Object.freeze([
  "completed",
  "refused",
  "informational",
  "partial",
  "actionable",
]);

export const DEFAULT_OFFER = "vendor-budget-impact";
