/**
 * Cost notes stay explicit. Never promise zero marginal cost or assumed margin.
 * Unknown operator/network costs are labelled costs_unknown, not zero.
 */

export const COST_NOTES = Object.freeze({
  offlineCompare: {
    kind: "costs_unknown",
    asOf: "2026-09-09",
    summary:
      "Offline compare and record recipes run on operator compute. Merchant charges are not invoked on the offline path; local CPU, disk, and wall time are costs_unknown.",
    examples: [
      {
        item: "local page-change compare",
        amount: "costs_unknown",
        note: "no merchant charge; operator compute not priced here",
      },
    ],
  },
  paidExtractBatch: {
    kind: "sourced",
    asOf: "2026-09-09",
    source: "https://samedaydesk.com/for-agents",
    summary:
      "SameDayDesk bounded POST /extract/batch is listed at 0.01 USDC for a 1-5 URL attempt on /for-agents. These recipes do not purchase that route; total run cost including operator work remains costs_unknown.",
    examples: [
      {
        item: "POST /extract/batch",
        amount: "0.01 USDC listed",
        note: "sourced list price only; not invoked by these recipes",
      },
    ],
  },
  freeLiveFetch: {
    kind: "costs_unknown",
    asOf: "2026-09-09",
    summary:
      "A free public HTML fetch (for example example.com) or a mounted local fixture origin has no merchant charge, but network, CPU, and storage remain costs_unknown. Do not treat as zero marginal cost.",
    examples: [
      {
        item: "GET https://example.com/ or mounted 127.0.0.1 fixture",
        amount: "costs_unknown",
        note: "no merchant fee; operator egress/CPU not priced here",
      },
    ],
  },
});

export function costForRecipe(recipeId) {
  if (recipeId === "comparable-record-extraction") {
    return {
      primary: COST_NOTES.freeLiveFetch,
      related: [COST_NOTES.paidExtractBatch, COST_NOTES.offlineCompare],
    };
  }
  if (recipeId === "verification-reconcile") {
    return {
      primary: COST_NOTES.offlineCompare,
      related: [COST_NOTES.paidExtractBatch],
    };
  }
  if (recipeId === "issue-to-work-brief") {
    return {
      primary: COST_NOTES.freeLiveFetch,
      related: [COST_NOTES.offlineCompare],
    };
  }
  if (recipeId === "buyer-setup-trace") {
    return {
      primary: COST_NOTES.freeLiveFetch,
      related: [COST_NOTES.paidExtractBatch],
    };
  }
  return {
    primary: COST_NOTES.offlineCompare,
    related: [COST_NOTES.freeLiveFetch, COST_NOTES.paidExtractBatch],
  };
}
