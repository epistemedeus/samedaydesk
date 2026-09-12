import { ERROR_CODES, USDC_DECIMALS, X402_RAIL_ID, XPAY_RAIL_ID } from "./pins.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";
import { loadRail } from "./rails.mjs";
import { refuse, throwRefuse } from "./refuse.mjs";

/**
 * Settlement fee for one attempt.
 * CDP: verify always free; Exact settle is one onchain tx after the 1000/month free tier.
 * xpay: fee schedule unknown; default merchant path. Do not apply $0.001.
 * Failed/refused HTTP >=400 with execute-before-settle: settleCalls === 0 => fee 0 on CDP.
 */
export function facilitatorAttemptCost({
  facilitator = "xpay",
  settleCalls = 0,
  verifyCalls = 0,
  feeTier,
} = {}) {
  const settles = Math.max(0, Number(settleCalls) || 0);
  const verifies = Math.max(0, Number(verifyCalls) || 0);

  if (facilitator === "xpay") {
    if (feeTier === "free" || feeTier === "zero") {
      return refuse(
        ERROR_CODES.XPAY_FEE_SCHEDULE_UNKNOWN,
        "xpay fee schedule is unpublished; do not treat it as free or as CDP $0.001",
        { facilitator, settleCalls: settles, verifyCalls: verifies },
      );
    }
    return {
      ok: true,
      facilitator: "xpay",
      railId: XPAY_RAIL_ID,
      feeKnown: false,
      verifyAlwaysFree: "unknown",
      settleFeeUsdc: null,
      settleFeeAtomic: null,
      settleCalls: settles,
      verifyCalls: verifies,
      appliesCdp001: false,
      note: "Merchant default FACILITATOR=xpay. CDP usage-based $0.001/onchain tx does not apply unless production is FACILITATOR=cdp.",
    };
  }

  if (facilitator === "cdp") {
    if (feeTier === "free") {
      throwRefuse(
        ERROR_CODES.FREE_TIER_IS_NOT_UNIT_COST,
        "CDP free tier (first 1000 onchain txs/month) is capacity, not durable unit cost",
      );
    }
    const rail = loadRail(X402_RAIL_ID);
    const perSettle = parseDecimal(rail.usageBasedUsdPerOnchainTx, USDC_DECIMALS);
    const feeAtomic = perSettle * BigInt(settles);
    return {
      ok: true,
      facilitator: "cdp",
      railId: X402_RAIL_ID,
      feeKnown: true,
      feeTier: "usage-based",
      verifyAlwaysFree: true,
      settleFeeAtomic: feeAtomic.toString(),
      settleFeeUsdc: formatUsdc(feeAtomic),
      settleCalls: settles,
      verifyCalls: verifies,
      usageBasedUsdPerOnchainTx: rail.usageBasedUsdPerOnchainTx,
      source: rail.source,
      retrievedAt: rail.retrievedAt,
      appliesCdp001: true,
      note: "Applies only if production FACILITATOR=cdp. Verify is free. Zero settle calls => zero CDP facilitator fee.",
    };
  }

  throwRefuse(ERROR_CODES.UNKNOWN_RAIL, `unknown facilitator ${facilitator}`);
}
