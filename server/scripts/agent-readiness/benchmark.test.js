import { describe, expect, it } from "./expect-shim.js";
import {
  BENCHMARK_LABEL,
  BENCHMARK_SITES,
  BENCHMARK_SURFACES,
  benchmarkFindings,
  rankBenchmark,
  surfacePoints
} from "../../lib/agent-readiness/benchmark.js";
import { DEMO_BUNDLES } from "../../lib/agent-readiness/demo.js";
const site = (host) => BENCHMARK_SITES.find((s) => s.host === host);
describe("real benchmark data", () => {
  it("is labeled real and kept apart from DEMO bundles", () => {
    expect(BENCHMARK_LABEL).toBe("real, probed 2026-09-24 11:50Z");
    for (const b of DEMO_BUNDLES) expect(b.label?.startsWith("DEMO")).toBe(true);
  });
  it("surface points sum to 100", () => {
    expect(BENCHMARK_SURFACES.reduce((s, c) => s + c.points, 0)).toBe(100);
  });
  it("records the observed surfaces", () => {
    expect(site("legalzoom.com").surfaces.mcp).toBe("yes");
    expect(site("legalzoom.com").surfaces.webmcp).toBe("yes");
    expect(site("legalzoom.com").surfaces.openapi).toBe("no");
    expect(site("ein.llc").surfaces.openapi).toBe("yes");
    expect(site("ein.llc").surfaces.mcp).toBe("no");
    expect(site("samedaydesk.com").surfaces.mcp).toBe("partial");
    expect(site("neomorphic.io").surfaces.mcp).toBe("unknown");
    for (const h of ["firstbase.io", "clerky.com", "northwestregisteredagent.com"]) {
      expect(surfacePoints(site(h))).toBe(0);
      expect(site(h).action).toBe("nothing");
    }
  });
  it("scores unknown as zero, never as a pass", () => {
    const n = site("neomorphic.io");
    expect(surfacePoints({ ...n, surfaces: { ...n.surfaces, mcp: "yes" } })).toBe(surfacePoints(n) + 25);
  });
});
describe("ranking", () => {
  const ranked = rankBenchmark();
  it("ranks by surface points with stable tie breaks", () => {
    expect(ranked.map((r) => r.host).slice(0, 5)).toEqual([
      "agents.samedaydesk.com",
      "neomorphic.io",
      "legalzoom.com",
      "ein.llc",
      "samedaydesk.com"
    ]);
    expect(ranked.find((r) => r.host === "ein.llc").points).toBe(35);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].points).toBeGreaterThanOrEqual(ranked[i].points);
    }
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    expect(ranked.at(-1).points).toBe(0);
  });
  it("derives the factual note from the data", () => {
    const f = benchmarkFindings();
    expect(f.competitorsWithMcp).toEqual(["legalzoom.com"]);
    expect(f.formationWithAssessApi).toEqual(["ein.llc"]);
  });
});
