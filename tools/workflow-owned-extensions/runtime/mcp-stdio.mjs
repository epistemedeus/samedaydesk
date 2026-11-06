#!/usr/bin/env node
// Dual-era MCP stdio server. Bytes are newline-delimited JSON-RPC.
// Legacy clients open with initialize (2024-10-07 through 2025-11-25).
// Modern clients open with server/discover and send 2026-07-28 on each request.
// stdout is protocol messages only. Logs go to stderr. Stdin EOF ends the process.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeLocalJob } from "../src/local-job.mjs";
import { createLineDecoder, encodeMessage } from "../src/mcp-framing.mjs";
import { PACKAGE_VERSION, TOOLS } from "../src/pins.mjs";

const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";

const prefixFlag = process.argv.indexOf("--prefix");
const prefix = prefixFlag === -1 ? "" : process.argv[prefixFlag + 1];

let source = null;
if (prefix && !prefix.startsWith("--")) {
  try {
    source = JSON.parse(readFileSync(resolve(prefix, "SOURCE.json"), "utf8"));
  } catch {
    source = null;
  }
}

const serverInfo = {
  name: "samedaydesk-result-reuse",
  version: source?.version || PACKAGE_VERSION,
};

console.error("samedaydesk-result-reuse listening on stdio");

const decoder = createLineDecoder();
let closed = false;

process.stdin.on("data", (chunk) => {
  if (closed) return;
  let messages;
  try {
    messages = decoder.push(chunk);
  } catch (error) {
    failParse(error);
    return;
  }
  for (const message of messages) handle(message);
});

process.stdin.on("end", () => {
  let messages = [];
  try {
    messages = decoder.end();
  } catch (error) {
    failParse(error);
    return;
  }
  for (const message of messages) handle(message);
  finish(0);
});

function handle(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    respond({
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32600, message: "request is not a JSON-RPC object" },
    });
    return;
  }
  if (message.id == null && typeof message.method === "string") {
    return;
  }
  if (message.method === "initialize") {
    respond(initialize(message));
    return;
  }
  if (message.method === "server/discover") {
    respond(discover(message));
    return;
  }
  const era = eraOf(message);
  if (era.error) {
    respond(era.error);
    return;
  }
  if (message.method === "tools/list") {
    respond(listTools(message, era.modern));
    return;
  }
  if (message.method === "tools/call") {
    respond(callTool(message, era.modern));
    return;
  }
  if (message.method === "ping") {
    respond(resultMessage(message, era.modern ? { resultType: "complete" } : {}));
    return;
  }
  if (message.id != null) {
    respond({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "method is not supported by this MCP stdio server" },
    });
  }
}

function initialize(message) {
  const requested = message.params?.protocolVersion;
  const protocolVersion = LEGACY_PROTOCOLS.includes(requested) ? requested : LEGACY_PROTOCOLS[0];
  return resultMessage(message, {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo,
    instructions: instructions(),
  });
}

function discover(message) {
  const era = eraOf(message, { requireModern: true });
  if (era.error) return era.error;
  return resultMessage(message, {
    resultType: "complete",
    supportedVersions: [MODERN_PROTOCOL],
    capabilities: { tools: {} },
    instructions: instructions(),
    ttlMs: 0,
    cacheScope: "private",
    _meta: { [SERVER_INFO_KEY]: serverInfo },
  });
}

function listTools(message, modern) {
  const result = { tools: TOOLS.map(toolDescriptor) };
  if (modern) {
    result.resultType = "complete";
    result.ttlMs = 0;
    result.cacheScope = "private";
    result._meta = { [SERVER_INFO_KEY]: serverInfo };
  }
  return resultMessage(message, result);
}

function callTool(message, modern) {
  const name = message.params?.name;
  const args = message.params?.arguments || {};
  if (!TOOLS.includes(name)) {
    return toolError(message, modern, {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: "tool is not one of preview_reuse, export_reuse, or decide_or_reuse",
      published: false,
      pid: process.pid,
    });
  }
  if (!source || source.consumer !== "mcp") {
    return toolError(message, modern, {
      ok: false,
      executionDeclaration: "unsupported_execution",
      selectedRuntime: { name: "mcp", ran: false, pid: null },
      message: "MCP stdio prefix is not prepared",
      published: false,
      pid: process.pid,
    });
  }
  const job = {
    consumer: args.consumer,
    tool: name,
    input: args.input_json ?? args.input,
    task_id: args.task_id,
    subject: args.subject,
    sequence: args.sequence,
    clock: args.clock,
    opt_in: args.opt_in,
    horizon: args.horizon,
    produced: args.produced,
    decision: args.decision,
    publish: args.publish === true,
    select: args.select,
    note: args.note,
  };
  let result;
  try {
    result = executeLocalJob({ source, job, prefix: resolve(prefix) });
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32603, message: error.message },
    };
  }
  const body = {
    isError: result.ok === false,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
  if (modern) {
    body.resultType = "complete";
    body._meta = { [SERVER_INFO_KEY]: serverInfo };
  }
  return resultMessage(message, body);
}

function toolError(message, modern, body) {
  const result = {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(body) }],
  };
  if (modern) result.resultType = "complete";
  return resultMessage(message, result);
}

function eraOf(message, { requireModern = false } = {}) {
  const meta = message?.params?._meta;
  const version = meta && typeof meta === "object" ? meta[PROTOCOL_VERSION_KEY] : undefined;
  if (requireModern && typeof version !== "string") {
    return { error: invalid(message, "modern request is missing io.modelcontextprotocol/protocolVersion") };
  }
  if (typeof version !== "string") return { modern: false };
  if (version !== MODERN_PROTOCOL) {
    return {
      error: {
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: {
          code: -32022,
          message: "Unsupported protocol version",
          data: { supported: [MODERN_PROTOCOL], requested: version },
        },
      },
    };
  }
  if (!meta || typeof meta[CLIENT_CAPABILITIES_KEY] !== "object" || meta[CLIENT_CAPABILITIES_KEY] == null) {
    return { error: invalid(message, "modern request is missing io.modelcontextprotocol/clientCapabilities") };
  }
  return { modern: true };
}

function resultMessage(message, result) {
  return { jsonrpc: "2.0", id: message.id, result };
}

function invalid(message, text) {
  return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32602, message: text } };
}

function instructions() {
  return "SameDayDesk result-reuse. Committed installation status stays source_only_not_installed. Human publication is not performed.";
}

function toolDescriptor(name) {
  return {
    name,
    description: "SameDayDesk result-reuse. Committed installation status stays source_only_not_installed. Human publication is not performed.",
    inputSchema: {
      type: "object",
      properties: {
        input_json: { type: "object" },
        task_id: { type: "string" },
        subject: { type: "string" },
        sequence: {},
        clock: { type: "string" },
        opt_in: { type: "boolean" },
        horizon: {},
        produced: {},
        decision: {},
        publish: { type: "boolean" },
      },
      required: ["input_json", "task_id", "subject", "sequence", "clock"],
    },
  };
}

function respond(message, exitCode) {
  process.stdout.write(encodeMessage(message));
  if (exitCode != null) finish(exitCode);
}

function failParse(error) {
  respond({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: error.message },
  }, 1);
}

function finish(code) {
  if (closed) return;
  closed = true;
  process.stdin.pause();
  process.stdout.write("", () => process.exit(code));
}
