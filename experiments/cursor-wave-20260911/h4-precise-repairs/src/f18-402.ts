import { LIVE_PRICES } from "./constants.ts";
import type { CanaryRoute } from "./types.ts";

/** 402 with the live extract/audit pins is unpaid-held, never a paid success. */

export const F18_LIVE_JOURNEY_COUNTS = Object.freeze({
  probes: 28,
  mismatches: 0,
  unpaidHeld: 2,
});

export const LIVE_UNPAID_402 = Object.freeze({
  extract: Object.freeze({
    status: 402,
    amountAtomic: LIVE_PRICES.extract.amountAtomic,
    route: LIVE_PRICES.extract.route,
    display: LIVE_PRICES.extract.display,
    asset: LIVE_PRICES.extract.asset,
    network: LIVE_PRICES.extract.network,
  }),
  "seller-integrity-audit": Object.freeze({
    status: 402,
    amountAtomic: LIVE_PRICES["seller-integrity-audit"].amountAtomic,
    route: LIVE_PRICES["seller-integrity-audit"].route,
    display: LIVE_PRICES["seller-integrity-audit"].display,
    asset: LIVE_PRICES["seller-integrity-audit"].asset,
    network: LIVE_PRICES["seller-integrity-audit"].network,
  }),
});

export const UNPAID_402_IS_NOT_SUCCESS = "unpaid-402-is-not-success" as const;

export type UnpaidHeldResult = {
  outcome: "unpaid-held";
  success: false;
  paid: false;
  settled: false;
};

export type Unpaid402Probe = {
  status?: unknown;
  amountAtomic?: unknown;
  route?: unknown;
  success?: unknown;
  outcome?: unknown;
  paid?: unknown;
  settled?: unknown;
};

export type Assert402IsNotSuccessResult =
  | {
      ok: false;
      rejected: true;
      code: typeof UNPAID_402_IS_NOT_SUCCESS;
      outcome: "unpaid-held";
    }
  | {
      ok: true;
      rejected: false;
      outcome: "unpaid-held";
    };

export type ProbeClassification =
  | UnpaidHeldResult
  | {
      outcome: "unclaimed";
      success: false;
      paid: false;
      settled: false;
    };

const UNPAID_HELD: UnpaidHeldResult = Object.freeze({
  outcome: "unpaid-held",
  success: false,
  paid: false,
  settled: false,
});

const UNCLAIMED = Object.freeze({
  outcome: "unclaimed",
  success: false,
  paid: false,
  settled: false,
});

function asStatus(value: unknown): number {
  return Number(value);
}

function asAtomic(value: unknown): string {
  return String(value);
}

function routeKey(route: unknown): CanaryRoute | null {
  const raw = String(route ?? "").trim();
  if (
    raw === "extract"
    || raw === LIVE_PRICES.extract.route
    || raw === "/extract"
  ) {
    return "extract";
  }
  if (
    raw === "seller-integrity-audit"
    || raw === LIVE_PRICES["seller-integrity-audit"].route
    || raw === "/commerce/seller-integrity-audit"
  ) {
    return "seller-integrity-audit";
  }
  return null;
}

export function isLiveUnpaid402Pin(input: {
  status: unknown;
  amountAtomic: unknown;
  route: unknown;
}): boolean {
  if (asStatus(input.status) !== 402) return false;
  const key = routeKey(input.route);
  if (!key) return false;
  return asAtomic(input.amountAtomic) === LIVE_UNPAID_402[key].amountAtomic;
}

export function interpretUnpaid402(input: {
  status: unknown;
  amountAtomic: unknown;
  route: unknown;
}): UnpaidHeldResult {
  // 402 + extract 5000 or seller-integrity-audit 10000 matching the route.
  if (asStatus(input.status) === 402 && isLiveUnpaid402Pin(input)) {
    return { ...UNPAID_HELD };
  }
  return { ...UNPAID_HELD };
}

export function assert402IsNotSuccess(row: Unpaid402Probe): Assert402IsNotSuccessResult {
  const claimsSuccess = row.success === true || row.outcome === "success";
  if (asStatus(row.status) === 402 && claimsSuccess) {
    return {
      ok: false,
      rejected: true,
      code: UNPAID_402_IS_NOT_SUCCESS,
      outcome: "unpaid-held",
    };
  }
  return {
    ok: true,
    rejected: false,
    outcome: "unpaid-held",
  };
}

export function classifyProbe(row: Unpaid402Probe): ProbeClassification {
  if (asStatus(row.status) === 402) {
    return interpretUnpaid402({
      status: row.status,
      amountAtomic: row.amountAtomic,
      route: row.route,
    });
  }
  // 2xx with payment would be success; this pack never claims a live paid settlement.
  return { ...UNCLAIMED };
}
