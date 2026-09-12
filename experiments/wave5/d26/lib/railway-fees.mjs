import { ERROR_CODES, RAILWAY_MODEL, USD12_DECIMALS, USDC_DECIMALS } from "./pins.mjs";
import { ceilDiv, formatDecimal, parseDecimal } from "./money.mjs";
import { throwRefuse } from "./refuse.mjs";

/** 1 USDC atomic (6dp) = 1e6 units of USD at 12 decimal places. */
export const USDC_ATOMIC_IN_USD12 = 10n ** BigInt(USD12_DECIMALS - USDC_DECIMALS);

export function parseUsd12(text) {
  return parseDecimal(text, USD12_DECIMALS);
}

export function formatUsd12(atomic12) {
  return formatDecimal(atomic12, USD12_DECIMALS);
}

export function usd12ToUsdcAtomicCeil(usd12) {
  if (usd12 <= 0n) return 0n;
  return ceilDiv(usd12, USDC_ATOMIC_IN_USD12);
}

export function railwayRates() {
  return {
    cpuUsd12PerVcpuSecond: parseUsd12(RAILWAY_MODEL.cpuUsdPerVcpuSecond),
    memoryUsd12PerGbSecond: parseUsd12(RAILWAY_MODEL.memoryUsdPerGbSecond),
    volumeUsd12PerGbSecond: parseUsd12(RAILWAY_MODEL.volumeUsdPerGbSecond),
    egressUsd12PerGb: parseUsd12(RAILWAY_MODEL.egressUsdPerGb),
  };
}

/**
 * Variable Railway usage from measured CPU seconds, wall seconds, and peak RSS.
 * No 60s minimum. CPU seconds are measured ticks, not assumed wall==CPU.
 */
export function railwayVariableCost({
  cpuSeconds = 0,
  wallSeconds = 0,
  peakRssBytes = 0,
  egressBytes = 0,
} = {}) {
  const rates = railwayRates();
  const scale = (seconds, rate12) => {
    const nanos = BigInt(Math.round(Math.max(0, Number(seconds) || 0) * 1e9));
    return (nanos * rate12) / 1_000_000_000n;
  };
  const cpu = Math.max(0, Number(cpuSeconds) || 0);
  const wall = Math.max(0, Number(wallSeconds) || 0);
  const rssGb = Math.max(0, Number(peakRssBytes) || 0) / (1024 ** 3);
  const egressGb = Math.max(0, Number(egressBytes) || 0) / (1024 ** 3);

  const cpuUsd12 = scale(cpu, rates.cpuUsd12PerVcpuSecond);
  const memoryUsd12 = scale(rssGb * wall, rates.memoryUsd12PerGbSecond);
  const egressUsd12 = scale(egressGb, rates.egressUsd12PerGb);
  const usd12 = cpuUsd12 + memoryUsd12 + egressUsd12;

  return {
    ok: true,
    railId: RAILWAY_MODEL.id,
    billing: RAILWAY_MODEL.billing,
    onDemandMinimumSeconds: 0,
    accountPlan: "unknown",
    includedUsageUsd: "unknown",
    cpuSeconds: cpu,
    wallSeconds: wall,
    peakRssBytes: Number(peakRssBytes) || 0,
    egressBytes: Number(egressBytes) || 0,
    cpuUsd12: cpuUsd12.toString(),
    memoryUsd12: memoryUsd12.toString(),
    egressUsd12: egressUsd12.toString(),
    variableUsd12: usd12.toString(),
    variableUsd: formatUsd12(usd12),
    variableUsdcAtomicCeil: usd12ToUsdcAtomicCeil(usd12).toString(),
    source: RAILWAY_MODEL.source,
    retrievedAt: RAILWAY_MODEL.retrievedAt,
    notProductionInvoice: true,
  };
}

/**
 * Allocated/idle replica cost for a duration using measured idle RSS.
 * Railway bills actual use while the process runs; this is an attribution
 * estimate, not reserved-VM markup. Plan credits are not subtracted.
 */
export function railwayAllocatedCost({
  idleRssBytes = 0,
  idleCpuSeconds = 0,
  durationSeconds = 3600,
} = {}) {
  const wall = Math.max(0, Number(durationSeconds) || 0);
  return {
    ...railwayVariableCost({
      cpuSeconds: Math.max(0, Number(idleCpuSeconds) || 0),
      wallSeconds: wall,
      peakRssBytes: idleRssBytes,
    }),
    kind: "allocated-fixed-attribution",
    durationSeconds: wall,
    idleRssBytes: Number(idleRssBytes) || 0,
    note: "Idle replica RAM while the merchant process stays up. Unknown production replica size and Railway plan.",
  };
}

export function refuseUnknownPlanAsUnitCost() {
  throwRefuse(
    ERROR_CODES.FREE_TIER_IS_NOT_UNIT_COST,
    "Railway included plan credits (Hobby $5 / Pro $20 / Free $1) are capacity, not durable unit cost. This account's plan is unknown.",
    { accountPlan: "unknown" },
  );
}
