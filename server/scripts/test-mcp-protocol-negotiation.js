import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import mcpRouter, { SUPPORTED_PROTOCOL_VERSIONS, negotiateProtocolVersion } from "../routes/mcp.js";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";

const LATEST_PROTOCOL = "2025-11-25";
const APEX_SERVER_INFO = { name: "samedaydesk-agent-tools", version: "1.2.0" };
const EXPECTED_ANNOTATIONS = {
  check_ai_readiness: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  generate_complete_fix_pack: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  plan_taskmarket_delegation: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  browse_taskmarket_tasks: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  track_taskmarket_task: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};
const EXPECTED_TOOL_NAMES = [
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
];
// Byte-semantic pin of the five-tool apex surface definitions.
const FROZEN_TOOLS_BLOCK_SHA256 = "444168f9278e735cc8755a332ae554b280a7dd9aa245545110d6385aa928b4ac";

const MCP_SOURCE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../routes/mcp.js");
const MCP_SOURCE = readFileSync(MCP_SOURCE_PATH, "utf8");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing start marker ${startMarker}`);
  assert.ok(end > start, `missing end marker ${endMarker}`);
  return src.slice(start, end);
}

function toolsFromSource(src) {
  const block = extractBlock(src, "const TOOLS = [", "const okMsg");
  const link = src.match(/const FIXPACK_LINK = "([^"]+)"/);
  assert.ok(link, "FIXPACK_LINK missing from MCP source");
  const load = new Function("FIXPACK_LINK", "MCP_TOOL_NAMES", `${block}\nreturn TOOLS;`);
  return load(link[1], MCP_TOOL_NAMES);
}

function rpcPayload(method, params, id = 1) {
  assert.notEqual(method, "tools/call", "this gate must not invoke tools/call");
  const msg = { jsonrpc: "2.0", id, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

let server;
let mcpUrl;

before(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/mcp", mcpRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function postMcp(body) {
  const encoded = JSON.stringify(body);
  assert.equal(encoded.includes('"tools/call"'), false, "request must not include tools/call");
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: encoded,
  });
  const json = await response.json();
  return { response, json };
}

async function initialize(params, expectedVersion, id = 1) {
  const { response, json } = await postMcp(rpcPayload("initialize", params, id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(json.jsonrpc, "2.0");
  assert.equal(json.id, id);
  assert.equal(json.error, undefined);
  assert.equal(json.result.protocolVersion, expectedVersion);
  assert.deepEqual(json.result.serverInfo, APEX_SERVER_INFO);
  assert.deepEqual(json.result.capabilities, { tools: {} });
  return json;
}

test("negotiation echoes only the four supported versions and otherwise returns the latest", () => {
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
  ]);
  assert.equal(negotiateProtocolVersion("2025-11-25"), "2025-11-25");
  assert.equal(negotiateProtocolVersion("2025-06-18"), "2025-06-18");
  assert.equal(negotiateProtocolVersion("2025-03-26"), "2025-03-26");
  assert.equal(negotiateProtocolVersion("2024-11-05"), "2024-11-05");
  assert.equal(negotiateProtocolVersion("2026-07-28"), LATEST_PROTOCOL);
  assert.equal(negotiateProtocolVersion("2999-01-01"), LATEST_PROTOCOL);
  assert.equal(negotiateProtocolVersion(undefined), LATEST_PROTOCOL);
  assert.equal(MCP_SOURCE.includes("params?.protocolVersion || "), false);
  assert.equal(MCP_SOURCE.includes("2026-07-28"), false);
  assert.equal(MCP_SOURCE.includes("2999-01-01"), false);
});

test("five apex tools remain listed; tools/call still serves readiness, Fix Pack, and TaskMarket", () => {
  const toolsBlock = extractBlock(MCP_SOURCE, "const TOOLS = [", "const okMsg");
  assert.equal(sha256(toolsBlock), FROZEN_TOOLS_BLOCK_SHA256);

  const callBlock = extractBlock(
    MCP_SOURCE,
    'case "tools/call":',
    "    default:\n      return id !== undefined ? errMsg",
  );
  assert.match(callBlock, /validateFixPackLicense/);
  assert.match(callBlock, /generateStarterFixPack/);
  assert.match(callBlock, /generateCompleteFixPack/);
  assert.match(callBlock, /check_ai_readiness/);
  assert.match(callBlock, /plan_taskmarket_delegation/);
  assert.equal(callBlock.includes("FIXPACK_MIN_CENTS"), false);
  assert.equal(callBlock.includes("amount_total || 0) >="), false);

  const tools = toolsFromSource(MCP_SOURCE);
  assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOL_NAMES);
  assert.equal(tools.length, 5);
});

const initializeCases = [
  { name: "missing params", params: undefined, expected: LATEST_PROTOCOL },
  {
    name: "missing protocolVersion",
    params: { capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: LATEST_PROTOCOL,
  },
  {
    name: "2025-11-25",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: "2025-11-25",
  },
  {
    name: "2025-06-18",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: "2025-06-18",
  },
  {
    name: "2025-03-26",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: "2025-03-26",
  },
  {
    name: "2024-11-05",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: "2024-11-05",
  },
  {
    name: "2026-07-28 rejected",
    params: { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: LATEST_PROTOCOL,
  },
  {
    name: "2999-01-01 rejected",
    params: { protocolVersion: "2999-01-01", capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
    expected: LATEST_PROTOCOL,
  },
];

for (const { name, params, expected } of initializeCases) {
  test(`initialize ${name} returns ${expected}`, async () => {
    const json = await initialize(params, expected);
    if (params?.protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)) {
      assert.notEqual(json.result.protocolVersion, params.protocolVersion);
    }
  });
}

test("a 2024-11-05-only client still lists five tools after initialize", async () => {
  await initialize({
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "legacy-2024-11-05", version: "1" },
  }, "2024-11-05", 11);
  const { response, json } = await postMcp(rpcPayload("tools/list", {}, 12));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(json.result.tools.map((tool) => tool.name), EXPECTED_TOOL_NAMES);
});

test("tools/list exposes annotations on all five tools", async () => {
  const { response, json } = await postMcp(rpcPayload("tools/list", {}, 7));
  assert.equal(response.status, 200);
  assert.equal(json.id, 7);
  assert.equal(json.error, undefined);
  const listed = json.result.tools;
  assert.deepEqual(listed.map((tool) => tool.name), EXPECTED_TOOL_NAMES);
  assert.deepEqual(listed, toolsFromSource(MCP_SOURCE));
  assert.equal(JSON.stringify(json).includes("tools/call"), false);
  for (const tool of listed) {
    assert.deepEqual(tool.annotations, EXPECTED_ANNOTATIONS[tool.name]);
    if (tool.name === "check_ai_readiness" || tool.name === "browse_taskmarket_tasks" || tool.name === "track_taskmarket_task") {
      assert.equal(tool.annotations.readOnlyHint, true);
    }
  }
  assert.equal(listed.find((tool) => tool.name === "plan_taskmarket_delegation").annotations.openWorldHint, false);
  assert.equal(listed.find((tool) => tool.name === "generate_complete_fix_pack").annotations.idempotentHint, true);
});

test("unknown tool is JSON-RPC -32602 and execution errors are isError results", async () => {
  const unknown = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "not_a_real_tool", arguments: {} } }),
  });
  const unknownJson = await unknown.json();
  assert.equal(unknown.status, 200);
  assert.equal(unknown.headers.get("access-control-allow-origin"), "*");
  assert.equal(unknownJson.error.code, -32602);
  assert.equal(unknownJson.result, undefined);

  const broken = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "plan_taskmarket_delegation", arguments: {} },
    }),
  });
  const brokenJson = await broken.json();
  assert.equal(broken.status, 200);
  assert.equal(brokenJson.error, undefined);
  assert.equal(brokenJson.result.isError, true);
  assert.match(brokenJson.result.content[0].text, /request is required/);
});

test("server.json names the unpublished apex remote and keeps CORS star", () => {
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), "../../server.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  assert.equal(registry.name, "io.github.epistemedeus/samedaydesk");
  assert.equal(registry.description.length <= 100, true);
  assert.deepEqual(registry.remotes, [{ type: "streamable-http", url: "https://samedaydesk.com/mcp" }]);
  assert.equal(JSON.stringify(registry).includes("registry.modelcontextprotocol.io"), false);
  assert.match(MCP_SOURCE, /"Access-Control-Allow-Origin": "\*"/);
});

test("seeded unsupported protocol is rejected instead of echoed", () => {
  const seeded = "1999-01-01";
  assert.equal(SUPPORTED_PROTOCOL_VERSIONS.includes(seeded), false);
  assert.equal(negotiateProtocolVersion(seeded), LATEST_PROTOCOL);
  assert.notEqual(negotiateProtocolVersion(seeded), seeded);
});
