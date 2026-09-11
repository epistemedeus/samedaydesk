import { ERROR_CODES, STRIPE_RAIL_ID, USDC_DECIMALS, X402_RAIL_ID } from "./pins.mjs";
import { applyRail } from "./fees.mjs";
import { formatUsdc, parseDecimal } from "./money.mjs";
import { refuse } from "./refuse.mjs";

export function priceFloor(request = {}) {
  const railId = request.railId || X402_RAIL_ID;
  const proposedUsdc = request.proposedPriceUsdc;
  if (typeof proposedUsdc !== "string") {
    return refuse(ERROR_CODES.INVALID_DECIMAL, "proposedPriceUsdc decimal string is required");
  }

  let proposedAtomic;
  try {
    proposedAtomic = parseDecimal(proposedUsdc, USDC_DECIMALS);
  } catch (err) {
    return refuse(err.code || ERROR_CODES.INVALID_DECIMAL, err.message);
  }

  let fees;
  try {
    fees = applyRail(railId, {
      priceAtomic: proposedAtomic,
      durationMs: request.durationMs,
      feeTier: request.feeTier,
    });
  } catch (err) {
    return refuse(err.code || ERROR_CODES.UNKNOWN_RAIL, err.message, err.detail);
  }

  const floorAtomic = fees.variableComputeAtomic + fees.paymentFeeAtomic;
  const covers = proposedAtomic >= floorAtomic;
  const certifiedRail = railId === X402_RAIL_ID;
  const unlikeAttempt = railId === STRIPE_RAIL_ID && request.certifyAsX402Offer === true;
  if (unlikeAttempt) {
    return refuse(
      ERROR_CODES.UNLIKE_RAIL_CERTIFICATION,
      "Stripe card fees cannot certify an x402 Exact Base USDC offer",
      { railId, offerRail: X402_RAIL_ID },
    );
  }

  return {
    ok: true,
    railId,
    certified: certifiedRail && covers && request.measurementOk === true,
    counterfactual: fees.counterfactual === true,
    proposedPriceUsdc: formatUsdc(proposedAtomic),
    proposedPriceAtomic: proposedAtomic.toString(),
    floorUsdc: formatUsdc(floorAtomic),
    floorAtomic: floorAtomic.toString(),
    variableComputeUsdc: fees.variableComputeUsdc,
    variableComputeAtomic: fees.variableComputeAtomic.toString(),
    paymentFeeUsdc: fees.paymentFeeUsdc,
    paymentFeeAtomic: fees.paymentFeeAtomic.toString(),
    billedComputeSeconds: fees.billedComputeSeconds,
    feeTier: fees.feeTier,
    nonLossmaking: covers,
    coversFloor: covers,
    source: fees.source,
    retrievedAt: fees.retrievedAt,
    peg: fees.peg || null,
  };
}
