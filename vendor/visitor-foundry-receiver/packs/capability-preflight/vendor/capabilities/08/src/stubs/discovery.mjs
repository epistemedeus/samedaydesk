/**
 * Cap02 discovery stub — Heavy S138-owned. Fixture-driven only.
 */
export const HEAVY_LANE_OWNED = "R2-CAPABILITIES-02";

export function runDiscoveryStub(input = {}) {
  const capabilityId =
    typeof input.capabilityId === "string" && input.capabilityId.trim()
      ? input.capabilityId.trim()
      : "synthetic.capability.demo";
  return {
    stageId: "discovery",
    implementation: "stub",
    heavyLaneOwned: HEAVY_LANE_OWNED,
    status: "stub_ok",
    capabilityId,
    matches: [
      {
        id: capabilityId,
        label: input.capabilityLabel || "Synthetic capability (Cap02 stub)",
        source: "fixture.discovery.stub",
      },
    ],
    note: "Thin stub — Cap02 capability discovery is Heavy S138-owned; not implemented here.",
  };
}
