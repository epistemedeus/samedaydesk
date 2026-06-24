// Remote (Streamable HTTP) MCP server. Lets web/remote MCP clients — ChatGPT
// connectors, Claude.ai custom connectors, and any client that supports a remote
// MCP URL — use the AI-readiness checker over HTTPS at https://samedaydesk.com/mcp
// (no install). Reuses runCheck() from tools.js. Stateless + CORS-enabled.
import { Router } from "express";
import { runCheck } from "./tools.js";

const router = Router();

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "samedaydesk-ai-readiness", version: "1.0.0" };

const TOOLS = [
  {
    name: "check_ai_readiness",
    description:
      "Check whether a website is visible to AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews). " +
      "Scores AI-crawler access, JSON-LD structured data, title/meta, Open Graph, sitemap, and llms.txt, and returns " +
      "a 0-100 score, a letter grade, and a specific fix for each gap.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The website to check, e.g. example.com or https://example.com" },
      },
      required: ["url"],
    },
  },
];

const okMsg = (id, result) => ({ jsonrpc: "2.0", id, result });
const errMsg = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function formatReport(r) {
  const lines = [`AI Readiness for ${r.url}`, `Score: ${r.score}/100   Grade: ${r.grade}`, ""];
  for (const c of r.checks || []) {
    lines.push(`[${String(c.status).toUpperCase()}] ${c.label} — ${c.detail}`);
    if (c.fix) lines.push(`       fix: ${c.fix}`);
  }
  lines.push("");
  const gaps = (r.checks || []).filter((c) => c.status !== "pass").length;
  lines.push(
    gaps > 0
      ? `${gaps} gap(s) found. See your full report + fixes at https://samedaydesk.com/scan?url=${encodeURIComponent(r.url)} . ` +
          `Want it done for you? The same-day Fix Pack ($39) ships the JSON-LD, robots.txt, sitemap, and meta/OG built for your exact site: https://samedaydesk.com/`
      : `Clean bill of health. For deep citation testing (does ChatGPT/Perplexity actually cite you vs competitors?), see the AI-Search Visibility Audit at https://samedaydesk.com/`,
  );
  return lines.join("\n");
}

async function handle(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return okMsg(id, {});
    case "tools/list":
      return okMsg(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      const url = String(params?.arguments?.url || "").trim();
      if (name !== "check_ai_readiness") return errMsg(id, -32602, `Unknown tool: ${name}`);
      if (!url) return okMsg(id, { content: [{ type: "text", text: "Provide a url, e.g. example.com" }], isError: true });
      try {
        const r = await runCheck(url);
        return okMsg(id, { content: [{ type: "text", text: formatReport(r) }], structuredContent: r });
      } catch (e) {
        return okMsg(id, { content: [{ type: "text", text: `Could not check ${url}: ${e.message}` }], isError: true });
      }
    }
    default:
      return id !== undefined ? errMsg(id, -32601, `Method not found: ${method}`) : null;
  }
}

router.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

router.get("/", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "samedaydesk AI-readiness MCP server (Streamable HTTP).\n" +
        'Add to a remote-MCP-capable client: { "mcpServers": { "ai-readiness": { "url": "https://samedaydesk.com/mcp" } } }\n' +
        "Tool: check_ai_readiness(url). Free hosted UI: https://samedaydesk.com/tools/ai-readiness\n",
    );
});

router.post("/", async (req, res) => {
  const msg = req.body;
  try {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handle))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(msg);
    if (!out) return res.status(202).end();
    return res.json(out);
  } catch (e) {
    return res.status(500).json(errMsg(msg?.id ?? null, -32603, e.message));
  }
});

export default router;
