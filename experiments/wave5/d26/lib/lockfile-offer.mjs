import {
  ERROR_CODES,
  LIVE_LOCKFILE_PRICE_ATOMIC,
  LIVE_LOCKFILE_PRICE_USDC,
  SCHEMA_LIVE_OFFER,
  USDC_DECIMALS,
} from "./pins.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";

const MUST_MEASURE = [
  "Railway account plan and remaining included usage credits (unknown here; credits are not unit cost).",
  "Production FACILITATOR setting (source default is xpay; CDP $0.001 applies only if FACILITATOR=cdp).",
  "xpay facilitator fee schedule if production stays on xpay (unpublished here, not zero).",
  "Idle replica RSS and CPU on Railway (allocated/fixed), not only per-request VM ticks.",
  "Railway dashboard CPU-seconds, GB-seconds, and egress for this service.",
  "Mix of successful vs refused vs timeout attempts in production (timeouts burn ~5s compute with no settle).",
  "Whether execute-before-settle remains true for HTTP >=400 in the deployed build.",
];

export function recommendLiveLockfileOffer({ rows = [], allocatedHour, allocatedMonth } = {}) {
  const priceAtomic = parseDecimal(LIVE_LOCKFILE_PRICE_USDC, USDC_DECIMALS);
  const successful = rows.filter((r) => r.classification === "successful");
  const refused = rows.filter((r) => r.classification === "refused");
  const failed = rows.filter((r) => r.classification === "failed");
  const maxVariableCeil = successful.reduce(
    (max, r) => Math.max(max, Number(r.railwayVariableUsdcAtomicCeil || 0)),
    0,
  );
  const cdpOnSuccess = 1000; // 0.001 USDC
  const refusedSettles = refused.filter((r) => Number(r.settleCalls) > 0).length;
  const failedSettles = failed.filter((r) => Number(r.settleCalls) > 0).length;
  const timeoutRow = rows.find((r) => r.id === "controlled-timeout");

  return {
    schema: SCHEMA_LIVE_OFFER,
    assignment: "W5-D26",
    liveLockfileOffer: true,
    historicalAssumedScenario: false,
    priceUsdc: LIVE_LOCKFILE_PRICE_USDC,
    priceAtomic: LIVE_LOCKFILE_PRICE_ATOMIC,
    priceChange: false,
    certifiedNoLoss: false,
    nonLossmaking: false,
    code: ERROR_CODES.NO_LOSS_NOT_PROVEN,
    recommendation: "keep-current-0.005-without-no-loss-claim",
    summary:
      "Keep the live POST /lockfile-pin-delta quote at 0.005 USDC (5000 atomic). Do not change the price from this kit. Per-request Railway variable cost on this VM is far below 5000 atomic after ceiling, but that is not a no-loss proof: Railway plan/credits, idle replica, xpay fees, and production mix are unmeasured. Do not substitute the historical F08 0.003 T3/60s scenario.",
    variable: {
      thisVmMaxSuccessfulRailwayCeilAtomic: String(maxVariableCeil),
      cdpUsageBasedPerSuccessfulSettleAtomic: String(cdpOnSuccess),
      cdpPlusThisVmCeilVs5000:
        priceAtomic > BigInt(maxVariableCeil + cdpOnSuccess)
          ? "5000 covers CDP $0.001 plus this-VM Railway ceiling IF production is CDP and idle/xpay/plan stay out of the unit"
          : "not shown as cover",
      note: "Variable compute is measured CPU/RSS attribution on this VM, not Railway's bill. Ceiling to 1 atomic USDC still dwarfs sub-atomic Railway seconds.",
    },
    failedVersusSuccessful: {
      executeBeforeSettle: "HTTP >=400 cancels settlement (charged false). Refused and failed attempts should have zero settle calls.",
      refusedWithSettle: refusedSettles,
      failedWithSettle: failedSettles,
      railwayStillBurnsOnRefuseAndFail: true,
      timeoutCeilingMs: 5000,
      timeoutIsNotAverage: true,
      timeoutMeasuredWallMs: timeoutRow?.wallMs ?? null,
      timeoutSettleCalls: timeoutRow?.settleCalls ?? null,
    },
    allocatedFixed: {
      thisVmIdleRssHourUsd: allocatedHour?.variableUsd ?? null,
      thisVmIdleRssMonthUsd: allocatedMonth?.variableUsd ?? null,
      accountPlan: "unknown",
      includedUsageUsd: "unknown",
      note: "Allocated cost dominates if the replica stays up. Do not treat Hobby/Pro included credits as unit-cost cover. Production replica size is unknown.",
    },
    facilitator: {
      sourceDefault: "xpay",
      xpayFee: "unknown",
      cdpFeeIfEnabled: "verify free; $0.001 per onchain settle after 1000/month free tier (tier is not unit cost)",
    },
    timeoutDecision:
      "Keep the 5000ms worker ceiling until production mix and measured H04 walls show saturation. A max of 5000ms is not a 5000ms average. Do not raise or lower it from this kit without those measurements.",
    mustMeasureBeforeNoLoss: MUST_MEASURE,
    coversFloorClaim: false,
    publishedToLiveCatalog: false,
    liveSettleAttempted: false,
    offer: {
      proposedPriceUsdc: formatUsdc(priceAtomic),
      proposedPriceAtomic: priceAtomic.toString(),
      keepCurrentOffer: true,
    },
  };
}
