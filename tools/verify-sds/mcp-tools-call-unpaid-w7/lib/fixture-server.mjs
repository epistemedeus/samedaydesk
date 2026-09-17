/**
 * Loopback Streamable-HTTP MCP fixture for unpaid tools/call → isError (w7).
 * Pure node:http — no Express, works cold-clone offline without npm ci.
 * Free-tool tools/call returns CallToolResult { isError: true, content: [...] }.
 * Paid tool is never reached by the unpaid client (PAID_REFUSE before POST);
 * if somehow called, fixture still returns isError without payment.
 */
import http from "node:http";
import {
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  PAID_TOOL,
  FREE_TOOLS,
} from "./catalog.mjs";

const TOOL_DEFS = MCP_TOOLS.map((name) => ({
  name,
  description:
    name === PAID_TOOL
      ? "PAID. Complete AI-readiness Fix Pack. Requires Stripe checkout-session license (cs_). Unpaid w7 harness never POSTs this tool."
      : `Free SDS apex tool: ${name}. Fixture returns unpaid isError CallToolResult for tools/call demo.`,
  inputSchema: {
    type: "object",
    properties:
      name === "track_taskmarket_task"
        ? { task_id: { type: "string" } }
        : name.startsWith("plan_") || name.startsWith("browse_")
          ? { request: { type: "string" } }
          : { url: { type: "string" } },
  },
}));

function okMsg(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errMsg(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function unpaidIsErrorResult(name) {
  const unpaidNote =
    name === PAID_TOOL
      ? `FIXTURE_PAID_ISERROR: ${PAID_TOOL} requires Stripe license; unpaid harness must refuse before POST. isError shape documented only.`
      : `FIXTURE_UNPAID_ISERROR: unpaid tools/call of ${name} returns MCP CallToolResult.isError=true without payment. Never send PAYMENT-SIGNATURE.`;
  return {
    content: [
      {
        type: "text",
        text: unpaidNote,
      },
    ],
    isError: true,
  };
}

function handleRpc(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { ...MCP_SERVER_INFO },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return okMsg(id, {});
    case "tools/list":
      return okMsg(id, { tools: TOOL_DEFS });
    case "tools/call": {
      const name = params?.name;
      // Always return isError shape for unpaid demo — never execute paid work.
      return okMsg(id, unpaidIsErrorResult(name || "unknown"));
    }
    default:
      return id !== undefined ? errMsg(id, -32601, `Method not found: ${method}`) : null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Start loopback fixture. Returns { origin, port, url, close }.
 */
export function startFixtureServer({ port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found; fixture mounts /mcp only" }));
      return;
    }

    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        "samedaydesk mcp-tools-call-unpaid-w7 fixture (loopback).\n" +
          "POST JSON-RPC initialize / tools/call (free tools → isError). Never send PAYMENT-SIGNATURE.\n" +
          `Free tools: ${FREE_TOOLS.join(", ")}\n`,
      );
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "text/plain" });
      res.end("POST only");
      return;
    }

    const forbiddenHit = ["payment-signature", "x-payment", "stripe-signature"].find(
      (h) => req.headers[h] != null,
    );
    if (forbiddenHit) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "PAYMENT_HEADER_REFUSE",
          header: forbiddenHit,
          message: "fixture refuses payment headers",
        }),
      );
      return;
    }

    let body;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : null;
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify(errMsg(null, -32700, `parse error: ${e.message}`)));
      return;
    }

    try {
      if (Array.isArray(body)) {
        const out = body.map(handleRpc).filter(Boolean);
        res.writeHead(out.length ? 200 : 202, { "content-type": "application/json" });
        if (out.length) res.end(JSON.stringify(out));
        else res.end();
        return;
      }
      const out = handleRpc(body);
      if (!out) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify(errMsg(body?.id ?? null, -32603, e.message)));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const origin = `http://127.0.0.1:${addr.port}`;
      resolve({
        origin,
        port: addr.port,
        url: `${origin}/mcp`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

export { TOOL_DEFS, unpaidIsErrorResult };
