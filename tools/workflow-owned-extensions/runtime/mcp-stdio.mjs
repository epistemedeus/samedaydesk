#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeLocalJob } from "../src/local-job.mjs";
import { decodeMessages, encodeMessage } from "../src/mcp-framing.mjs";
import { PACKAGE_VERSION, TOOLS } from "../src/pins.mjs";

const SUPPORTED_PROTOCOLS = new Set(["2024-11-05", "2025-11-25"]);
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

const decoderInput = [];
process.stdin.on("data", (chunk) => decoderInput.push(chunk));
process.stdin.on("end", () => {
  const raw = Buffer.concat(decoderInput);
  let messages = [];
  try {
    messages = raw.length === 0 ? [] : decodeMessages(raw);
  } catch (error) {
    respond({ jsonrpc: "2.0", id: null, error: { code: -32700, message: error.message } });
    process.exit(1);
  }
  if (raw.length > 0 && messages.length === 0) {
    respond({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "mcp frame is missing Content-Length" },
    });
    process.exit(1);
  }
  for (const message of messages) handle(message);
  process.exit(0);
});

function handle(message) {
  if (!message || typeof message !== "object") return;
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOLS.has(requested) ? requested : "2024-11-05";
    respond({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "samedaydesk-result-reuse", version: source?.version || PACKAGE_VERSION },
      },
    });
    return;
  }
  if (message.method === "tools/list") {
    respond({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: TOOLS.map(toolDescriptor) },
    });
    return;
  }
  if (message.method === "tools/call") {
    respond(callTool(message));
    return;
  }
  if (message.id != null) {
    respond({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "method is not supported by this MCP/CLI consumer" },
    });
  }
}

function callTool(message) {
  const name = message.params?.name;
  const args = message.params?.arguments || {};
  if (!TOOLS.includes(name)) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({
          ok: false,
          executionDeclaration: "unsupported_execution",
          message: "tool is not one of preview_reuse, export_reuse, or decide_or_reuse",
          published: false,
          pid: process.pid,
        }) }],
      },
    };
  }
  if (!source || source.consumer !== "mcp") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({
          ok: false,
          executionDeclaration: "unsupported_execution",
          selectedRuntime: { name: "mcp", ran: false, pid: null },
          message: "MCP/CLI prefix is not prepared",
          published: false,
          pid: process.pid,
        }) }],
      },
    };
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
  const result = executeLocalJob({ source, job, prefix: resolve(prefix) });
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: {
      isError: result.ok === false,
      content: [{ type: "text", text: JSON.stringify(result) }],
    },
  };
}

function toolDescriptor(name) {
  return {
    name,
    description: "SameDayDesk result-reuse. Committed installation status stays source_only_not_installed. Human publication is not performed.",
    inputSchema: {
      type: "object",
      properties: {
        input_json: {},
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

function respond(message) {
  process.stdout.write(encodeMessage(message));
}
