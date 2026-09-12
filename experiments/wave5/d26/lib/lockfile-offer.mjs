import {
  ERROR_CODES,
  LIVE_LOCKFILE_PRICE_ATOMIC,
  LIVE_LOCKFILE_PRICE_USDC,
  MERCHANT_FACILITATOR_CDP_URL,
  MERCHANT_FACILITATOR_DEFAULT,
  PRODUCTION_RAILWAY_OBSERVATION,
  SCHEMA_LIVE_OFFER,
  USDC_DECIMALS,
} from "./pins.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";

const MUST_MEASURE = [
  "Railway account plan and remaining included usage credits (unread; credits are not unit cost).",
  "CDP account balance and remaining free-tier onchain count (unread; official schedule is first 1000/month then $0.001, and that tier is not unit cost).",
  "Production idle replica RSS/CPU on Railway (this-VM idle is not the live replica; EXTRACT_BATCH_ENABLED=1 shares the process).",
  "Railway dashboard CPU-seconds, GB-seconds, and egress for this service.",
  "Production mix of successful vs refused vs timeout attempts.",
  "Live-replica execute-before-settle (local HTTP 503 settle 0 is not a CDP fee invoice).",
];

export function recommendLiveLockfileOffer({
  rows = [],
  allocatedHour,
  allocatedMonth,
  localSuccessfulMeanWallMs = null,
} = {}) {
  const priceAtomic = parseDecimal(LIVE_LOCKFILE_PRICE_USDC, USDC_DECIMALS);
  const serial = rows.filter((r) => r.family !== "concurrency" && r.family !== "concurrency-wave");
  const successful = serial.filter((r) => r.classification === "successful");
  const refused = serial.filter((r) => r.classification === "refused");
  const failed = serial.filter((r) => r.classification === "failed");
  const maxVariableCeil = successful.reduce(
    (max, r) => Math.max(max, Number(r.railwayVariableUsdcAtomicCeil || 0)),
    0,
  );
  const cdpOnSuccess = 1000;
  const refusedSettles = refused.filter((r) => Number(r.settleCalls) > 0).length;
  const failedSettles = failed.filter((r) => Number(r.settleCalls) > 0).length;
  const timeoutRow = rows.find((r) => r.id === "controlled-timeout");
  const idleMonthUsd = allocatedMonth?.variableUsd ? Number(allocatedMonth.variableUsd) : null;
  const priceUsd = Number(LIVE_LOCKFILE_PRICE_USDC);
  const idleCoverSettles = idleMonthUsd != null && priceUsd > 0
    ? Math.ceil(idleMonthUsd / priceUsd)
    : null;
  const meanWall = localSuccessfulMeanWallMs == null
    ? null
    : Number(localSuccessfulMeanWallMs);

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
    profitGuarantee: false,
    economicsUse: "bounded-launch-decision",
    code: ERROR_CODES.NO_LOSS_NOT_PROVEN,
    recommendation: "keep-current-0.005-without-no-loss-claim",
    summary:
      "Keep POST /lockfile-pin-delta at 0.005 USDC (5000 atomic). Production Railway allowlist is FACILITATOR=cdp (not source-default xpay). Unit-marginal CDP usage-based $0.001 after unread free-tier plus this-VM Railway ceiling is far below 5000 atomic; allocated idle is a separate shared-process cost and is not project profit. Local mean ~48ms is not production latency. Local timeout 503 settle 0 is not a CDP fee proof. Do not change the price.",
    facilitator: {
      sourceDefault: MERCHANT_FACILITATOR_DEFAULT,
      sourceDefaultNotProduction: true,
      productionObserved: PRODUCTION_RAILWAY_OBSERVATION.allowlistedVariables,
      productionObservedAt: PRODUCTION_RAILWAY_OBSERVATION.observedAt,
      productionObserver: PRODUCTION_RAILWAY_OBSERVATION.observer,
      productionFacilitator: "cdp",
      productionCdpUrl: MERCHANT_FACILITATOR_CDP_URL,
      noOtherValuesExposed: true,
      noMutation: true,
      feeScheduleApplied: "cdp-official",
      cdp: {
        verifyUsd: "0",
        usageBasedUsdPerOnchainTx: "0.001",
        freeTierMonthlyOnchain: 1000,
        freeTierIsNotUnitCost: true,
        accountBalanceUnread: true,
        remainingFreeQuotaUnread: true,
        source: "https://docs.cdp.coinbase.com/x402/core-concepts/facilitator",
        retrievedAt: "2026-09-12",
      },
      xpay: {
        role: "merchant-source-default-only",
        feeSchedule: "unknown-not-production",
      },
    },
    unitMarginal: {
      thisVmMaxSuccessfulRailwayCeilAtomic: String(maxVariableCeil),
      cdpUsageBasedPerSuccessfulSettleAtomic: String(cdpOnSuccess),
      afterFreeTierExhaustionAtomic: String(maxVariableCeil + cdpOnSuccess),
      vs5000:
        priceAtomic > BigInt(maxVariableCeil + cdpOnSuccess)
          ? "5000 covers official CDP $0.001 plus this-VM Railway ceiling on a successful settle after free-tier exhaustion; that is unit-marginal, not allocated idle, not profit"
          : "not shown as cover",
      doesNotIncludeIdleReplica: true,
      doesNotIncludeUnreadCdpFreeTier: true,
      note: "Variable compute is this-VM CPU/RSS attribution, not a Railway invoice. CDP free-tier remaining count was not read.",
    },
    variable: {
      thisVmMaxSuccessfulRailwayCeilAtomic: String(maxVariableCeil),
      cdpUsageBasedPerSuccessfulSettleAtomic: String(cdpOnSuccess),
      cdpPlusThisVmCeilVs5000:
        "unit-marginal after CDP free-tier exhaustion; see unitMarginal; not allocated idle; not profit",
      note: "Alias of unitMarginal for older readers. Production facilitator is cdp.",
    },
    failedVersusSuccessful: {
      executeBeforeSettle: "HTTP >=400 cancels settlement (charged false) on this build.",
      refusedWithSettle: refusedSettles,
      failedWithSettle: failedSettles,
      railwayStillBurnsOnRefuseAndFail: true,
      timeoutCeilingMs: 5000,
      timeoutIsNotAverage: true,
      timeoutMeasuredWallMs: timeoutRow?.wallMs ?? null,
      timeoutSettleCalls: timeoutRow?.settleCalls ?? null,
      localTimeout503Settle0IsNotCdpFeeProof: true,
      note: "Local fake facilitator. HTTP 503 charged false with settle 0 is execute-before-settle evidence on this VM, not a CDP production fee, balance, or remaining free-tier count.",
    },
    allocatedFixed: {
      thisVmIdleRssHourUsd: allocatedHour?.variableUsd ?? null,
      thisVmIdleRssMonthUsd: allocatedMonth?.variableUsd ?? null,
      accountPlan: "unknown",
      includedUsageUsd: "unknown",
      notUnitMarginal: true,
      notProjectProfit: true,
      sharedWithExtractBatch: true,
      note: "Allocated idle is a separate layer from unit-marginal settle cost. Production also has EXTRACT_BATCH_ENABLED=1, so replica RAM is not lockfile-only. This-VM idle RSS is not the live replica.",
    },
    unitMarginalVsAllocated: {
      unitRevenueUsdc: formatUsdc(priceAtomic),
      unitMarginalCdpUsageBasedUsdc: "0.001000",
      unitMarginalThisVmRailwayCeilUsdc: formatUsdc(BigInt(maxVariableCeil)),
      allocatedIdleThisVmApprox30dUsd: allocatedMonth?.variableUsd ?? null,
      thisVmIdleCoverIllustration: {
        successfulSettlesAt005ToMatchThisVmIdle30d: idleCoverSettles,
        notProductionReplica: true,
        notLockfileOnly: true,
        notProjectProfit: true,
      },
    },
    latency: {
      localSuccessfulMeanWallMs: meanWall,
      notProductionLatency: true,
      timeoutCeilingMs: 5000,
      timeoutIsNotAverage: true,
    },
    timeoutDecision:
      "Keep the 5000ms worker ceiling. Local mean wall is not production latency. A max of 5000ms is not a 5000ms average. Local timeout 503 settle 0 is not CDP fee proof.",
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
