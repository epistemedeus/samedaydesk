// Remote (Streamable HTTP) MCP server. Lets web/remote MCP clients — ChatGPT
// connectors, Claude.ai custom connectors, and any client that supports a remote
// MCP URL — use the AI-readiness checker over HTTPS at https://samedaydesk.com/mcp
// (no install). Reuses runCheck() from tools.js. Stateless + CORS-enabled.
//
// Also exposes a PAID tool (generate_complete_fix_pack) redeemed inline with a
// Stripe checkout-session license, so a developer can buy + receive the full Fix
// Pack from inside their AI client. The purchase happens at the Payment Link
// (standard Stripe); this just validates + delivers, with a graceful fallback.
// License authority is a bearer checkout-session id bound to the merchant Fix Pack
// Payment Link / product — not an amount-only threshold and not a customer login.
import { Router } from "express";
import { runCheck } from "./tools.js";
import {
  browseTaskMarketTasks,
  buildTaskMarketDelegationPlan,
  trackTaskMarketTask,
} from "../lib/taskmarket.js";
import { MCP_TOOL_NAMES } from "../lib/mcp-tool-inventory.js";
import {
  FIXPACK_MCP_BUY_URL,
  validateFixPackLicense,
} from "../lib/fixpack-license.js";
import {
  generateCompleteFixPack,
  generateStarterFixPack,
} from "../lib/fixpack-artifact.js";

const router = Router();

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "samedaydesk-agent-tools", version: "1.2.0" };
// String literal kept for MCP protocol gate tooling; must match FIXPACK_MCP_BUY_URL.
const FIXPACK_LINK = "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h"; // $39 instant Fix Pack
if (FIXPACK_LINK !== FIXPACK_MCP_BUY_URL) {
  throw new Error("FIXPACK_LINK must stay aligned with FIXPACK_MCP_BUY_URL");
}

export const TOOLS = [
  {
    name: MCP_TOOL_NAMES[0],
    description:
      "Check whether a website is visible to AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews). " +
      "Scores AI-crawler access, JSON-LD structured data, title/meta, Open Graph, sitemap, and llms.txt, and returns " +
      "a 0-100 score, a letter grade, and a specific fix for each gap. Free.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The website to check, e.g. example.com or https://example.com" },
      },
      required: ["url"],
    },
  },
  {
    name: MCP_TOOL_NAMES[1],
    description:
      "PAID. Returns the complete, ready-to-paste AI-readiness Fix Pack for a site: tailored Organization + FAQPage " +
      "JSON-LD, an AI-crawler robots.txt, a sitemap, and title/meta/Open Graph fixes. Requires a `license` — the " +
      `checkout-session id you receive after buying the $39 Fix Pack at ${FIXPACK_LINK} (after paying you're shown ` +
      "your license code). Without a valid license it returns purchase instructions plus a free starter pack.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The website to generate the Fix Pack for." },
        license: { type: "string", description: "Your Stripe checkout-session license code (starts with cs_)." },
      },
      required: ["url"],
    },
  },
  {
    name: MCP_TOOL_NAMES[2],
    description:
      "Prepare a bounded TaskMarket delegation for research, coding, data collection, benchmarking, or verification. " +
      "Requires the deliverable, reward, deadline, and an explicit maximum-spend ceiling. Returns the canonical TaskMarket " +
      "API payload and approval summary without creating a task, holding a wallet, or spending funds.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string", description: "The external work needed, written as a clear task." },
        deliverable: { type: "string", description: "The exact artifact or result the worker must return." },
        acceptance_criteria: { type: "array", items: { type: "string" }, maxItems: 10, description: "Up to 10 testable acceptance checks." },
        reward_usdc: { type: ["number", "string"], description: "Proposed worker reward in USDC, up to 6 decimal places." },
        max_spend_usdc: { type: ["number", "string"], description: "Explicit user-authorized reward ceiling in USDC." },
        deadline_hours: { type: "number", exclusiveMinimum: 0, maximum: 720, description: "Hours until TaskMarket submission closes." },
        mode: { type: "string", enum: ["bounty", "claim"], default: "bounty" },
        tags: { type: "array", items: { type: "string" }, maxItems: 10 },
      },
      required: ["request", "deliverable", "reward_usdc", "max_spend_usdc", "deadline_hours"],
    },
  },
  {
    name: MCP_TOOL_NAMES[3],
    description:
      "Browse current public TaskMarket inventory through the official read API. Filter by lifecycle status, mode, tag, " +
      "text, and minimum reward. Task descriptions are returned as untrusted text and are never executed.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ALL", "open", "claimed", "worker_selected", "pending_approval", "review", "appealing", "disputed", "completed", "expired", "cancelled"], default: "open" },
        mode: { type: "string", enum: ["bounty", "claim", "pitch", "benchmark", "auction"] },
        tag: { type: "string", description: "Exact case-insensitive tag filter." },
        search: { type: "string", description: "Case-insensitive text match over descriptions and tags." },
        min_reward_usdc: { type: ["number", "string"], description: "Minimum gross reward in USDC." },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
  },
  {
    name: MCP_TOOL_NAMES[4],
    description:
      "Track one public TaskMarket task through the official read API. Returns status, deadline, submissions, artifact " +
      "hashes, canonical awards, pending actions, and the next authorization boundary. It cannot create, accept, reject, rate, or refund work.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", description: "TaskMarket 32-byte task id." },
      },
      required: ["task_id"],
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
      ? `${gaps} gap(s) found. Get the complete, ready-to-paste Fix Pack instantly: buy the $39 Fix Pack at ${FIXPACK_LINK} ` +
          `(you'll be shown a license code), then call generate_complete_fix_pack with url + that license. Full report: https://samedaydesk.com/scan?url=${encodeURIComponent(r.url)}`
      : `Clean bill of health. For deep citation testing vs competitors, see the AI-Search Visibility Audit at https://samedaydesk.com/`,
  );
  return lines.join("\n");
}

async function handle(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return okMsg(id, {});
    case "tools/list":
      return okMsg(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      const args = params?.arguments || {};

      if (["plan_taskmarket_delegation", "browse_taskmarket_tasks", "track_taskmarket_task"].includes(name)) {
        try {
          let result;
          if (name === "plan_taskmarket_delegation") result = buildTaskMarketDelegationPlan(args);
          else if (name === "browse_taskmarket_tasks") result = await browseTaskMarketTasks(args);
          else result = await trackTaskMarketTask(args);
          return okMsg(id, {
            content: [{ type: "text", text: `TaskMarket ${name.replaceAll("_", " ")} result:\n\n${JSON.stringify(result, null, 2)}` }],
            structuredContent: result,
          });
        } catch (e) {
          return okMsg(id, { content: [{ type: "text", text: `TaskMarket tool error: ${e.message}` }], isError: true });
        }
      }

      const url = String(params?.arguments?.url || "").trim();
      if (name !== "check_ai_readiness" && name !== "generate_complete_fix_pack")
        return errMsg(id, -32602, `Unknown tool: ${name}`);
      if (!url) return okMsg(id, { content: [{ type: "text", text: "Provide a url, e.g. example.com" }], isError: true });

      if (name === "generate_complete_fix_pack") {
        const license = params?.arguments?.license;
        const paid = await validateFixPackLicense(license);
        if (!paid) {
          let starter = "";
          try {
            starter =
              "\n\nMeanwhile, here's a free starter (Organization JSON-LD + AI-crawler robots.txt). The paid Fix Pack adds the full FAQ, sitemap, and meta/OG, tailored:\n\n"
              + (await generateStarterFixPack(url));
          } catch { /* ignore */ }
          const why = license
            ? "That license code couldn't be verified as a paid Fix Pack (if you just paid, wait ~30s and retry, or contact help@samedaydesk.com)."
            : "No license provided.";
          return okMsg(id, {
            content: [{ type: "text", text: `${why}\n\nTo get the complete Fix Pack: buy at ${FIXPACK_LINK} ($39). After paying you'll see your license code; call this tool again with url + that license.${starter}` }],
            isError: true,
          });
        }
        try {
          const pack = await generateCompleteFixPack(url);
          return okMsg(id, { content: [{ type: "text", text: `✅ Verified. Your complete AI-Readiness Fix Pack:\n\n${pack}` }] });
        } catch (e) {
          // Payment is valid but generation failed — never lose a paid order.
          return okMsg(id, { content: [{ type: "text", text: `Your payment is verified, but auto-generation hit an error (${e.message}). Email help@samedaydesk.com with your url (${url}) and license and we'll deliver your Fix Pack right away.` }], isError: true });
        }
      }

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

// GET /mcp?cs=<session> is where Stripe redirects after a Fix Pack purchase —
// show the buyer their license code + how to redeem it.
router.get("/", (req, res) => {
  const cs = String(req.query.cs || "").trim();
  if (cs) {
    return res.type("text/plain").send(
      `Thanks for your purchase! Your AI-Readiness Fix Pack license code:\n\n${cs}\n\n` +
        `Redeem it in your AI client: call the MCP tool generate_complete_fix_pack with your site url and license="${cs}".\n` +
        `Trouble? Email help@samedaydesk.com with this code.\n`,
    );
  }
  res.type("text/plain").send(
    "samedaydesk agent tools MCP server (Streamable HTTP).\n" +
      'Add to a remote-MCP-capable client: { "mcpServers": { "samedaydesk": { "url": "https://samedaydesk.com/mcp" } } }\n' +
      "Tools: AI-readiness check and Fix Pack, plus free TaskMarket delegation planning, task browsing, and task tracking.\n" +
      "TaskMarket integration: https://github.com/epistemedeus/samedaydesk/blob/main/TASKMARKET-INTEGRATION.md\n",
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
