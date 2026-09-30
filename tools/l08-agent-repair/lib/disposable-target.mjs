// Loopback-only MCP target. The defect and the repair both live here.
// broken: unknown tools/call returns a JSON-RPC result with isError.
// fixed: the same call returns JSON-RPC error -32602 and no result.
import http from "node:http";
import { LATEST_MCP_VERSION } from "../../../server/lib/agent-readiness/checks.js";
import { UNKNOWN_TOOL_NAME } from "../../../server/lib/agent-readiness/probe.js";

const TOOL = {
  name: "disposable_echo",
  description: "Echo one short note from a disposable loopback target so agents can read tools/list.",
  inputSchema: {
    type: "object",
    properties: {
      note: { type: "string", description: "Plain text the tool echoes." },
    },
    required: ["note"],
  },
  outputSchema: {
    type: "object",
    properties: {
      note: { type: "string", description: "The same text the caller sent." },
    },
    required: ["note"],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
};

export function llmsTxt(origin) {
  return [
    "# Disposable loopback target",
    "",
    "This host exists only so a repair run can reproduce one MCP defect.",
    `mcp-endpoint: ${origin}/mcp`,
    `openapi: ${origin}/openapi.json`,
    `agent-card: ${origin}/.well-known/agent-card.json`,
    "",
  ].join("\n");
}

export function handleMcpMessage(msg, mode) {
  const id = msg && Object.prototype.hasOwnProperty.call(msg, "id") ? msg.id : null;
  const method = msg?.method;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: LATEST_MCP_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "l08-disposable-target", version: "0" },
      },
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: [TOOL] } };
  }
  if (method === "tools/call") {
    const name = msg?.params?.name;
    if (name === TOOL.name) {
      const note = typeof msg?.params?.arguments?.note === "string" ? msg.params.arguments.note : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: note }],
          structuredContent: { note },
        },
      };
    }
    if (mode === "fixed") {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${name ?? ""}` },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        isError: true,
        content: [{ type: "text", text: "unknown tool" }],
      },
    };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method ?? ""}` } };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

export async function startDisposableTarget(mode = "broken") {
  if (mode !== "broken" && mode !== "fixed") throw new Error("mode must be broken or fixed");
  let current = mode;
  const server = http.createServer((req, res) => {
    const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.method === "GET" && path === "/llms.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(llmsTxt(origin));
      return;
    }
    if (req.method === "GET" && path === "/mcp") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("disposable mcp\n");
      return;
    }
    if (req.method === "POST" && path === "/mcp") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        let msg = {};
        try {
          msg = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          msg = {};
        }
        // The protocol-version header is intentionally ignored in both modes.
        // That edge is researched, not repaired, on this target.
        const body = handleMcpMessage(msg, current);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found\n");
  });
  await listen(server);
  return {
    server,
    unknownToolName: UNKNOWN_TOOL_NAME,
    get mode() {
      return current;
    },
    setMode(next) {
      if (next !== "broken" && next !== "fixed") throw new Error("mode must be broken or fixed");
      current = next;
    },
    get origin() {
      return `http://127.0.0.1:${server.address().port}`;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
