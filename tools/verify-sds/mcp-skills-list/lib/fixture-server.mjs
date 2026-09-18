/**
 * Loopback Streamable-HTTP MCP fixture that declares SEP-2640 skills
 * and serves initialize + skills/list for the three SDS well-known skills.
 * Pure node:http — cold clone, no npm ci, no Express, no payment.
 */
import http from "node:http";
import {
  MCP_PROTOCOL,
  MCP_SERVER_INFO,
  SKILLS_EXTENSION,
} from "./catalog.mjs";
import { loadExpectedSkills, skillEntry } from "./skills.mjs";

function okMsg(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errMsg(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function skillsResult(files) {
  return {
    resultType: "complete",
    skills: files.map(skillEntry),
    ttlMs: 300000,
    cacheScope: "public",
  };
}

function handleRpc(msg, files) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, {
        protocolVersion: MCP_PROTOCOL,
        capabilities: {
          tools: {},
          resources: {},
          extensions: { [SKILLS_EXTENSION]: {} },
        },
        serverInfo: { ...MCP_SERVER_INFO },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return okMsg(id, {});
    case "skills/list":
      return okMsg(id, skillsResult(files));
    case "skills/get": {
      const uri = params?.uri;
      const file = files.find((f) => f.uri === uri);
      if (!file) return errMsg(id, -32602, `unknown skill uri: ${uri}`);
      return okMsg(id, {
        resultType: "complete",
        skill: skillEntry(file),
        ttlMs: 300000,
        cacheScope: "public",
      });
    }
    case "tools/list":
      return errMsg(id, -32601, "tools/list is out of mcp-skills-list fixture scope");
    case "tools/call":
      return okMsg(id, {
        content: [
          {
            type: "text",
            text: "FIXTURE_CALL_REFUSE: mcp-skills-list never POSTs tools/call.",
          },
        ],
        isError: true,
      });
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

export function startFixtureServer({ port = 0 } = {}) {
  const files = loadExpectedSkills();
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
        "samedaydesk mcp-skills-list fixture (loopback).\n" +
          "POST JSON-RPC initialize / skills/list. Never send PAYMENT-SIGNATURE.\n",
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
        const out = body.map((msg) => handleRpc(msg, files)).filter(Boolean);
        res.writeHead(out.length ? 200 : 202, { "content-type": "application/json" });
        if (out.length) res.end(JSON.stringify(out));
        else res.end();
        return;
      }
      const out = handleRpc(body, files);
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
          new Promise((resClose, rej) => {
            server.close((err) => (err ? rej(err) : resClose()));
          }),
      });
    });
  });
}
