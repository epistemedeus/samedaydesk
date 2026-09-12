import { ERROR_CODES, USDC_DECIMALS, X402_RAIL_ID, XPAY_RAIL_ID } from "./pins.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";
import { loadRail } from "./rails.mjs";
import { refuse, throwRefuse } from "./refuse.mjs";

/**
 * Settlement fee for one attempt.
 * CDP: verify always free; Exact settle is one onchain tx after the 1000/month free tier.
 * xpay: fee schedule unknown; merchant SOURCE default only. Production was observed cdp.
 * Failed/refused HTTP >=400 with execute-before-settle: settleCalls === 0 => fee 0 on this CDP model.
 * Local timeout HTTP 503 settle 0 is not a CDP invoice, remaining quota, or account balance.
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
      note: "xpay is the merchant SOURCE default (FACILITATOR=xpay → https://facilitator.xpay.sh). Production was observed FACILITATOR=cdp. Do not invent an xpay fee or treat xpay as the live facilitator.",
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
      note: "Production Railway allowlist observed FACILITATOR=cdp 2026-09-12 ~02:00 UTC, so this official schedule is the production fee model. Remaining free-tier quota and account balance were not read. Local timeout HTTP 503 with settle=0 is not a CDP fee invoice. Verify is free. Zero settle calls => zero CDP facilitator fee on this model.",
    };
  }

  throwRefuse(ERROR_CODES.UNKNOWN_RAIL, `unknown facilitator ${facilitator}`);
}
