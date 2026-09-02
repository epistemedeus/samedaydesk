import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import mcpRouter from "../routes/mcp.js";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";

const IMPLEMENTED_PROTOCOL = "2024-11-05";
const APEX_SERVER_INFO = { name: "samedaydesk-agent-tools", version: "1.2.0" };
const EXPECTED_TOOL_NAMES = [
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
];
// Byte-semantic pins of the five-tool apex surface at base 1b24d3ec1555.
const FROZEN_TOOLS_BLOCK_SHA256 = "068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf";
const FROZEN_TOOLS_CALL_BLOCK_SHA256 = "e4d2728c9c556cd40f735bd7fe55f732fd270fae0fb7b4c2497ad6574faf35d9";

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
  const block = extractBlock(src, "const TOOLS = [", "const AI_CRAWLERS");
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

async function initialize(params, id = 1) {
  const { response, json } = await postMcp(rpcPayload("initialize", params, id));
  assert.equal(response.status, 200);
  assert.equal(json.jsonrpc, "2.0");
  assert.equal(json.id, id);
  assert.equal(json.error, undefined);
  assert.equal(json.result.protocolVersion, IMPLEMENTED_PROTOCOL);
  assert.deepEqual(json.result.serverInfo, APEX_SERVER_INFO);
  assert.deepEqual(json.result.capabilities, { tools: {} });
  return json;
}

test("MCP source implements only 2024-11-05 and does not echo offered versions", () => {
  assert.match(MCP_SOURCE, /const PROTOCOL_VERSION = "2024-11-05"/);
  assert.match(MCP_SOURCE, /protocolVersion:\s*PROTOCOL_VERSION/);
  assert.equal(MCP_SOURCE.includes("params?.protocolVersion || PROTOCOL_VERSION"), false);
  assert.equal(MCP_SOURCE.includes("2025-11-25"), false);
  assert.equal(MCP_SOURCE.includes("2026-07-28"), false);
  assert.equal(MCP_SOURCE.includes("2999-01-01"), false);
});

test("five tool definitions and tools/call handlers are byte-semantically unchanged", () => {
  const toolsBlock = extractBlock(MCP_SOURCE, "const TOOLS = [", "const AI_CRAWLERS");
  const callBlock = extractBlock(
    MCP_SOURCE,
    'case "tools/call":',
    "    default:\n      return id !== undefined ? errMsg",
  );
  assert.equal(sha256(toolsBlock), FROZEN_TOOLS_BLOCK_SHA256);
  assert.equal(sha256(callBlock), FROZEN_TOOLS_CALL_BLOCK_SHA256);

  const tools = toolsFromSource(MCP_SOURCE);
  assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOL_NAMES);
  assert.equal(tools.length, 5);
});

const initializeCases = [
  { name: "missing params", params: undefined },
  {
    name: "missing protocolVersion",
    params: { capabilities: {}, clientInfo: { name: "apex-mcp-gate", version: "0" } },
  },
  {
    name: "exact 2024-11-05",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "apex-mcp-gate", version: "0" },
    },
  },
  {
    name: "2025-11-25 fail closed",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "apex-mcp-gate", version: "0" },
    },
  },
  {
    name: "2026-07-28 fail closed",
    params: {
      protocolVersion: "2026-07-28",
      capabilities: {},
      clientInfo: { name: "apex-mcp-gate", version: "0" },
    },
  },
  {
    name: "2999-01-01 fail closed",
    params: {
      protocolVersion: "2999-01-01",
      capabilities: {},
      clientInfo: { name: "apex-mcp-gate", version: "0" },
    },
  },
];

for (const { name, params } of initializeCases) {
  test(`initialize ${name} returns ${IMPLEMENTED_PROTOCOL}`, async () => {
    await initialize(params);
  });
}

test("tools/list exposes the same five apex tools without tools/call", async () => {
  const { response, json } = await postMcp(rpcPayload("tools/list", {}, 7));
  assert.equal(response.status, 200);
  assert.equal(json.id, 7);
  assert.equal(json.error, undefined);
  const listed = json.result.tools;
  assert.deepEqual(listed.map((tool) => tool.name), EXPECTED_TOOL_NAMES);
  assert.deepEqual(listed, toolsFromSource(MCP_SOURCE));
  assert.equal(JSON.stringify(json).includes("tools/call"), false);
});
