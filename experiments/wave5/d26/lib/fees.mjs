import { COMPUTE_MODEL, ERROR_CODES, STRIPE_RAIL_ID, USDC_DECIMALS, USD_USDC_PEG, X402_RAIL_ID } from "./pins.mjs";
import { ceilDiv, formatUsdc, parseDecimal, usdcAtomic } from "./money.mjs";
import { throwRefuse } from "./refuse.mjs";
import { loadRail } from "./rails.mjs";

export function billedComputeSeconds(durationMs) {
  const wall = Math.max(0, Math.ceil(Number(durationMs) / 1000));
  return Math.max(COMPUTE_MODEL.onDemandMinimumSeconds, wall);
}

export function computeCostAtomic(durationMs) {
  const seconds = billedComputeSeconds(durationMs);
  const usdPerHour = parseDecimal(COMPUTE_MODEL.usdPerVcpuHour, USDC_DECIMALS);
  return ceilDiv(BigInt(seconds) * usdPerHour * BigInt(COMPUTE_MODEL.vcpuAssumed), 3600n);
}

export function applyRail(railOrId, { priceAtomic, durationMs, feeTier } = {}) {
  const rail = typeof railOrId === "string" ? loadRail(railOrId) : railOrId;
  if (!rail?.id) throwRefuse(ERROR_CODES.UNKNOWN_RAIL, "rail is required");

  if (feeTier === "free") {
    throwRefuse(
      ERROR_CODES.FREE_TIER_IS_NOT_UNIT_COST,
      "CDP free tier (first 1000 onchain txs/month) is capacity, not durable unit cost",
      { railId: rail.id },
    );
  }

  const computeAtomic = computeCostAtomic(durationMs || 0);

  if (rail.id === X402_RAIL_ID) {
    const feeAtomic = parseDecimal(rail.usageBasedUsdPerOnchainTx, USDC_DECIMALS);
    return {
      ok: true,
      railId: rail.id,
      kind: rail.kind,
      feeTier: "usage-based",
      paymentFeeAtomic: feeAtomic,
      paymentFeeUsdc: formatUsdc(feeAtomic),
      variableComputeAtomic: computeAtomic,
      variableComputeUsdc: formatUsdc(computeAtomic),
      billedComputeSeconds: billedComputeSeconds(durationMs || 0),
      source: rail.source,
      retrievedAt: rail.retrievedAt,
    };
  }

  if (rail.id === STRIPE_RAIL_ID) {
    const percent = ceilDiv(BigInt(priceAtomic) * BigInt(rail.percentBps), 10000n);
    const fixedUsd = usdcAtomic(rail.fixedUsd);
    const feeAtomic = percent + fixedUsd.value;
    return {
      ok: true,
      railId: rail.id,
      kind: rail.kind,
      feeTier: "standard-domestic-card",
      paymentFeeAtomic: feeAtomic,
      paymentFeeUsdc: formatUsdc(feeAtomic),
      variableComputeAtomic: computeAtomic,
      variableComputeUsdc: formatUsdc(computeAtomic),
      billedComputeSeconds: billedComputeSeconds(durationMs || 0),
      percentBps: rail.percentBps,
      fixedUsd: rail.fixedUsd,
      peg: USD_USDC_PEG,
      source: rail.source,
      retrievedAt: rail.retrievedAt,
      counterfactual: true,
    };
  }

  throwRefuse(ERROR_CODES.UNKNOWN_RAIL, `unhandled rail ${rail.id}`);
}
