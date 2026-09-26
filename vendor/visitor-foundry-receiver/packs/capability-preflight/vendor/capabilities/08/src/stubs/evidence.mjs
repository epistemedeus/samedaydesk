/**
 * Cap06 evidence-binding stub — Heavy S138-owned.
 * Cap08 verify stage uses thin local checks instead; this stub only labels ownership.
 */
export const HEAVY_LANE_OWNED = "R2-CAPABILITIES-06";

export function evidenceBindingStubMeta() {
  return {
    heavyLaneOwned: HEAVY_LANE_OWNED,
    note: "Evidence-binding (Cap06) is Heavy S138-owned. Cap08 verify uses thin local fixture checks only.",
  };
}
