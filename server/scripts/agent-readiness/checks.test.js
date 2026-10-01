import { describe, expect, it } from "./expect-shim.js";
import { blockedAgents, runChecks } from "../../lib/agent-readiness/checks.js";
import { demoBundle, DEMO_BUNDLES } from "../../lib/agent-readiness/demo.js";
function statusOf(bundle, id) {
  const { checks } = runChecks(bundle);
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`No check ${id}`);
  return found.status;
}
const EMPTY = {
  schema: "agent-readiness.probe.v1",
  host: "nothing.example",
  probedAt: "2026-09-24T09:00:00Z",
  responses: {
    "/llms.txt": { status: 404 },
    "/skill.md": { status: 404 },
    "/openapi.json": { status: 404 },
    "/.well-known/agent-card.json": { status: 404 },
    "/.well-known/api-catalog": { status: 404 },
    "/.well-known/x402": { status: 404 },
    "/mcp": { status: 404 },
    "/robots.txt": { status: 404 }
  }
};
describe("discovery checks", () => {
  it("passes when llms.txt and skill.md exist and robots allows agents", () => {
    const b = demoBundle("ein.llc");
    expect(statusOf(b, "discovery.llms")).toBe("pass");
    expect(statusOf(b, "discovery.skill")).toBe("pass");
    expect(statusOf(b, "discovery.robots")).toBe("pass");
  });
  it("fails when the files are absent", () => {
    expect(statusOf(EMPTY, "discovery.llms")).toBe("fail");
    expect(statusOf(EMPTY, "discovery.skill")).toBe("fail");
    expect(statusOf(EMPTY, "discovery.llms.links")).toBe("na");
  });
  it("warns when llms.txt links only some surfaces", () => {
    expect(statusOf(demoBundle("ein.llc"), "discovery.llms.links")).toBe("warn");
    expect(statusOf(demoBundle("samedaydesk.com"), "discovery.llms.links")).toBe("warn");
  });
  it("detects blocked AI agents in robots.txt", () => {
    expect(blockedAgents("User-agent: *\nAllow: /")).toEqual([]);
    expect(blockedAgents("User-agent: GPTBot\nDisallow: /")).toEqual(["GPTBot"]);
    expect(blockedAgents("User-agent: *\nDisallow: /").length).toBeGreaterThan(1);
  });
  it("fails robots when an AI agent is disallowed", () => {
    const b = {
      ...EMPTY,
      responses: {
        ...EMPTY.responses,
        "/robots.txt": { status: 200, body: "User-agent: ClaudeBot\nDisallow: /" }
      }
    };
    expect(statusOf(b, "discovery.robots")).toBe("fail");
  });
});
describe("openapi checks", () => {
  it("passes a complete 3.1 document", () => {
    const b = demoBundle("ein.llc");
    expect(statusOf(b, "openapi.parses")).toBe("pass");
    expect(statusOf(b, "openapi.version")).toBe("pass");
    expect(statusOf(b, "openapi.operationId")).toBe("pass");
    expect(statusOf(b, "openapi.summary")).toBe("pass");
    expect(statusOf(b, "openapi.security")).toBe("pass");
    expect(statusOf(b, "openapi.public")).toBe("pass");
  });
  it("marks downstream checks not applicable without a document", () => {
    expect(statusOf(EMPTY, "openapi.parses")).toBe("fail");
    expect(statusOf(EMPTY, "openapi.version")).toBe("na");
  });
  it("fails a swagger 2.0 document and warns on gaps", () => {
    const b = {
      ...EMPTY,
      responses: {
        ...EMPTY.responses,
        "/openapi.json": {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            swagger: "2.0",
            paths: { "/a": { get: { responses: {} } } }
          })
        }
      }
    };
    expect(statusOf(b, "openapi.version")).toBe("fail");
    expect(statusOf(b, "openapi.operationId")).toBe("warn");
    expect(statusOf(b, "openapi.summary")).toBe("warn");
    expect(statusOf(b, "openapi.security")).toBe("warn");
    expect(statusOf(b, "openapi.public")).toBe("warn");
  });
  it("fails when the document is served but unparsable", () => {
    const b = {
      ...EMPTY,
      responses: { ...EMPTY.responses, "/openapi.json": { status: 200, body: "<html>" } }
    };
    expect(statusOf(b, "openapi.parses")).toBe("fail");
  });
});
describe("mcp checks", () => {
  it("passes a modern server", () => {
    const b = demoBundle("agents.samedaydesk.com");
    expect(statusOf(b, "mcp.initialize")).toBe("pass");
    expect(statusOf(b, "mcp.version")).toBe("pass");
    expect(statusOf(b, "mcp.tools")).toBe("pass");
    expect(statusOf(b, "mcp.inputSchema")).toBe("pass");
    expect(statusOf(b, "mcp.annotations")).toBe("pass");
    expect(statusOf(b, "mcp.unknownTool")).toBe("pass");
  });
  it("flags an old-only server, missing annotations and the wrong error code", () => {
    const b = demoBundle("samedaydesk.com");
    expect(statusOf(b, "mcp.version")).toBe("warn");
    expect(statusOf(b, "mcp.annotations")).toBe("fail");
    expect(statusOf(b, "mcp.unknownTool")).toBe("warn");
  });
  it("is not applicable when there is no MCP server", () => {
    expect(statusOf(EMPTY, "mcp.initialize")).toBe("fail");
    expect(statusOf(EMPTY, "mcp.version")).toBe("na");
    expect(statusOf(EMPTY, "mcp.unknownTool")).toBe("na");
  });
});
describe("agent card checks", () => {
  it("passes a card with skills and interfaces", () => {
    const b = demoBundle("agents.samedaydesk.com");
    expect(statusOf(b, "agentCard.present")).toBe("pass");
    expect(statusOf(b, "agentCard.skills")).toBe("pass");
    expect(statusOf(b, "agentCard.interfaces")).toBe("pass");
  });
  it("fails an empty skills list", () => {
    const b = {
      ...EMPTY,
      responses: {
        ...EMPTY.responses,
        "/.well-known/agent-card.json": {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ name: "x", description: "y", skills: [] })
        }
      }
    };
    expect(statusOf(b, "agentCard.present")).toBe("pass");
    expect(statusOf(b, "agentCard.skills")).toBe("fail");
    expect(statusOf(b, "agentCard.interfaces")).toBe("warn");
  });
  it("fails when no card is published", () => {
    expect(statusOf(EMPTY, "agentCard.present")).toBe("fail");
    expect(statusOf(EMPTY, "agentCard.skills")).toBe("na");
  });
});
describe("x402 checks", () => {
  it("passes a non-empty manifest", () => {
    expect(statusOf(demoBundle("agents.samedaydesk.com"), "x402.resources")).toBe("pass");
  });
  it("accepts a truthfully empty manifest", () => {
    expect(statusOf(demoBundle("neomorphic.io"), "x402.parses")).toBe("pass");
    expect(statusOf(demoBundle("neomorphic.io"), "x402.resources")).toBe("pass");
  });
  it("warns on a silently empty manifest", () => {
    const b = {
      ...EMPTY,
      responses: {
        ...EMPTY.responses,
        "/.well-known/x402": {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ x402Version: 1, resources: [] })
        }
      }
    };
    expect(statusOf(b, "x402.resources")).toBe("warn");
  });
  it("fails when absent", () => {
    expect(statusOf(EMPTY, "x402.parses")).toBe("fail");
  });
});
describe("cors checks", () => {
  it("passes with wildcard preflights", () => {
    expect(statusOf(demoBundle("neomorphic.io"), "cors.preflight")).toBe("pass");
    expect(statusOf(demoBundle("samedaydesk.com"), "cors.preflight")).toBe("pass");
  });
  it("fails when preflights are rejected", () => {
    expect(statusOf(demoBundle("ein.llc"), "cors.preflight")).toBe("fail");
    expect(statusOf(demoBundle("agents.samedaydesk.com"), "cors.preflight")).toBe("fail");
  });
});
describe("api-catalog checks", () => {
  it("passes a linkset whose links resolve", () => {
    const b = demoBundle("ein.llc");
    expect(statusOf(b, "apiCatalog.present")).toBe("pass");
    expect(statusOf(b, "apiCatalog.contentType")).toBe("pass");
    expect(statusOf(b, "apiCatalog.links")).toBe("pass");
  });
  it("warns on the wrong content type and unresolved links", () => {
    const b = {
      ...EMPTY,
      responses: {
        ...EMPTY.responses,
        "/.well-known/api-catalog": {
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            linkset: [
              {
                anchor: "https://x.example",
                "service-desc": [{ href: "https://x.example/openapi.json" }]
              }
            ]
          })
        }
      }
    };
    expect(statusOf(b, "apiCatalog.contentType")).toBe("warn");
    expect(statusOf(b, "apiCatalog.links")).toBe("fail");
  });
  it("fails when absent", () => {
    expect(statusOf(EMPTY, "apiCatalog.present")).toBe("fail");
    expect(statusOf(EMPTY, "apiCatalog.links")).toBe("na");
  });
});
describe("every demo bundle", () => {
  it("produces a status for every check without throwing", () => {
    for (const bundle of DEMO_BUNDLES) {
      const { checks } = runChecks(bundle);
      expect(checks.length).toBeGreaterThan(15);
      for (const check of checks) {
        expect(check.reason.length).toBeGreaterThan(0);
        expect(check.fix.length).toBeGreaterThan(0);
      }
    }
  });
});
