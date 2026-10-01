import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import { createSdsApp } from "../app.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function post(origin, path, body, headers = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text };
}

test("existing host keeps its routes and distinguishes compiled repair from deployment", async () => {
  const app = createSdsApp();
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "samedaydesk");

    const correspondence = await fetch(`${origin}/api/correspondence/healthz`);
    assert.equal(correspondence.status, 200);
    assert.deepEqual(await correspondence.json(), { ok: false, enabled: false, reason: "unconfigured" });

    const missing = await fetch(`${origin}/api/not-a-route`);
    assert.equal(missing.status, 404);

    const readiness = await fetch(`${origin}/api/public-readiness/healthz`);
    const readinessJson = await readiness.json();
    assert.equal(readiness.status, 200);
    assert.equal(readinessJson.enabled, true);
    assert.equal(readinessJson.privateGitRequired, false);
    assert.equal(readinessJson.compiledRepair.scope, "this-process");
    assert.equal(readinessJson.compiledRepair.unsupportedStatus, 400);
    assert.equal(readinessJson.compiledRepair.unsupportedCode, -32000);
    assert.equal(readinessJson.compiledRepair.missingHeader, "accepted");
    assert.equal(readinessJson.publicDeployment.activated, false);
    assert.equal(readinessJson.publicDeployment.readback, null);

    const initialize = await post(origin, "/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "mount", version: "0" } },
    }, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(initialize.status, 200);
    assert.equal(initialize.json.result.protocolVersion, "2025-11-25");

    const tools = await post(origin, "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { "mcp-protocol-version": "2025-11-25" });
    assert.equal(tools.status, 200);
    assert.deepEqual(tools.json.result.tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);

    const missingHeader = await post(origin, "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
    assert.equal(missingHeader.status, 200);
    assert.equal(missingHeader.json.result.tools.length, MCP_TOOL_NAMES.length);

    const unsupported = await post(origin, "/mcp", { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.json.error.code, -32000);
    assert.equal(unsupported.json.result, undefined);

    const call = await post(origin, "/mcp", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "plan_taskmarket_delegation",
        arguments: {
          request: "Describe the public readiness boundary",
          deliverable: "One paragraph",
          reward_usdc: "0.10",
          max_spend_usdc: "0.10",
          deadline_hours: 24,
        },
      },
    }, { "mcp-protocol-version": "2025-06-18" });
    assert.equal(call.status, 200);
    assert.equal(call.json.result.isError, undefined);
    assert.equal(typeof call.json.result.structuredContent, "object");

    const callBad = await post(origin, "/mcp", {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "plan_taskmarket_delegation", arguments: {} },
    }, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(callBad.status, 400);
    assert.equal(callBad.json.error.code, -32000);

    const unknown = await post(origin, "/mcp", {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "__definitely_not_a_tool__", arguments: {} },
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.json.error.code, -32602);

    const page = await fetch(`${origin}/mcp`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /samedaydesk agent tools MCP server/);

    const defect = await post(origin, "/api/public-readiness/catalog-row", { fixture: "catalog-row-repair-add-required.json" });
    assert.equal(defect.status, 200);
    assert.equal(defect.json.exit, 1);
    assert.equal(defect.json.decision.ok, false);
    assert.equal(defect.json.decision.repairComplete, false);
    assert.equal(defect.json.publicDeployment.activated, false);
    assert.deepEqual(defect.json.decision.findings, ["seller_response_required_path_missing:data.quote"]);

    const changed = await post(origin, "/api/public-readiness/catalog-row", { fixture: "catalog-row-repair-complete.json" });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.exit, 0);
    assert.equal(changed.json.decision.ok, true);
    assert.equal(changed.json.decision.repairComplete, true);
    assert.equal(changed.json.compiledRepair.scope, "this-process");
    assert.equal(changed.json.publicDeployment.activated, false);

    const hostile = await post(origin, "/api/public-readiness/catalog-row", { fixture: "../integrity.mjs" });
    assert.equal(hostile.status, 400);
    assert.equal(hostile.json.error.code, "fixture_refused");
    const url = await post(origin, "/api/public-readiness/catalog-row", { fixture: "http://169.254.169.254/latest" });
    assert.equal(url.status, 400);

    const oversized = await fetch(`${origin}/api/public-readiness/catalog-row`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"fixture":"${"x".repeat(1_500_000)}"}`,
    });
    assert.equal(oversized.status, 413);
  } finally {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await close(server);
  }
});
