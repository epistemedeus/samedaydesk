import { invokeLiveSettle } from "./canary.ts";
import {
  FIXTURE_BECOMES_SALE,
  LIVE_SETTLE_REFUSED,
} from "./failures.ts";
import {
  assertLivePricesUnchanged as pinLivePricesUnchanged,
  refusePaymentFnReassignment as refusePaymentFnReassignmentPinned,
  refusePriceChange as refusePriceChangePinned,
} from "./guardrails.ts";
import type { CanaryDesign } from "./types.ts";

export const NEO_NOT_PATCHED_ON_SDS = Object.freeze({
  code: "neo-defect-not-patched-on-sds",
  rejected: true,
  patchedOnSds: false,
  ids: Object.freeze(["M-termsVersion", "M-F07"]),
  reason: "F01/F07 Neo defects are not patched on SDS",
});

/** Aliases that must never be reported as SDS patches of F01/F07 Neo defects. */
export const NEO_CLAIM_IDS = Object.freeze([
  "M-termsVersion",
  "M-F07",
  "F01",
  "F07",
  "termsVersion",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectClaimIds(claim: unknown): string[] {
  if (typeof claim === "string") return [claim];
  if (!isPlainObject(claim)) return [];
  const ids: string[] = [];
  if (typeof claim.id === "string") ids.push(claim.id);
  if (typeof claim.defectId === "string") ids.push(claim.defectId);
  if (typeof claim.code === "string") ids.push(claim.code);
  if (Array.isArray(claim.ids)) {
    for (const id of claim.ids) {
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}

export function refuseNeoPatchedOnSdsClaim(claim: unknown): {
  ok: false;
  rejected: true;
  failure: typeof NEO_NOT_PATCHED_ON_SDS;
} {
  const ids = collectClaimIds(claim);
  for (const id of NEO_CLAIM_IDS) {
    if (ids.length === 0 || ids.includes(id)) {
      return { ok: false, rejected: true, failure: NEO_NOT_PATCHED_ON_SDS };
    }
  }
  return { ok: false, rejected: true, failure: NEO_NOT_PATCHED_ON_SDS };
}

export function assertFixtureCannotBecomeCustomer(intake: unknown):
  | {
      ok: true;
      rejected: false;
      provenance: "fixture" | "test";
      saleState: "not_a_sale";
    }
  | {
      ok: false;
      rejected: true;
      completed: false;
      failure: typeof FIXTURE_BECOMES_SALE;
    } {
  const record = isPlainObject(intake)
    ? isPlainObject(intake.intake)
      ? intake.intake
      : intake
    : {};
  const provenance = record.provenance;
  const saleState = record.saleState;
  const paid = record.paid === true;
  const settled = record.settled === true;
  if (
    provenance === "customer"
    || (typeof saleState === "string" && saleState !== "not_a_sale")
    || paid
    || settled
  ) {
    return {
      ok: false,
      rejected: true,
      completed: false,
      failure: FIXTURE_BECOMES_SALE,
    };
  }
  return {
    ok: true,
    rejected: false,
    provenance: provenance === "test" ? "test" : "fixture",
    saleState: "not_a_sale",
  };
}

export function assertCanaryMustNotSettle(
  canary: CanaryDesign | { canary?: unknown } | unknown,
): {
  ok: false;
  rejected: true;
  failure: typeof LIVE_SETTLE_REFUSED;
} {
  return invokeLiveSettle(canary);
}

export function assertLivePricesUnchanged(): ReturnType<typeof pinLivePricesUnchanged> {
  return pinLivePricesUnchanged();
}

export function refusePriceChange(
  attempt: Record<string, unknown>,
): ReturnType<typeof refusePriceChangePinned> {
  return refusePriceChangePinned(attempt);
}

export function refusePaymentFnReassignment(attempt: {
  verifyPayment?: unknown;
  settlePayment?: unknown;
}): ReturnType<typeof refusePaymentFnReassignmentPinned> {
  return refusePaymentFnReassignmentPinned(attempt);
}
