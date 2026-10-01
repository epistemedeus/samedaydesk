import { describe, expect, it } from "./expect-shim.js";
import { buildIdentityMatrix, extractNamesFromText, normalizeName } from "../../lib/agent-readiness/normalize.js";
import { collectNamedOperations } from "../../lib/agent-readiness/checks.js";
import { demoBundle } from "../../lib/agent-readiness/demo.js";
describe("normalizeName", () => {
  it("collapses camelCase, snake_case, kebab-case and spacing", () => {
    const expected = "issuestatusgrant";
    for (const variant of [
      "issueStatusGrant",
      "issue_status_grant",
      "issue-status-grant",
      "Issue Status Grant",
      "ISSUE_STATUS_GRANT".toLowerCase(),
      "issue.status.grant"
    ]) {
      expect(normalizeName(variant)).toBe(expected);
    }
  });
  it("keeps different operations distinct", () => {
    expect(normalizeName("listStatusGrants")).not.toBe(normalizeName("issueStatusGrant"));
  });
  it("returns an empty string for junk", () => {
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("---")).toBe("");
  });
});
describe("extractNamesFromText", () => {
  it("finds backticked and camelCase identifiers", () => {
    const names = extractNamesFromText("Call `issue_status_grant` then getApplicationStatus.");
    expect(names).toContain("issue_status_grant");
    expect(names).toContain("getApplicationStatus");
  });
  it("ignores common noise words", () => {
    expect(extractNamesFromText("see the json at https://x.example")).not.toContain("json");
  });
});
describe("identity matrix", () => {
  it("matches names across surfaces after normalization", () => {
    const matrix = buildIdentityMatrix({
      openapi: ["issueStatusGrant", "listStatusGrants"],
      mcp: ["issue_status_grant", "list_status_grants"]
    });
    expect(matrix.operations.length).toBe(2);
    expect(matrix.activeSurfaces).toEqual(["openapi", "mcp"]);
    expect(matrix.mismatches).toEqual([]);
    expect(matrix.present["issueStatusGrant"].mcp).toBe(true);
  });
  it("records a mismatch when a surface omits an operation", () => {
    const matrix = buildIdentityMatrix({
      openapi: ["renderScene", "exportTokens"],
      mcp: ["render_scene"]
    });
    expect(matrix.mismatches.length).toBe(1);
    expect(matrix.mismatches[0]).toContain("exportTokens");
    expect(matrix.present["exportTokens"].mcp).toBe(false);
  });
  it("ignores surfaces that name nothing", () => {
    const matrix = buildIdentityMatrix({ openapi: ["a_b_c"], mcp: [] });
    expect(matrix.activeSurfaces).toEqual(["openapi"]);
    expect(matrix.mismatches).toEqual([]);
  });
  it("is empty with no input", () => {
    const matrix = buildIdentityMatrix({});
    expect(matrix.operations).toEqual([]);
    expect(matrix.activeSurfaces).toEqual([]);
  });
});
describe("collectNamedOperations", () => {
  it("reads all nine ein.llc operations out of the OpenAPI document", () => {
    const named = collectNamedOperations(demoBundle("ein.llc"));
    expect(named.openapi?.length).toBe(9);
    expect(named.openapi).toContain("getFormationContract");
    expect(named["skill.md"]).toContain("assessFormation");
    expect(named.mcp).toBeUndefined();
  });
  it("reads MCP tool names and agent card skills", () => {
    const named = collectNamedOperations(demoBundle("agents.samedaydesk.com"));
    expect(named.mcp?.length).toBe(25);
    expect(named.agentCard?.length).toBe(25);
    expect(named.openapi?.length).toBe(25);
  });
  it("lines up MCP tools with agent card skills and OpenAPI operations", () => {
    const matrix = buildIdentityMatrix(collectNamedOperations(demoBundle("agents.samedaydesk.com")));
    expect(matrix.activeSurfaces).toEqual(["openapi", "mcp", "agentCard"]);
    expect(matrix.mismatches).toEqual([]);
  });
});
