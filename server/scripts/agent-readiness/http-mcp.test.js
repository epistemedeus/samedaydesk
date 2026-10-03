import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { createSdsApp } from "../../app.js";
import { apexAgentCard } from "../../lib/apex-agent-card.js";
import { MCP_TOOL_NAMES } from "../../lib/mcp-tool-inventory.js";
import { resetRateLimits } from "../../lib/agent-readiness/rate-limit.js";
import { createAgentReadinessRouter } from "../../routes/agent-readiness.js";
import { APEX_TOOLS } from "../../../tools/verify/lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

async function get(port, path, headers) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

test("MCP, the agent card and verifier share the current inventory; discovery documents link to their interfaces", async () => {
  assert.deepEqual([...APEX_TOOLS], [...MCP_TOOL_NAMES]);
  const card = apexAgentCard();
  assert.deepEqual(card.skills.map((skill) => skill.id), [...MCP_TOOL_NAMES]);
  assert.equal(card.skills.some((skill) => skill.id === "check_agent_readiness"), true);
  const llms = readFileSync(join(repo, "client/public/llms.txt"), "utf8");
  const sitemap = readFileSync(join(repo, "client/public/sitemap.xml"), "utf8");
  // llms.txt describes interfaces and points readers to live MCP inventory.
  // It does not freeze literal machine names into human copy.
  assert.match(llms, /\(https:\/\/samedaydesk\.com\/mcp\)/);
  assert.match(llms, /\(https:\/\/samedaydesk\.com\/for-agents\)/);
  assert.match(sitemap, /<loc>https:\/\/samedaydesk\.com\/llms\.txt<\/loc>/);
  const server = http.createServer(createSdsApp());
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 379, method: "tools/list", params: {} }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).result.tools.map(tool => tool.name), [...MCP_TOOL_NAMES]);
  } finally { await close(server); }
});

test("the page renders the score, the check table, the top fixes, and the fix pack", async () => {
  const payload = {
    host: "fixture.example",
    score: 42,
    probedAt: "2026-09-26T00:00:00Z",
    categories: [{ id: "mcp", label: "MCP", weight: 20, points: 4 }],
    checks: [{
      id: "mcp.initialize",
      title: "MCP initialize succeeds",
      status: "fail",
      reason: "No MCP server.",
      fix: "Expose /mcp.",
      evidenceUrl: "https://fixture.example/mcp",
    }],
    topFixes: [
      { title: "MCP initialize succeeds", fix: "Expose /mcp." },
      { title: "llms.txt published", fix: "Publish /llms.txt." },
      { title: "Agent card", fix: "Publish an agent card." },
    ],
    wwwFallback: null,
  };
  const app = express();
  app.use("/agent-readiness", createAgentReadinessRouter({
    run: async () => ({ payload, fixPack: "# Agent Fix Pack for fixture.example\n\nNothing invented.\n" }),
  }));
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const page = await get(port, "/agent-readiness?host=fixture.example");
    assert.equal(page.status, 200);
    assert.match(page.text, /fixture\.example scored 42/);
    assert.match(page.text, /MCP initialize succeeds/);
    assert.match(page.text, /Expose \/mcp\./);
    assert.match(page.text, /Publish \/llms\.txt\./);
    assert.match(page.text, /Publish an agent card\./);
    assert.match(page.text, /format=fix-pack/);
    assert.match(page.text, /https:\/\/fixture\.example\/mcp/);

    const json = await get(port, "/agent-readiness?host=fixture.example&format=json");
    assert.equal(json.status, 200);
    assert.match(json.headers.get("content-type"), /json/);
    const body = JSON.parse(json.text);
    assert.equal(body.score, 42);
    assert.equal(body.checks[0].evidenceUrl, "https://fixture.example/mcp");
    assert.equal(body.free, undefined);

    const pack = await get(port, "/agent-readiness?host=fixture.example&format=fix-pack");
    assert.equal(pack.status, 200);
    assert.match(pack.headers.get("content-disposition") || "", /agent-readiness-fixture\.example-fix-pack\.md/);
    assert.match(pack.text, /Nothing invented/);
  } finally {
    await close(server);
  }
});

test("seeded private host is rejected by the page and the MCP tool", async () => {
  resetRateLimits();
  process.env.AGENT_READINESS_RATE_LIMIT = "20";
  let hits = 0;
  const bait = http.createServer((_req, res) => {
    hits += 1;
    res.end("secret");
  });
  const baitPort = await listen(bait);
  const app = createSdsApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const page = await get(port, `/agent-readiness?host=${encodeURIComponent(`127.0.0.1:${baitPort}`)}&format=json`);
    assert.equal(page.status, 400);
    assert.match(page.text, /not a public address/);
    assert.equal(hits, 0);

    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "check_agent_readiness", arguments: { host: `127.0.0.1:${baitPort}` } },
      }),
    });
    const body = await mcp.json();
    assert.equal(body.error, undefined);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /not a public address/);
    assert.equal(body.result.structuredContent, undefined);
    assert.equal(hits, 0);

    const listed = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const tools = (await listed.json()).result.tools;
    assert.deepEqual(tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
    const agent = tools.find((tool) => tool.name === "check_agent_readiness");
    assert.equal(agent.annotations.readOnlyHint, true);
    assert.equal(agent.annotations.destructiveHint, false);
    assert.deepEqual(agent.outputSchema.required, ["host", "score", "checks", "topFixes", "evidence"]);
    assert.equal(agent.description.includes("license"), true);
    assert.equal(/^PAID\./.test(agent.description), false);
    const neighbor = tools.map((tool) => tool.name);
    assert.equal(neighbor[0], "check_ai_readiness");
    assert.equal(neighbor[1], "check_agent_readiness");

    const unknown = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "real_tool_not_on_the_server", arguments: {} },
      }),
    });
    const unknownBody = await unknown.json();
    assert.equal(unknownBody.error.code, -32602);
    assert.equal(hits, 0);
  } finally {
    await close(server);
    await close(bait);
    resetRateLimits();
  }
});

test("the page rate limit rejects the next check from the same client", async () => {
  resetRateLimits();
  process.env.AGENT_READINESS_RATE_LIMIT = "2";
  const app = createSdsApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const first = await get(port, "/agent-readiness?host=127.0.0.1&format=json");
    const second = await get(port, "/agent-readiness?host=10.0.0.1&format=json");
    const third = await get(port, "/agent-readiness?host=192.168.0.1&format=json");
    assert.equal(first.status, 400);
    assert.equal(second.status, 400);
    assert.equal(third.status, 429);
    assert.match(third.text, /Too many checks/);
    assert.ok(Number(third.headers.get("retry-after")) >= 1);
  } finally {
    await close(server);
    delete process.env.AGENT_READINESS_RATE_LIMIT;
    resetRateLimits();
  }
});
