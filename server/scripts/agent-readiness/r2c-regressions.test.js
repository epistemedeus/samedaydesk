import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./expect-shim.js";
import { runChecks } from "../../lib/agent-readiness/checks.js";
import { guardedExchange, probeHost } from "../../lib/agent-readiness/probe.js";
import { buildReport } from "../../lib/agent-readiness/score.js";
import { validateBundle } from "../../lib/agent-readiness/schema.js";
import { formatAgentReadiness, presentReport } from "../../lib/agent-readiness/service.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures/r2c");
const read = (name) => readFileSync(join(fixtures, name), "utf8");
const capturedNeo = JSON.parse(read("owner-qa-neomorphic.json"));
const capturedAgents = JSON.parse(read("owner-qa-agents-x402.json"));
const neoLlms = read("neomorphic-llms.txt");
const neoHome = read("neomorphic-home.html");
const neoX402 = read("neomorphic-x402.json");
const neoOpenapi = read("neomorphic-openapi.json");
const agentsX402 = read("agents-x402.json");
const deskLlms = read("samedaydesk-llms.txt");
const ABSENCE_QUOTE = "No A2A agent endpoint, MCP server";
const REDIRECT_GAP = "301 → /mcp/ 200 text/html (no MCP handshake)";

function bundle(host, responses, extra = {}) {
  return {
    schema: "agent-readiness.probe.v1",
    host,
    probedAt: "2026-10-14T23:43:00Z",
    responses,
    ...extra,
  };
}

function checkOf(reportOrChecks, id) {
  const checks = Array.isArray(reportOrChecks) ? reportOrChecks : reportOrChecks.checks;
  const found = checks.find((item) => item.id === id);
  if (!found) throw new Error(`missing check ${id}`);
  return found;
}

function jsonBody(value, contentType = "application/json") {
  return { status: 200, contentType, headers: { "content-type": contentType }, body: JSON.stringify(value) };
}

function neoBundle() {
  return bundle("neomorphic.io", {
    "/": { status: 200, contentType: "text/html; charset=UTF-8", body: neoHome },
    "/llms.txt": { status: 200, contentType: "text/plain; charset=UTF-8", body: neoLlms },
    "/skill.md": { status: 200, contentType: "text/plain", body: "# Skill\n\nRead the public JSON indexes before relying on a record.\n" },
    "/openapi.json": { status: 200, contentType: "application/json; charset=UTF-8", body: neoOpenapi },
    "/.well-known/openapi.json": { status: 404, contentType: "text/html", body: "<html>missing</html>" },
    "/.well-known/agent-card.json": { status: 404, contentType: "text/html", body: "<html>missing</html>" },
    "/.well-known/agent.json": { status: 404, contentType: "text/html", body: "<html>missing</html>" },
    "/.well-known/api-catalog": { status: 404, contentType: "text/html", body: "<html>missing</html>" },
    "/.well-known/x402": { status: 200, contentType: "application/json; charset=utf-8", body: neoX402 },
    "/mcp": {
      status: 200,
      contentType: "text/html; charset=UTF-8",
      headers: { "content-type": "text/html; charset=UTF-8" },
      body: "<!DOCTYPE html><html><title>MCP Status</title><body>No MCP endpoint is launched.</body></html>",
      finalUrl: "https://neomorphic.io/mcp/",
      redirects: [{ status: 301, location: "/mcp/" }],
    },
    "/robots.txt": { status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /\n" },
  });
}

const PUBLISH_MCP = /expose an mcp endpoint|publish mcp tools|add absolute links to \/openapi\.json, \/mcp/i;
const PUBLISH_CARD = /publish an a2a agent card|agent card at \/\.well-known\/agent-card\.json/i;

describe("captured first-use defects", () => {
  it("records the owner-qa false pass and the redirect misreport", () => {
    expect(capturedNeo.host).toBe("neomorphic.io");
    expect(checkOf(capturedNeo, "discovery.llms.links").status).toBe("pass");
    expect(checkOf(capturedNeo, "mcp.initialize").reason).toBe("No MCP server (/mcp returned 200).");
    expect(capturedNeo.topFixes[0].fix).toContain("Expose an MCP endpoint");
    expect(capturedNeo.topFixes[1].fix).toContain("Publish an A2A agent card");
    expect(checkOf(capturedAgents, "x402.resources").reason).toContain("has no resources");
  });
});

describe("D1 llms.txt linkage", () => {
  it("does not pass when the MCP link is negated and A2A is declared absent", () => {
    const { checks } = runChecks(neoBundle());
    const links = checkOf(checks, "discovery.llms.links");
    expect(links.status).not.toBe("pass");
    expect(links.reason).toContain("not applicable: declared absent");
    expect(links.reason).toContain(ABSENCE_QUOTE);
    expect(links.reason).toContain("not an MCP protocol endpoint");
    expect(links.linkage.api.state).toBe("target-valid");
    expect(links.linkage.mcp.state).toBe("declared-absent");
    expect(links.linkage.agentCard.state).toBe("declared-absent");
    expect(links.linkage.passMeans).toBe("target-valid");
    expect(links.fix).not.toMatch(PUBLISH_MCP);
    expect(links.fix).not.toMatch(PUBLISH_CARD);
  });

  it("passes only when each linked target was fetched and is the declared kind", () => {
    const host = "shop.example";
    const llms = [
      "# Shop",
      `- OpenAPI: https://${host}/openapi.json`,
      `- MCP: https://${host}/mcp`,
      `- Agent card: https://${host}/.well-known/agent-card.json`,
    ].join("\n");
    const { checks } = runChecks(bundle(host, {
      "/llms.txt": { status: 200, contentType: "text/plain", body: llms },
      "/openapi.json": jsonBody({ openapi: "3.1.0", info: { title: "Shop", version: "1" }, paths: {} }),
      "/mcp": { status: 405, contentType: "text/plain", body: "POST only" },
      "/.well-known/agent-card.json": jsonBody({ name: "Shop", description: "Books things for agents." }),
    }, {
      mcp: {
        url: `https://${host}/mcp`,
        offeredVersion: "2025-11-25",
        initialize: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
      },
    }));
    const links = checkOf(checks, "discovery.llms.links");
    expect(links.status).toBe("pass");
    expect(links.linkage.api.state).toBe("target-valid");
    expect(links.linkage.mcp.state).toBe("target-valid");
    expect(links.linkage.agentCard.state).toBe("target-valid");
  });

  it("does not treat a bare MCP word, or an HTML target, as a valid MCP link", () => {
    const host = "docs.example";
    const llms = `The word MCP appears here.\n- Status: https://${host}/mcp\n`;
    const { checks } = runChecks(bundle(host, {
      "/llms.txt": { status: 200, contentType: "text/plain", body: llms },
      "/mcp": { status: 200, contentType: "text/html", body: "<html><body>Not a protocol endpoint.</body></html>" },
    }));
    const links = checkOf(checks, "discovery.llms.links");
    expect(links.status).not.toBe("pass");
    expect(links.linkage.mcp.state).toBe("target-invalid");
  });

  it("keeps a real same-origin MCP, OpenAPI and agent card link as a pass", () => {
    const host = "samedaydesk.com";
    const { checks } = runChecks(bundle(host, {
      "/llms.txt": { status: 200, contentType: "text/plain; charset=utf-8", body: deskLlms },
      "/openapi.json": jsonBody({ openapi: "3.1.0", info: { title: "Desk", version: "1" }, paths: {} }),
      "/mcp": { status: 200, contentType: "text/plain", body: "Streamable HTTP MCP." },
      "/.well-known/agent-card.json": jsonBody({
        name: "SameDayDesk",
        description: "Agent readiness and paid machine actions.",
      }),
    }, {
      mcp: {
        url: `https://${host}/mcp`,
        offeredVersion: "2025-11-25",
        initialize: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
      },
    }));
    const links = checkOf(checks, "discovery.llms.links");
    expect(links.linkage.mcp.state).not.toBe("declared-absent");
    expect(links.linkage.agentCard.state).toBe("target-valid");
    expect(links.status).toBe("pass");
  });
});

describe("declared absence", () => {
  it("reports MCP and the agent card as not applicable and keeps them out of top fixes", () => {
    const source = neoBundle();
    const report = buildReport(source, "2026-10-14T23:45:00Z");
    for (const id of ["mcp.initialize", "mcp.discovered", "agentCard.present", "usability.mcp.desc"]) {
      const item = checkOf(report, id);
      expect(item.status).toBe("na");
      expect(item.applicability).toBe("declared-absent");
      expect(item.reason).toContain("not applicable: declared absent");
      expect(item.reason).toContain(ABSENCE_QUOTE);
      expect(item.fix).not.toMatch(PUBLISH_MCP);
      expect(item.fix).not.toMatch(PUBLISH_CARD);
    }
    expect(checkOf(report, "mcp.initialize").reason).toContain(REDIRECT_GAP);
    const payload = presentReport(report, source);
    expect(payload.topFixes.some((fix) => PUBLISH_MCP.test(fix.fix) || PUBLISH_CARD.test(fix.fix))).toBe(false);
    const text = formatAgentReadiness(payload);
    expect(text).toContain("Agent readiness for neomorphic.io");
    expect(text).toContain("Top fixes:");
    expect(text).toContain(REDIRECT_GAP);
    expect(text).not.toMatch(PUBLISH_MCP);
    expect(text).not.toMatch(PUBLISH_CARD);
  });

  it("does not turn a declared-absent line into a universal pass", () => {
    const host = "plain.example";
    const { checks } = runChecks(bundle(host, {
      "/llms.txt": {
        status: 200,
        contentType: "text/plain",
        body: "# Plain\n\nThere is no MCP server and no agent card yet.\n- OpenAPI: https://plain.example/openapi.json\n",
      },
      "/openapi.json": jsonBody({ openapi: "3.1.0", info: { title: "Plain", version: "1" }, paths: {} }),
      "/mcp": { status: 404, contentType: "text/plain", body: "missing" },
      "/.well-known/agent-card.json": { status: 404, contentType: "text/plain", body: "missing" },
    }));
    const links = checkOf(checks, "discovery.llms.links");
    expect(links.status).not.toBe("pass");
    expect(links.linkage.mcp.state).toBe("declared-absent");
    expect(links.linkage.agentCard.state).toBe("declared-absent");
    expect(checkOf(checks, "mcp.initialize").status).toBe("na");
    expect(checkOf(checks, "agentCard.present").fix).not.toMatch(PUBLISH_CARD);
  });
});

describe("D3 redirects", () => {
  it("records the redirect chain separately from the final status", async () => {
    const calls = [];
    const got = await guardedExchange("https://ok.example/mcp", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      rawExchange(url) {
        const target = String(url);
        calls.push(target);
        if (target.endsWith("/mcp")) {
          return { status: 301, headers: { location: "https://ok.example/mcp/" }, body: "" };
        }
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
          body: "<!DOCTYPE html><html><body>docs</body></html>",
        };
      },
    });
    expect(got.status).toBe(200);
    expect(got.finalUrl).toBe("https://ok.example/mcp/");
    expect(got.redirects).toEqual([{ status: 301, location: "/mcp/" }]);
    expect(calls).toEqual(["https://ok.example/mcp", "https://ok.example/mcp/"]);
  });

  it("keeps the chain on the probe response and does not fail a final document", async () => {
    const bundleResult = await probeHost("ok.example", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      exchange: async (url) => {
        const target = String(url);
        if (target.endsWith("/llms.txt")) {
          return {
            status: 200,
            headers: { "content-type": "text/plain" },
            body: "# Notes\n\nA public API description lives at /openapi.json.\n",
            finalUrl: "https://ok.example/docs/llms.txt",
            redirects: [{ status: 301, location: "/docs/llms.txt" }],
          };
        }
        if (target.endsWith("/mcp")) {
          return {
            status: 200,
            headers: { "content-type": "text/html" },
            body: "<html>docs</html>",
            finalUrl: "https://ok.example/mcp/",
            redirects: [{ status: 301, location: "/mcp/" }],
          };
        }
        return { status: 404, headers: {}, body: "", finalUrl: target };
      },
    });
    expect(bundleResult.responses["/mcp"].status).toBe(200);
    expect(bundleResult.responses["/mcp"].redirects).toEqual([{ status: 301, location: "/mcp/" }]);
    expect(bundleResult.responses["/llms.txt"].redirects).toEqual([{ status: 301, location: "/docs/llms.txt" }]);
    const report = buildReport(bundleResult, "2026-10-15T00:00:00Z");
    expect(checkOf(report, "discovery.llms").status).toBe("pass");
    expect(checkOf(report, "mcp.initialize").reason).toBe(REDIRECT_GAP);
    const payload = presentReport(report, bundleResult);
    const mcpEvidence = payload.evidence.find((row) => row.path === "/mcp" && row.redirects);
    expect(mcpEvidence.status).toBe(200);
    expect(mcpEvidence.contentType).toBe("text/html");
    expect(mcpEvidence.redirects).toEqual([{ status: 301, location: "/mcp/" }]);
    expect(validateBundle(JSON.parse(JSON.stringify(bundleResult))).responses["/mcp"].redirects[0].location).toBe("/mcp/");
  });

  it("still refuses a redirect to a private address", async () => {
    await assert.rejects(() => guardedExchange("https://ok.example/llms.txt", {
      lookup: async (hostname) => {
        if (hostname === "ok.example") return [{ address: "1.1.1.1", family: 4 }];
        return [{ address: "127.0.0.1", family: 4 }];
      },
      rawExchange() {
        return { status: 302, headers: { location: "http://127.0.0.1/secret" }, body: "" };
      },
    }), /Redirect target is not a public address/);
  });

  it("does not treat a redirect followed by a real handshake as a failure", () => {
    const host = "handshake.example";
    const { checks } = runChecks(bundle(host, {
      "/llms.txt": { status: 200, contentType: "text/plain", body: `MCP: https://${host}/mcp\n` },
      "/mcp": {
        status: 200,
        contentType: "text/plain",
        body: "ok",
        redirects: [{ status: 301, location: "/mcp/" }],
      },
    }, {
      mcp: {
        url: `https://${host}/mcp`,
        offeredVersion: "2025-11-25",
        initialize: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
      },
    }));
    expect(checkOf(checks, "mcp.initialize").status).toBe("pass");
    expect(checkOf(checks, "mcp.initialize").reason).not.toContain("no MCP handshake");
  });
});

describe("D4 x402 manifest entries", () => {
  it("counts valid Bazaar items instead of saying the manifest has no resources", () => {
    const { checks } = runChecks(bundle("agents.samedaydesk.com", {
      "/.well-known/x402": { status: 200, contentType: "application/json; charset=utf-8", body: agentsX402 },
    }));
    const resources = checkOf(checks, "x402.resources");
    expect(resources.status).toBe("pass");
    expect(resources.reason).toContain("26 valid paid resources");
    expect(resources.reason).not.toContain("has no resources");
    expect(resources.x402Entries).toEqual({ valid: 26, invalid: 0, items: 26, resources: 0 });
  });

  it("does not count invalid entries or object keys as resources", () => {
    const invalid = runChecks(bundle("empty-items.example", {
      "/.well-known/x402": jsonBody({
        x402Version: 1,
        resources: [{}, { note: "nope" }, "x"],
      }),
    }));
    const invalidCheck = checkOf(invalid.checks, "x402.resources");
    expect(invalidCheck.status).not.toBe("pass");
    expect(invalidCheck.reason).not.toMatch(/3 paid resources/);
    expect(invalidCheck.reason).not.toContain("has no resources");
    expect(invalidCheck.reason).toContain("none are valid");

    const keyed = runChecks(bundle("keyed.example", {
      "/.well-known/x402": jsonBody({
        resources: {
          a: { resource: "https://keyed.example/a", accepts: [{ scheme: "exact", network: "base", asset: "USDC" }] },
        },
      }),
    }));
    const keyedCheck = checkOf(keyed.checks, "x402.resources");
    expect(keyedCheck.status).toBe("warn");
    expect(keyedCheck.reason).toContain("has no resources");
    expect(keyedCheck.x402Entries.valid).toBe(0);
  });

  it("accepts an explicit empty declaration and still warns when the list is silently empty", () => {
    const declared = runChecks(bundle("neomorphic.io", {
      "/.well-known/x402": { status: 200, contentType: "application/json", body: neoX402 },
    }));
    const declaredCheck = checkOf(declared.checks, "x402.resources");
    expect(declaredCheck.status).toBe("pass");
    expect(declaredCheck.reason).not.toContain("has no resources");
    expect(declaredCheck.reason).toContain("No x402 payable resources");

    const silent = runChecks(bundle("silent.example", {
      "/.well-known/x402": jsonBody({ x402Version: 1, resources: [] }),
    }));
    expect(checkOf(silent.checks, "x402.resources").status).toBe("warn");
    expect(checkOf(silent.checks, "x402.resources").reason).toContain("has no resources");
  });
});

describe("no-JS summary", () => {
  it("reports visible text, whether it says what the product is, and machine links", () => {
    const { checks } = runChecks(neoBundle());
    const summary = checkOf(checks, "static.summary");
    expect(summary.category).toBe("discovery");
    expect(summary.staticSummary.wordCount).toBeGreaterThan(200);
    expect(summary.staticSummary.wordCount).toBeLessThan(400);
    expect(summary.staticSummary.saysWhatItIs).toBe(true);
    expect(summary.staticSummary.pointers.some((href) => /llms\.txt|openapi|(?:^|\/)mcp(?:\/|$)|(?:^|\/)api(?:\/|$)/i.test(href))).toBe(false);
    expect(summary.reason).toContain(String(summary.staticSummary.wordCount));
    expect(summary.reason).toContain("Says what the product is");
    expect(summary.reason).toContain("custodial institution");
    expect(summary.reason).toContain("No pointer to API, OpenAPI, MCP, or llms.txt");
    expect(summary.status).toBe("warn");
  });

  it("ignores script text and passes a static sentence that links llms.txt", () => {
    const shell = runChecks(bundle("shell.example", {
      "/": {
        status: 200,
        contentType: "text/html",
        body: "<html><script>const words = 'agent api openapi mcp llms.txt '.repeat(40)</script><body></body></html>",
      },
    }));
    const shellCheck = checkOf(shell.checks, "static.summary");
    expect(shellCheck.staticSummary.wordCount).toBe(0);
    expect(shellCheck.staticSummary.saysWhatItIs).toBe(false);
    expect(shellCheck.status).toBe("fail");

    const page = runChecks(bundle("page.example", {
      "/": {
        status: 200,
        contentType: "text/html",
        body: "<html><body><p>This service books desks for teams that need a place to work today.</p><a href=\"/llms.txt\">Guide</a></body></html>",
      },
    }));
    const pageCheck = checkOf(page.checks, "static.summary");
    expect(pageCheck.status).toBe("pass");
    expect(pageCheck.staticSummary.saysWhatItIs).toBe(true);
    expect(pageCheck.staticSummary.pointers).toContain("/llms.txt");
    expect(pageCheck.reason).toContain("Says what the product is");
  });

  it("uses a conservative discovery share and does not rescore an unprobed homepage", () => {
    const scoreSource = readFileSync(join(here, "../../lib/agent-readiness/score.js"), "utf8");
    expect(scoreSource).toContain("conservative");
    expect(scoreSource).toContain("not-probed");
    const base = {
      schema: "agent-readiness.probe.v1",
      host: "fixture.example",
      probedAt: "2026-09-24T09:00:00Z",
      responses: {
        "/llms.txt": { status: 404 },
        "/skill.md": { status: 404 },
        "/openapi.json": { status: 404 },
        "/.well-known/agent-card.json": { status: 404 },
        "/.well-known/x402": { status: 404 },
        "/mcp": { status: 404 },
        "/robots.txt": { status: 404 },
      },
    };
    const unprobed = buildReport(base, "2026-09-24T09:00:00Z").score;
    const shell = buildReport({
      ...base,
      responses: {
        ...base.responses,
        "/": { status: 200, contentType: "text/html", body: "<html><script>app()</script></html>" },
      },
    }, "2026-09-24T09:00:00Z").score;
    const described = buildReport({
      ...base,
      responses: {
        ...base.responses,
        "/": {
          status: 200,
          contentType: "text/html",
          body: "<html><body><p>This service books desks for teams that need a place to work today.</p><a href=\"/openapi.json\">API</a></body></html>",
        },
      },
    }, "2026-09-24T09:00:00Z").score;
    expect(unprobed).toBe(2);
    expect(described).toBeGreaterThan(shell);
    expect(described - shell).toBeLessThanOrEqual(4);
    expect(Math.abs(described - unprobed)).toBeLessThanOrEqual(4);
    expect(Math.abs(shell - unprobed)).toBeLessThanOrEqual(4);
  });
});
