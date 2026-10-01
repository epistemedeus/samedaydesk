import { describe, expect, it } from "./expect-shim.js";
import { runChecks } from "../../lib/agent-readiness/checks.js";
import {
  detectWebMcp,
  discoverMcpLinks,
  needsWwwFallback,
  parseLlmsTxt,
  resolveMcp
} from "../../lib/agent-readiness/discovery.js";
import { probeScript } from "../../lib/agent-readiness/probeScript.js";
const text = (body, contentType = "text/plain") => ({ status: 200, contentType, body });
const base = (responses = {}) => ({
  schema: "agent-readiness.probe.v1",
  host: "www.legal.example",
  probedAt: "2026-09-24T11:50:00Z",
  responses: { "/mcp": { status: 404 }, ...responses }
});
const server = (url, foundVia) => ({
  url,
  offeredVersion: "2025-11-25",
  foundVia,
  initialize: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
  toolsList: {
    jsonrpc: "2.0",
    id: 2,
    result: {
      tools: [
        {
          name: "get_help",
          description: "Answer questions about the site. Use it when a user asks for help.",
          inputSchema: { type: "object", properties: {} },
          annotations: { readOnlyHint: true }
        }
      ]
    }
  }
});
const check = (b, id) => runChecks(b).checks.find((c) => c.id === id);
describe("llms.txt link parsing", () => {
  it("reads mcp-endpoint, mcp-catalog-json and webmcp-api keys", () => {
    const { links, webmcp } = parseLlmsTxt(
      [
        "# Legal",
        "mcp-endpoint: https://www.legal.example/mcp",
        "- mcp-catalog-json: https://www.legal.example/mcp/catalog.json",
        "webmcp-api: document.modelContext"
      ].join("\n"),
      "legal.example"
    );
    expect(links).toContainEqual({
      url: "https://www.legal.example/mcp",
      kind: "endpoint",
      sources: ["llms.txt mcp-endpoint"]
    });
    expect(links.find((l) => l.kind === "catalog")?.url).toBe(
      "https://www.legal.example/mcp/catalog.json"
    );
    expect(webmcp).toEqual(["llms.txt webmcp-api: document.modelContext"]);
  });
  it("finds any URL ending in /mcp, including relative and other-host links", () => {
    const { links } = parseLlmsTxt(
      "See [MCP](https://tools.other.example/v2/mcp). Labs: /labs/correspondence-mcp/ and /mcp/.",
      "neo.example"
    );
    expect(links.map((l) => l.url).sort()).toEqual([
      "https://neo.example/labs/correspondence-mcp/",
      "https://neo.example/mcp/",
      "https://tools.other.example/v2/mcp"
    ]);
  });
  it("ignores URLs that are not MCP endpoints", () => {
    expect(parseLlmsTxt("Docs: https://x.example/openapi.json /pricing", "x.example").links).toEqual([]);
  });
});
describe("discovery from api-catalog and agent card", () => {
  it("collects MCP links with every source that named them", () => {
    const b = base({
      "/llms.txt": text("mcp-endpoint: https://mcp.legal.example/mcp"),
      "/.well-known/api-catalog": text(
        JSON.stringify({ linkset: [{ anchor: "https://www.legal.example", "service-desc": [{ href: "https://mcp.legal.example/mcp" }] }] }),
        "application/linkset+json"
      ),
      "/.well-known/agent-card.json": text(
        JSON.stringify({ name: "x", interfaces: [{ url: "https://a2a.legal.example/rpc", transport: "MCP" }] }),
        "application/json"
      )
    });
    const links = discoverMcpLinks(b);
    expect(links.find((l) => l.url === "https://mcp.legal.example/mcp")?.sources).toEqual([
      "llms.txt mcp-endpoint",
      "api-catalog linkset"
    ]);
    expect(links.find((l) => l.url === "https://a2a.legal.example/rpc")?.sources).toEqual([
      "agent-card interfaces"
    ]);
  });
  it("follows endpoints listed in a fetched MCP catalog JSON", () => {
    const b = base({ "/llms.txt": text("mcp-catalog-json: /mcp/catalog.json") });
    b.linkedResponses = {
      "https://www.legal.example/mcp/catalog.json": text(
        JSON.stringify({ servers: [{ url: "https://mcp.partner.example/mcp" }] }),
        "application/json"
      )
    };
    expect(discoverMcpLinks(b).find((l) => l.url === "https://mcp.partner.example/mcp")?.sources).toEqual([
      "MCP catalog JSON"
    ]);
  });
});
describe("linked MCP servers", () => {
  it("counts an MCP on another host when the site links it, and says where", () => {
    const b = base({ "/llms.txt": text("mcp-endpoint: https://mcp.partner.example/mcp") });
    b.linkedMcp = [server("https://mcp.partner.example/mcp", ["llms.txt mcp-endpoint"])];
    expect(resolveMcp(b)?.url).toBe("https://mcp.partner.example/mcp");
    expect(check(b, "mcp.initialize").status).toBe("pass");
    expect(check(b, "mcp.tools").status).toBe("pass");
    const d = check(b, "mcp.discovered");
    expect(d.status).toBe("pass");
    expect(d.reason).toContain("llms.txt mcp-endpoint");
    expect(d.reason).toContain("mcp.partner.example");
  });
  it("prefers the host's own answering /mcp", () => {
    const b = base({ "/llms.txt": text("mcp-endpoint: https://www.legal.example/mcp") });
    b.mcp = server("https://www.legal.example/mcp", ["llms.txt mcp-endpoint"]);
    b.linkedMcp = [server("https://other.example/mcp", ["llms.txt link"])];
    expect(resolveMcp(b)?.url).toBe("https://www.legal.example/mcp");
    expect(check(b, "mcp.discovered").status).toBe("pass");
  });
  it("warns when a link exists but nothing answered", () => {
    const b = base({ "/llms.txt": text("MCP at /labs/correspondence-mcp/") });
    const d = check(b, "mcp.discovered");
    expect(d.status).toBe("warn");
    expect(check(b, "mcp.initialize").status).toBe("fail");
  });
  it("warns when a server answers but no discovery file links it", () => {
    const b = base({ "/llms.txt": text("# plain") });
    b.mcp = server("https://www.legal.example/mcp", []);
    expect(check(b, "mcp.discovered").status).toBe("warn");
  });
  it("fails when there is no link and no server", () => {
    expect(check(base(), "mcp.discovered").status).toBe("fail");
  });
});
describe("www fallback", () => {
  it("falls back on redirects, empty bodies and no answer", () => {
    expect(needsWwwFallback("legal.example", { status: 301 })).toBe(true);
    expect(needsWwwFallback("legal.example", { status: 200, body: "" })).toBe(true);
    expect(needsWwwFallback("legal.example", { status: 0 })).toBe(true);
    expect(needsWwwFallback("legal.example", void 0)).toBe(true);
  });
  it("does not fall back when the apex has content or already is www", () => {
    expect(needsWwwFallback("legal.example", { status: 200, body: "<html>" })).toBe(false);
    expect(needsWwwFallback("www.legal.example", { status: 301 })).toBe(false);
  });
  it("is wired into the probe script, which never calls a real tool", () => {
    const s = probeScript("legal.example");
    expect(s).toContain('HOST="www.');
    expect(s).toContain("wwwFallback");
    expect(s).toContain("mcp-endpoint");
    expect(s).toContain("mcp-catalog-json");
    const calls = s.match(/"method": ?"tools\/call"/g) ?? [];
    const names = [...s.matchAll(/"name": ?"([^"]+)", ?"arguments"/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(/* @__PURE__ */ new Set(["__definitely_not_a_tool__"]));
  });
});
describe("WebMCP detection", () => {
  it("passes when llms.txt declares webmcp-api", () => {
    const b = base({ "/llms.txt": text("webmcp-api: document.modelContext") });
    expect(detectWebMcp(b)).toEqual(["llms.txt webmcp-api: document.modelContext"]);
    expect(check(b, "webmcp.declared").status).toBe("pass");
  });
  it("passes when a page registers navigator.modelContext", () => {
    const b = base({
      "/": text("<script>navigator.modelContext.provideContext({tools:[]})</script>", "text/html")
    });
    expect(check(b, "webmcp.declared").reason).toContain("page / uses navigator.modelContext");
  });
  it("is informational and not a pass when absent", () => {
    const c = check(base({ "/llms.txt": text("# nothing") }), "webmcp.declared");
    expect(c.status).toBe("na");
    expect(c.category).toBe("webmcp");
  });
  it("ignores modelContext in non-HTML JSON bodies", () => {
    const b = base({ "/openapi.json": text('{"x":"navigator.modelContext"}', "application/json") });
    expect(detectWebMcp(b)).toEqual([]);
  });
});
