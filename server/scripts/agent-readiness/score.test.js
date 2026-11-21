import { describe, expect, it } from "./expect-shim.js";
import {
  CATEGORY_WEIGHTS,
  buildReport,
  compareReports,
  scoreCategories,
  statusValue,
  topFixes,
  totalScore
} from "../../lib/agent-readiness/score.js";
import { demoBundle } from "../../lib/agent-readiness/demo.js";
const EMPTY = {
  schema: "agent-readiness.probe.v1",
  host: "nothing.example",
  probedAt: "2026-09-24T09:00:00Z",
  responses: { "/robots.txt": { status: 404 } }
};
describe("weights", () => {
  it("sum to 100", () => {
    expect(CATEGORY_WEIGHTS.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
  it("maps statuses to values", () => {
    expect(statusValue("pass")).toBe(1);
    expect(statusValue("warn")).toBe(0.5);
    expect(statusValue("fail")).toBe(0);
    expect(statusValue("na")).toBe(0);
  });
});
describe("score weighting", () => {
  it("awards the full category weight when all its checks pass", () => {
    const checks = [
      { id: "a", category: "mcp", title: "a", status: "pass", reason: "", fix: "" },
      { id: "b", category: "mcp", title: "b", status: "pass", reason: "", fix: "" }
    ];
    const mcp = scoreCategories(checks).find((c) => c.id === "mcp");
    expect(mcp.points).toBe(20);
    expect(totalScore(scoreCategories(checks))).toBe(20);
  });
  it("awards half weight for all-warn categories", () => {
    const checks = [
      { id: "a", category: "cors", title: "a", status: "warn", reason: "", fix: "" }
    ];
    expect(scoreCategories(checks).find((c) => c.id === "cors").points).toBe(2.5);
  });
});
describe("truthfulness", () => {
  it("gives a site with no agent surfaces a near zero score", () => {
    const report = buildReport(EMPTY, "2026-09-24T10:00:00Z");
    expect(report.score).toBeLessThanOrEqual(5);
    expect(report.checks.some((c) => c.status === "pass")).toBe(false);
  });
  it("scores the demo bundles in the expected order", () => {
    const scores = Object.fromEntries(
      ["ein.llc", "samedaydesk.com", "agents.samedaydesk.com", "neomorphic.io"].map((h) => [
        h,
        buildReport(demoBundle(h), "2026-09-24T10:00:00Z").score
      ])
    );
    expect(scores["agents.samedaydesk.com"]).toBeGreaterThan(scores["ein.llc"]);
    expect(scores["ein.llc"]).toBeGreaterThan(scores["samedaydesk.com"]);
    for (const score of Object.values(scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
describe("top fixes", () => {
  it("lists at most three actionable checks, worst first", () => {
    const report = buildReport(demoBundle("samedaydesk.com"), "2026-09-24T10:00:00Z");
    expect(report.topFixes.length).toBe(3);
    for (const fix of report.topFixes) expect(fix.fix.length).toBeGreaterThan(0);
  });
  it("is empty when everything passes", () => {
    const checks = [
      { id: "a", category: "mcp", title: "a", status: "pass", reason: "", fix: "" }
    ];
    expect(topFixes(checks, scoreCategories(checks))).toEqual([]);
  });
  it("puts failures ahead of warnings", () => {
    const checks = [
      { id: "w", category: "cors", title: "warned", status: "warn", reason: "", fix: "f" },
      { id: "f", category: "cors", title: "failed", status: "fail", reason: "", fix: "f" }
    ];
    expect(topFixes(checks, scoreCategories(checks))[0].title).toBe("failed");
  });
  it("keeps non-applicable checks in the report but out of its next actions", () => {
    const checks = [
      { id: "openapi.idempotency", category: "usability", title: "Read-only API", status: "na", fix: "No action needed." },
      { id: "x402.resources", category: "x402", title: "Missing manifest prerequisite", status: "na", fix: "List paid resources." },
      { id: "mcp.absent", category: "mcp", title: "Declared absent", status: "fail", applicability: "declared-absent", fix: "Add MCP." },
      { id: "static.summary", category: "discovery", title: "Not probed", status: "warn", applicability: "not-probed", fix: "Add a summary." },
      { id: "x402.parses", category: "x402", title: "Failed manifest", status: "fail", fix: "Repair the manifest." },
      { id: "openapi.public", category: "openapi", title: "Public operation warning", status: "warn", fix: "Document public operations." },
      { id: "openapi.errors", category: "usability", title: "Error contract warning", status: "warn", fix: "Document errors." }
    ];
    const categories = scoreCategories(checks);
    expect(categories.find((category) => category.id === "usability").checks[0].status).toBe("na");
    expect(topFixes(checks, categories).map((row) => row.title)).toEqual([
      "Failed manifest", "Public operation warning", "Error contract warning"
    ]);
    expect(topFixes(checks.slice(0, 4), categories)).toEqual([]);
  });
});
describe("report shape", () => {
  it("carries the report schema and host", () => {
    const report = buildReport(demoBundle("neomorphic.io"), "2026-09-24T10:00:00Z");
    expect(report.schema).toBe("agent-readiness.report.v1");
    expect(report.host).toBe("neomorphic.io");
    expect(report.probedAt).toBe("2026-09-24T09:00:00Z");
    expect(report.generatedAt).toBe("2026-09-24T10:00:00Z");
  });
});
describe("compare delta", () => {
  it("reports a positive delta when the after bundle is stronger", () => {
    const before = buildReport(demoBundle("samedaydesk.com"), "2026-09-24T10:00:00Z");
    const after = buildReport(demoBundle("agents.samedaydesk.com"), "2026-09-24T10:00:00Z");
    const delta = compareReports(before, after);
    expect(delta.scoreDelta).toBe(after.score - before.score);
    expect(delta.scoreDelta).toBeGreaterThan(0);
    expect(delta.categoryDeltas.find((c) => c.id === "mcp").delta).toBeGreaterThan(0);
    expect(delta.changed.some((c) => c.id === "mcp.annotations")).toBe(true);
  });
  it("reports a zero delta for the same bundle", () => {
    const report = buildReport(demoBundle("ein.llc"), "2026-09-24T10:00:00Z");
    const delta = compareReports(report, report);
    expect(delta.scoreDelta).toBe(0);
    expect(delta.changed).toEqual([]);
  });
  it("reports a negative delta on regression", () => {
    const before = buildReport(demoBundle("agents.samedaydesk.com"), "2026-09-24T10:00:00Z");
    const after = buildReport(EMPTY, "2026-09-24T10:00:00Z");
    expect(compareReports(before, after).scoreDelta).toBeLessThan(0);
  });
});
