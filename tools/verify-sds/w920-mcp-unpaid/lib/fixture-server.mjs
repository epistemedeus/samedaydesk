/**
 * Loopback Streamable-HTTP MCP fixture mirroring SDS apex /mcp five tools.
 * Pure node:http — no Express, works cold-clone offline without npm ci.
 * Serves GET banner + initialize + tools/list. tools/call returns a refuse
 * payload (never paid). GET/POST ?cs= is refused (Stripe license redirect).
 */
import http from "node:http";
import {
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  PAID_TOOL,
  WINDOW,
} from "./catalog.mjs";

const UNPAID_GET_BANNER =
  "samedaydesk agent tools MCP server (Streamable HTTP).\n" +
  'Add to a remote-MCP-capable client: { "mcpServers": { "samedaydesk": { "url": "https://samedaydesk.com/mcp" } } }\n' +
  "Tools: AI-readiness check and Fix Pack, plus free TaskMarket delegation planning, task browsing, and task tracking.\n" +
  `w920 unpaid fixture — POST JSON-RPC initialize / tools/list. Never send PAYMENT-SIGNATURE. Window ${WINDOW}.\n`;

const TOOL_DEFS = MCP_TOOLS.map((name) => ({
  name,
  description:
    name === PAID_TOOL
      ? "PAID. Complete AI-readiness Fix Pack. Requires Stripe checkout-session license (cs_). Fixture lists only — unpaid harness never calls."
      : `Free SDS apex tool: ${name}. Fixture mirror of https://samedaydesk.com/mcp.`,
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
      if (name === PAID_TOOL) {
        return okMsg(id, {
          content: [
            {
              type: "text",
              text: "FIXTURE_PAID_REFUSE: generate_complete_fix_pack requires Stripe license; unpaid harness must refuse before POST.",
            },
          ],
          isError: true,
        });
      }
      return okMsg(id, {
        content: [
          {
            type: "text",
            text: `FIXTURE_CALL_REFUSE: unpaid w920-mcp-unpaid harness does not execute tools/call (${name || "unknown"}).`,
          },
        ],
        isError: true,
      });
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

function writeCsRefuse(res) {
  res.writeHead(400, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      error: "STRIPE_PATH_REFUSE",
      message: "fixture refuses Stripe license query",
    }),
  );
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
    if (url.searchParams.has("cs") || /(?:^|[?&])cs=/.test(req.url || "")) {
      writeCsRefuse(res);
      return;
    }
    if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found; fixture mounts /mcp only" }));
      return;
    }

    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(UNPAID_GET_BANNER);
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
    const onErr = (err) => reject(err);
    server.once("error", onErr);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onErr);
      const addr = server.address();
      const origin = `http://127.0.0.1:${addr.port}`;
      resolve({
        origin,
        port: addr.port,
        url: `${origin}/mcp`,
        close: () =>
          new Promise((resClose, rej) => {
            server.close((err) => (err ? rej(err) : resClose()));
          }),
      });
    });
  });
}

export { TOOL_DEFS, UNPAID_GET_BANNER };
