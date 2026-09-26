/**
 * Cap03 prerequisites stub — Heavy S138-owned. Fixture-driven only.
 */
export const HEAVY_LANE_OWNED = "R2-CAPABILITIES-03";

export function runPrerequisitesStub(input = {}) {
  const listed = Array.isArray(input.prerequisites) ? input.prerequisites : [];
  const items =
    listed.length > 0
      ? listed.map((p) => ({
          id: typeof p === "string" ? p : p.id,
          status: "assumed_met_offline",
          source: "fixture.prereq.stub",
        }))
      : [
          {
            id: "node20",
            status: "assumed_met_offline",
            source: "fixture.prereq.stub",
          },
          {
            id: "offline_fixtures",
            status: "assumed_met_offline",
            source: "fixture.prereq.stub",
          },
        ];

  return {
    stageId: "prerequisites",
    implementation: "stub",
    heavyLaneOwned: HEAVY_LANE_OWNED,
    status: "stub_ok",
    items,
    note: "Thin stub — Cap03 prerequisites matching is Heavy S138-owned; not implemented here.",
  };
}
