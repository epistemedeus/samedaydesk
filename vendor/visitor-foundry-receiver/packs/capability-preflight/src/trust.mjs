/**
 * Distinguish advertised / content_bound / executed / accepted,
 * and currency/price estimates from actual spend.
 *
 * Bare executionVerified/accepted booleans are caller-declared claims.
 * This kit never promotes them into executed/accepted trust lanes.
 */
import { COST_LANE, TRUST_LANE, TRUST_SCHEMA } from "./constants.mjs";

export function classifyEvidenceTrust({
  advertised = null,
  binding = null,
  executionVerified = null,
  accepted = null,
} = {}) {
  const callerDeclared = {
    executionVerified:
      executionVerified === true ? true : executionVerified === false ? false : null,
    accepted: accepted === true ? true : accepted === false ? false : null,
  };

  const lanes = {
    advertised:
      advertised === true
        ? TRUST_LANE.ADVERTISED
        : advertised === false
          ? "not_advertised"
          : TRUST_LANE.UNKNOWN,
    contentBound:
      binding?.status === "content_bound"
        ? TRUST_LANE.CONTENT_BOUND
        : binding?.status === "untested_declaration"
          ? "untested_declaration"
          : TRUST_LANE.UNKNOWN,
    executed: TRUST_LANE.UNKNOWN,
    accepted: TRUST_LANE.UNKNOWN,
  };

  if (binding && binding.executionVerified === true) {
    lanes.executed = "caller_claimed_execution_ignored";
  } else if (binding && binding.executionVerified === false) {
    lanes.executed = "not_executed_attested";
  } else if (callerDeclared.executionVerified === true) {
    lanes.executed = "caller_declared_execution";
  } else if (callerDeclared.executionVerified === false) {
    lanes.executed = "caller_declared_not_executed";
  }

  if (callerDeclared.accepted === true) {
    lanes.accepted = "caller_declared_accepted";
  } else if (callerDeclared.accepted === false) {
    lanes.accepted = binding ? "not_accepted" : "caller_declared_not_accepted";
  }

  return {
    schema: TRUST_SCHEMA,
    lanes,
    callerDeclared,
    notes: [
      "Lanes are independent; content_bound ≠ executed ≠ accepted.",
      "Missing facts stay unknown — never default true/false.",
      "Bare executionVerified/accepted booleans are caller-declared claims, not kit attestation.",
      "This kit's execution vocabulary is unverified; executionVerified stays false on library bindings.",
    ],
  };
}

export function classifyCostLanes(costReport = null) {
  if (!costReport || typeof costReport !== "object") {
    return {
      estimate: COST_LANE.UNKNOWN,
      spend: COST_LANE.UNKNOWN,
      currency: null,
      amounts: [],
      notes: ["No cost report supplied; estimates and spend remain unknown."],
    };
  }

  const amounts = [];
  for (const c of costReport.comparisons || []) {
    amounts.push({
      quoteId: c.quoteId ?? null,
      priceState: c.priceState ?? null,
      amountAtomic: c.amountAtomic ?? null,
      currency: c.currency ?? null,
      unit: c.unit ?? null,
      lane: c.amountAtomic != null ? COST_LANE.PRICE_ESTIMATE : COST_LANE.UNKNOWN,
    });
  }

  const malformedUnits = (costReport.comparisons || []).filter(
    (c) => c.unit != null && typeof c.unit !== "string",
  );

  return {
    estimate: amounts.some((a) => a.lane === COST_LANE.PRICE_ESTIMATE)
      ? COST_LANE.PRICE_ESTIMATE
      : COST_LANE.UNKNOWN,
    spend: COST_LANE.UNKNOWN,
    actualSpend: null,
    dryRun: costReport.dryRun === true,
    paidCalls: costReport.paidCalls === true ? true : costReport.paidCalls === false ? false : null,
    currency: amounts.find((a) => a.currency)?.currency ?? null,
    amounts,
    malformedUnits: malformedUnits.length
      ? malformedUnits.map((c) => ({ quoteId: c.quoteId, unit: c.unit }))
      : [],
    notes: [
      "Quoted amountAtomic/currency are price estimates, not actual spend.",
      "actualSpend stays null unless an external settlement ledger supplies it (out of scope).",
      "Unknown/malformed units are preserved as gaps, not coerced.",
    ],
  };
}
