import http from "node:http";
import { describe, expect, it } from "./expect-shim.js";
import { runChecks } from "../../lib/agent-readiness/checks.js";
import { DEMO_BUNDLES } from "../../lib/agent-readiness/demo.js";
import { rawExchange } from "../../lib/agent-readiness/probe.js";
import { buildReport } from "../../lib/agent-readiness/score.js";

const PUBLISH_OPENAPI = "Serve a valid JSON OpenAPI document at /openapi.json.";
const ABSENT_OPENAPI = "No OpenAPI document at /openapi.json or /.well-known/openapi.json.";
const PUBLISH_SKILL = "Publish /skill.md with step by step instructions an agent can follow to use the site.";
const PUBLISH_CATALOG = "Publish an RFC 9727 linkset at /.well-known/api-catalog listing every machine surface.";
const CHALLENGE_HTML = "<!doctype html><html><head><title>Just a moment...</title></head><body>Checking your browser. challenge-platform</body></html>";
const VALID_DOC = {
  openapi: "3.1.0",
  info: { title: "Caller API", version: "1.0.0" },
  paths: {
    "/ping": {
      get: {
        operationId: "ping",
        summary: "Ping",
        security: [],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

function bundle(responses) {
  return {
    schema: "agent-readiness.probe.v1",
    host: "fixture.example",
    probedAt: "2026-09-24T09:00:00Z",
    responses: {
      "/llms.txt": { status: 404 },
      "/skill.md": { status: 404 },
      "/openapi.json": { status: 404 },
      "/.well-known/openapi.json": { status: 404 },
      "/.well-known/agent-card.json": { status: 404 },
      "/.well-known/agent.json": { status: 404 },
      "/.well-known/api-catalog": { status: 404 },
      "/.well-known/x402": { status: 404 },
      "/mcp": { status: 404 },
      "/robots.txt": { status: 404 },
      ...responses,
    },
  };
}

function check(report, id) {
  const found = report.checks.find((item) => item.id === id);
  if (!found) throw new Error(`missing check ${id}`);
  return found;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

describe("document retrieval diagnosis", () => {
  it("keeps a genuine 404 as absence, with the existing publish action and score", () => {
    const report = buildReport(bundle(), "2026-09-24T09:00:00Z");
    expect(report.score).toBe(2);
    expect(check(report, "openapi.parses").reason).toBe(ABSENT_OPENAPI);
    expect(check(report, "openapi.parses").fix).toBe(PUBLISH_OPENAPI);
    expect(check(report, "openapi.version").status).toBe("na");
    expect(check(report, "discovery.skill").reason).toBe("/skill.md returned 404.");
    expect(check(report, "discovery.skill").fix).toBe(PUBLISH_SKILL);
    expect(check(report, "apiCatalog.present").reason).toBe("/.well-known/api-catalog returned 404.");
    expect(check(report, "apiCatalog.present").fix).toBe(PUBLISH_CATALOG);
    expect(check(report, "discovery.llms").reason).toBe("/llms.txt returned 404.");
    expect(check(report, "x402.parses").reason).toBe("/.well-known/x402 returned 404.");
    expect(check(report, "agentCard.present").reason).toBe("No agent card at /.well-known/agent-card.json or /.well-known/agent.json.");
    expect(check(report, "mcp.initialize").reason).toBe("No MCP server (/mcp returned 404).");
  });

  it("passes a valid OpenAPI document and does not ask the caller to publish it", () => {
    const report = buildReport(bundle({
      "/openapi.json": { status: 200, contentType: "application/json", body: JSON.stringify(VALID_DOC) },
    }), "2026-09-24T09:00:00Z");
    expect(check(report, "openapi.parses").status).toBe("pass");
    expect(check(report, "openapi.parses").reason).toBe("/openapi.json parsed as JSON.");
    expect(check(report, "openapi.version").status).toBe("pass");
  });

  it("rejects a seeded HTTP 403 challenge misread as a missing document", () => {
    const challenge = {
      status: 403,
      contentType: "text/html; charset=utf-8",
      headers: { "content-type": "text/html; charset=utf-8", server: "hcdn" },
      body: CHALLENGE_HTML,
    };
    const report = buildReport(bundle({
      "/openapi.json": challenge,
      "/.well-known/openapi.json": { status: 404 },
      "/skill.md": challenge,
      "/.well-known/api-catalog": challenge,
      "/llms.txt": { status: 200, contentType: "text/plain", body: "Use the API at https://fixture.example/openapi.json\nMCP: https://fixture.example/mcp\n" },
    }), "2026-09-24T09:00:00Z");
    const openapi = check(report, "openapi.parses");
    const skill = check(report, "discovery.skill");
    const catalog = check(report, "apiCatalog.present");
    expect(openapi.status).toBe("fail");
    expect(openapi.reason).not.toMatch(/No OpenAPI document/);
    expect(openapi.reason).toMatch(/403/);
    expect(openapi.reason).toMatch(/challenge/);
    expect(openapi.reason).toMatch(/not evidence it is absent or invalid/);
    expect(openapi.fix).not.toBe(PUBLISH_OPENAPI);
    expect(skill.status).toBe("fail");
    expect(skill.reason).not.toBe("/skill.md returned 403.");
    expect(skill.fix).not.toBe(PUBLISH_SKILL);
    expect(catalog.status).toBe("fail");
    expect(catalog.fix).not.toBe(PUBLISH_CATALOG);
    expect(check(report, "discovery.llms").status).toBe("pass");
    expect(check(report, "openapi.version").reason).toMatch(/not read/);
    expect(report.topFixes.some((fix) => fix.fix === PUBLISH_OPENAPI)).toBe(false);
  });

  it("distinguishes invalid JSON from a wrong content type and from a bad schema", () => {
    const invalid = buildReport(bundle({
      "/openapi.json": { status: 200, contentType: "application/json", body: "{\"openapi\":" },
    }), "2026-09-24T09:00:00Z");
    expect(check(invalid, "openapi.parses").status).toBe("fail");
    expect(check(invalid, "openapi.parses").reason).toMatch(/not valid JSON/);
    expect(check(invalid, "openapi.parses").reason).not.toMatch(/No OpenAPI document/);

    const wrongType = buildReport(bundle({
      "/openapi.json": { status: 200, contentType: "text/html", body: "<html><body>pricing</body></html>" },
    }), "2026-09-24T09:00:00Z");
    expect(check(wrongType, "openapi.parses").status).toBe("fail");
    expect(check(wrongType, "openapi.parses").reason).toMatch(/text\/html/);
    expect(check(wrongType, "openapi.parses").reason).not.toMatch(/not valid JSON/);
    expect(check(wrongType, "openapi.parses").reason).not.toMatch(/No OpenAPI document/);

    const badSchema = buildReport(bundle({
      "/openapi.json": { status: 200, contentType: "application/json", body: "[1, 2, 3]" },
    }), "2026-09-24T09:00:00Z");
    expect(check(badSchema, "openapi.parses").status).toBe("fail");
    expect(check(badSchema, "openapi.parses").reason).toMatch(/not a JSON object/);
    expect(check(badSchema, "openapi.version").status).toBe("na");
  });

  it("calls a budget-limited body and a timeout a retrieval limit, not an invalid or missing file", () => {
    const cut = buildReport(bundle({
      "/openapi.json": {
        status: 200,
        contentType: "application/json",
        body: "{\"openapi\":",
        truncated: true,
      },
    }), "2026-09-24T09:00:00Z");
    expect(check(cut, "openapi.parses").reason).toMatch(/probe body budget/);
    expect(check(cut, "openapi.parses").reason).not.toMatch(/not valid JSON|No OpenAPI document/);
    expect(check(cut, "openapi.parses").fix).toMatch(/partial body/);

    const timedOut = buildReport(bundle({
      "/skill.md": { status: 0, error: "timeout" },
      "/openapi.json": { status: 0, error: "timeout" },
      "/.well-known/openapi.json": { status: 404 },
    }), "2026-09-24T09:00:00Z");
    expect(check(timedOut, "discovery.skill").reason).toMatch(/timed out/);
    expect(check(timedOut, "discovery.skill").fix).not.toBe(PUBLISH_SKILL);
    expect(check(timedOut, "openapi.parses").reason).toMatch(/timed out/);
    expect(check(timedOut, "openapi.parses").reason).not.toMatch(/No OpenAPI document/);
  });

  it("keeps a useful partial result and changes the diagnosis when the refused document is corrected", () => {
    const refused = bundle({
      "/llms.txt": { status: 200, contentType: "text/plain", body: "# Desk\n\nhttps://fixture.example/openapi.json and https://fixture.example/mcp\n" },
      "/skill.md": { status: 404 },
      "/openapi.json": { status: 403, contentType: "text/html", body: CHALLENGE_HTML },
    });
    const before = buildReport(refused, "2026-09-24T09:00:00Z");
    expect(check(before, "discovery.llms").status).toBe("pass");
    expect(check(before, "discovery.skill").reason).toBe("/skill.md returned 404.");
    expect(check(before, "openapi.parses").reason).toMatch(/refused/);

    const corrected = bundle({
      ...refused.responses,
      "/openapi.json": { status: 200, contentType: "application/json", body: JSON.stringify(VALID_DOC) },
    });
    const after = buildReport(corrected, "2026-09-24T09:00:00Z");
    expect(check(after, "openapi.parses").status).toBe("pass");
    expect(check(after, "openapi.parses").reason).not.toMatch(/refused|challenge/);
    expect(check(after, "discovery.skill").reason).toBe(check(before, "discovery.skill").reason);
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("does not call a later 403 absence when the first OpenAPI path is a real 404", () => {
    const report = buildReport(bundle({
      "/openapi.json": { status: 404, contentType: "text/plain", body: "Not found\n" },
      "/.well-known/openapi.json": { status: 403, contentType: "text/html", body: CHALLENGE_HTML },
    }), "2026-09-24T09:00:00Z");
    expect(check(report, "openapi.parses").reason).not.toMatch(/No OpenAPI document/);
    expect(check(report, "openapi.parses").reason).toMatch(/\.well-known\/openapi\.json/);
    expect(check(report, "openapi.parses").reason).toMatch(/challenge/);
  });

  it("treats a JSON 403 as a refusal without calling it a challenge page or a missing file", () => {
    const report = buildReport(bundle({
      "/skill.md": { status: 403, contentType: "application/json", body: "{\"error\":\"forbidden\"}" },
    }), "2026-09-24T09:00:00Z");
    const skill = check(report, "discovery.skill");
    expect(skill.status).toBe("fail");
    expect(skill.reason).toMatch(/HTTP 403/);
    expect(skill.reason).not.toMatch(/challenge/);
    expect(skill.fix).not.toBe(PUBLISH_SKILL);
  });

  it("does not let a challenged alternate path hide a valid document", () => {
    const report = buildReport(bundle({
      "/openapi.json": { status: 403, contentType: "text/html", body: CHALLENGE_HTML },
      "/.well-known/openapi.json": { status: 200, contentType: "application/json", body: JSON.stringify(VALID_DOC) },
    }), "2026-09-24T09:00:00Z");
    expect(check(report, "openapi.parses").status).toBe("pass");
    expect(check(report, "openapi.parses").reason).toBe("/.well-known/openapi.json parsed as JSON.");
  });

  it("leaves the demo bundle scores unchanged", () => {
    const scores = Object.fromEntries(DEMO_BUNDLES.map((item) => [item.host, buildReport(item, "2026-09-24T09:00:00Z").score]));
    expect(scores).toEqual({
      "ein.llc": 44,
      "samedaydesk.com": 43,
      "agents.samedaydesk.com": 78,
      "neomorphic.io": 49,
    });
  });
});

describe("probe records retrieval limits", () => {
  it("marks a body that exceeds the byte budget and a hung response as timeout", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/hang") return;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"openapi":"${"x".repeat(4000)}"}`);
    });
    const port = await listen(server);
    try {
      const cut = await rawExchange(new URL(`http://127.0.0.1:${port}/doc`), {
        method: "GET",
        address: { address: "127.0.0.1", family: 4 },
        maxBytes: 64,
        timeoutMs: 1000,
      });
      expect(cut.status).toBe(200);
      expect(cut.truncated).toBe(true);
      expect(Buffer.byteLength(cut.body)).toBe(64);

      const hung = await rawExchange(new URL(`http://127.0.0.1:${port}/hang`), {
        method: "GET",
        address: { address: "127.0.0.1", family: 4 },
        timeoutMs: 100,
      });
      expect(hung.status).toBe(0);
      expect(hung.error).toBe("timeout");
      expect(hung.body).toBe("");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("feeds the probe's truncated flag into the report instead of an invalid-JSON finding", async () => {
    const { probeHost } = await import("../../lib/agent-readiness/probe.js");
    const probed = await probeHost("public.example", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      rawExchange(url) {
        const path = new URL(url).pathname;
        if (path === "/openapi.json") {
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: "{\"openapi\":",
            truncated: true,
          };
        }
        return { status: 404, headers: { "content-type": "text/plain" }, body: "Not found\n" };
      },
    });
    expect(probed.responses["/openapi.json"].truncated).toBe(true);
    const report = buildReport(probed, "2026-09-24T09:00:00Z");
    expect(check(report, "openapi.parses").reason).toMatch(/probe body budget/);
    const { checks } = runChecks(probed);
    expect(checks.find((item) => item.id === "openapi.parses").reason).not.toMatch(/No OpenAPI document/);
  });
});
