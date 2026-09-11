import { LIVE_PRICES } from "./constants.ts";
import { LIVE_SETTLE_REFUSED } from "./failures.ts";
import type { CanaryDesign, CanaryRoute } from "./types.ts";

export type CanaryPlan = {
  canary: CanaryDesign;
  designOnly: true;
  executed: false;
  purchaseInvoked: false;
  settleInvoked: false;
  route: CanaryRoute;
  livePriceDisplay: string;
  ownerQa: true;
  externalRevenue: false;
};

export function designCanary(route: CanaryRoute = "extract"): CanaryPlan {
  const pin = LIVE_PRICES[route];
  const canary: CanaryDesign = {
    purchaseCap: {
      amount: pin.amountAtomic,
      asset: pin.asset,
      network: pin.network,
    },
    ownerQa: true,
    externalRevenue: false,
    authorized: false,
  };
  return {
    canary,
    designOnly: true,
    executed: false,
    purchaseInvoked: false,
    settleInvoked: false,
    route,
    livePriceDisplay: pin.display,
    ownerQa: true,
    externalRevenue: false,
  };
}

export function invokeLiveSettle(
  _canary: CanaryDesign | CanaryPlan | unknown,
): {
  ok: false;
  rejected: true;
  failure: typeof LIVE_SETTLE_REFUSED;
} {
  return { ok: false, rejected: true, failure: LIVE_SETTLE_REFUSED };
}

export function executeCanaryPurchase(
  _canary: CanaryDesign | CanaryPlan | unknown,
): {
  ok: false;
  rejected: true;
  failure: typeof LIVE_SETTLE_REFUSED;
} {
  return { ok: false, rejected: true, failure: LIVE_SETTLE_REFUSED };
}
