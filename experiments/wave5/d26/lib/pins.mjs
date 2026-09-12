import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXTURE_PRICE_USDC,
  LIVE_ASSET,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_NETWORK,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  REPO_ROOT,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
} from "../../../../server/paid-useful-jobs/lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export { REPO_ROOT };

export const ASSIGNMENT_ID = "W5-D26";
export const SCHEMA_EXPERIMENT = "samedaydesk.wave5.d26.experiment.v1";
export const SCHEMA_OFFER = "samedaydesk.wave5.d26.proposed-offer.v1";
export const SCHEMA_PROFILE = "samedaydesk.wave5.d26.lockfile-profile.v1";
export const SCHEMA_LIVE_OFFER = "samedaydesk.wave5.d26.lockfile-offer.v1";
export const SCHEMA_SOURCE_EXPORT = "samedaydesk.wave5.d26.source-export.v1";
export const SCHEMA_ENVIRONMENT = "samedaydesk.wave5.d26.environment.v1";

export const TESTED_SDS_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const TESTED_SDS_REF = "fable/f08-paid-wrappers";
export const TESTED_SDS_PR = 52;
export const F08_MODULE = "server/paid-useful-jobs";
export const F08_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");

/** Read-only W4 Co16 pin. Duration idea reused. Source not vendored. */
export const CO16_READ_ONLY_SHA = "aa306e291adfdd499ca971af01625ccc4bfee5c4";
export const CO16_READ_ONLY_PR = 72;

export const PILOT_PACKET_SHA = "95b3f3a47f5b1b69bd237e4c978fc3376221365d";

export {
  FIXTURE_PRICE_USDC,
  LIVE_ASSET,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_NETWORK,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
};

export const USDC_DECIMALS = 6;
export const STRIPE_CENT_DECIMALS = 2;

export const BUYER_CLASSES = Object.freeze(["owner-qa", "fixture-buyer", "unknown"]);
export const PROPOSED_JOB_ID = "vendor-budget-impact";
export const CONFIRM_JOB_ID = "feed-agenda";

/**
 * Historical assumed F08 wrapper scenario only. Not the live lockfile offer.
 * Distinct from live extract / lockfile-pin-delta 0.005, SIA 0.01, and fixture 0.02.
 */
export const PROPOSED_PRICE_USDC = "0.003";

/** Live merchant POST /lockfile-pin-delta (x402-only). Do not rewrite. */
export const LIVE_LOCKFILE_PRICE_USDC = "0.005";
export const LIVE_LOCKFILE_PRICE_ATOMIC = "5000";
export const LIVE_LOCKFILE_PATH = "/lockfile-pin-delta";
export const LIVE_LOCKFILE_METHOD = "POST";

export const MERCHANT_REPO = "epistemedeus/x402-url-extractor";
export const MERCHANT_SHA = "ca38205279f0d543515b81b7261909e55ea2600f";
export const MERCHANT_VERSION = "1.23.47";
export const MERCHANT_FACILITATOR_DEFAULT = "xpay";
export const MERCHANT_FACILITATOR_DEFAULT_URL = "https://facilitator.xpay.sh";
export const MERCHANT_FACILITATOR_CDP_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
export const DEFAULT_MERCHANT_ROOT = process.env.D26_MERCHANT_ROOT || "/tmp/d26-merchant";

export const H04_REPO = "epistemedeus/samedaydesk";
export const H04_SHA = "7026dc9ad4bc9bef6c68cf0654fff5a6d2c54bbc";
export const H04_LABEL = "W5-H04 useful-job benchmark corpus";
export const DEFAULT_H04_ROOT = process.env.D26_H04_ROOT || "/tmp/readonly-refs/sds-h04";

export const RAILWAY_RAIL_ID = "railway-usage-per-second";
export const XPAY_RAIL_ID = "x402-xpay-unknown";
export const USD12_DECIMALS = 12;

export const RAILWAY_MODEL = Object.freeze({
  id: RAILWAY_RAIL_ID,
  cpuUsdPerVcpuSecond: "0.00000772",
  memoryUsdPerGbSecond: "0.00000386",
  volumeUsdPerGbSecond: "0.00000006",
  egressUsdPerGb: "0.05",
  billing: "per-second-actual-use",
  onDemandMinimumSeconds: 0,
  accountPlan: "unknown",
  includedUsageUsd: "unknown",
  source: "https://railway.com/pricing.md",
  plansSource: "https://docs.railway.com/reference/pricing/plans",
  retrievedAt: "2026-09-12",
  quote:
    "Railway charges per-second for the CPU, memory, and disk your services actually use. Memory $0.00000386 per GB/s. CPU $0.00000772 per vCPU/s. Egress $0.05 per GB.",
  note:
    "Attribution from this VM's measured CPU/RSS, not a Railway invoice or production-capacity claim. Account plan, remaining included credits, and idle replica size are unknown.",
});

export const X402_RAIL_ID = "x402-exact-base-usdc";
export const STRIPE_RAIL_ID = "stripe-card-us-standard";

export const CITED_BANKED_USDC = "8.105";
export const EARLY_X402_OPERATION_ID = "early-x402-revenue";

export const COMPUTE_MODEL = Object.freeze({
  id: "aws-ec2-t2-t3-unlimited-linux-vcpu-hour",
  usdPerVcpuHour: "0.05",
  onDemandMinimumSeconds: 60,
  vcpuAssumed: 1,
  historicalAssumedScenario: true,
  notLiveLockfileOffer: true,
  source: "https://aws.amazon.com/ec2/pricing/on-demand/",
  retrievedAt: "2026-09-11",
  quote:
    "For T2 and T3 instances in Unlimited mode, CPU Credits are charged at: $0.05 per vCPU-Hour for Linux, RHEL and SLES. On-Demand Linux is billed per second with a 60 second minimum.",
  note:
    "HISTORICAL assumed scenario for the F08 0.003 wrapper kit. Not Railway. Not this VM invoice. A 60s minimum is not a 60s average and is not the live lockfile-pin-delta cost basis.",
});

export const USD_USDC_PEG = Object.freeze({
  id: "usd-usdc-1-1-assumed",
  note: "Conversion assumption for comparing USD card fees with USDC atomic amounts. Not an oracle quote.",
});

export const F08_BUDGET_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json",
);
export const F08_BUDGET_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json",
);
export const F08_FEED_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/feed-agenda/before.xml",
);
export const F08_FEED_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/feed-agenda/after.xml",
);
export const F08_PAYMENT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
);

export const RAILS_DIR = join(OWNED_DIR, "fixtures/rails");

export const ERROR_CODES = Object.freeze({
  UNKNOWN_COMMAND: "unknown-command",
  UNKNOWN_RAIL: "unknown-rail",
  UNKNOWN_JOB: "unknown-job",
  INVALID_DECIMAL: "invalid-decimal",
  EXCESS_PRECISION: "excess-precision",
  UNLIKE_UNITS_FORCED_EQUAL: "unlike-units-forced-equal",
  UNLIKE_RAIL_CERTIFICATION: "unlike-rail-certification",
  SAMPLE_IS_NOT_COST_BASIS: "sample-is-not-cost-basis",
  ENGINE_REFUSAL_IS_NOT_COST_BASIS: "engine-refusal-is-not-cost-basis",
  WRAPPER_FAILURE_IS_NOT_COST_BASIS: "wrapper-failure-is-not-cost-basis",
  VALID_REFUSAL_IS_NOT_FAILURE: "valid-refusal-is-not-failure",
  LIVE_SETTLE_OUT_OF_SCOPE: "live-settle-out-of-scope",
  CITED_BANKED_IS_NOT_COST_COVER: "cited-banked-is-not-cost-cover",
  SETTLEMENT_IS_NOT_JOB_REVENUE: "settlement-is-not-job-revenue",
  MISSING_BUYER_CLASS: "missing-buyer-class",
  UNKNOWN_BUYER_CLASS: "unknown-buyer-class",
  FIXTURE_BUYER_IS_NOT_INDEPENDENT: "fixture-buyer-is-not-independent",
  FREE_TIER_IS_NOT_UNIT_COST: "free-tier-is-not-unit-cost",
  PROPOSED_BELOW_FLOOR: "proposed-below-floor",
  MISSING_MEASUREMENT: "missing-measurement",
  LIVE_PRICE_REWRITE_REFUSED: "live-price-rewrite-refused",
  MERCHANT_ROOT_MISSING: "merchant-root-missing",
  H04_CORPUS_MISSING: "h04-corpus-missing",
  CORPUS_DIGEST_MISMATCH: "corpus-digest-mismatch",
  HISTORICAL_SCENARIO_IS_NOT_LIVE_LOCKFILE: "historical-scenario-is-not-live-lockfile",
  XPAY_FEE_SCHEDULE_UNKNOWN: "xpay-fee-schedule-unknown",
  RAILWAY_PLAN_UNKNOWN: "railway-plan-unknown",
  NO_LOSS_NOT_PROVEN: "no-loss-not-proven",
  HEADROOM_SKIPPED: "headroom-skipped",
});
