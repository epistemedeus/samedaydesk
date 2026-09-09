/**
 * Cost notes stay explicit. Never promise zero marginal cost.
 * Product prices that appear here are labelled sourced or illustrative.
 */

export const COST_NOTES = Object.freeze({
  offlineCompare: {
    kind: "illustrative",
    asOf: "2026-09-09",
    summary:
      "Offline compare and record recipes run on operator compute. Marginal network and merchant charges are zero for the offline path; local CPU/disk are not free.",
    examples: [
      {
        item: "local page-change compare",
        amount: "operator CPU only",
        note: "illustrative; no merchant charge",
      },
    ],
  },
  paidExtractBatch: {
    kind: "sourced",
    asOf: "2026-09-09",
    source: "https://samedaydesk.com/for-agents",
    summary:
      "SameDayDesk bounded POST /extract/batch is currently priced at 0.01 USDC for a 1-5 URL attempt. This recipe pack does not purchase that route.",
    examples: [
      {
        item: "POST /extract/batch",
        amount: "0.01 USDC",
        note: "sourced product price on /for-agents; not invoked by these recipes",
      },
    ],
  },
  freeLiveFetch: {
    kind: "illustrative",
    asOf: "2026-09-09",
    summary:
      "A free public HTML fetch (for example example.com) has no merchant charge, but still consumes network, CPU, and storage. Do not treat it as zero marginal cost.",
    examples: [
      {
        item: "GET https://example.com/",
        amount: "no merchant fee; operator egress/CPU remain",
        note: "illustrative free live source used only when --live-safe is set",
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
  return {
    primary: COST_NOTES.offlineCompare,
    related: [COST_NOTES.freeLiveFetch, COST_NOTES.paidExtractBatch],
  };
}
