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
import { clientKey } from "../lib/agent-readiness/rate-limit.js";
import {
  SUPPORTED_PROTOCOL_VERSIONS, mcpAdmissionForRequest,
  protocolHeaderValue, isInitializationRequest, unsupportedProtocolMessage,
} from "../lib/mcp-admission.js";
import { mcpHeaders } from "../lib/mcp-http.js";
import { runCheck } from "./tools.js";
import {
  browseTaskMarketTasks,
  buildTaskMarketDelegationPlan,
  trackTaskMarketTask,
} from "../lib/taskmarket.js";
import { TOOLS } from "../lib/mcp-tool-inventory.js";
import { formatAgentReadiness, runAgentReadinessCheck } from "../lib/agent-readiness/service.js";
import {
  FIXPACK_MCP_BUY_URL,
  validateFixPackLicense,
} from "../lib/fixpack-license.js";
import {
  generateCompleteFixPack,
  generateStarterFixPack,
} from "../lib/fixpack-artifact.js";

const router = Router();

// Newest first. initialize echoes a supported client version, otherwise the latest.
export { SUPPORTED_PROTOCOL_VERSIONS, protocolHeaderValue, isInitializationRequest, unsupportedProtocolMessage };
export const SERVER_INFO = { name: "samedaydesk-agent-tools", version: "1.2.0" };

export function negotiateProtocolVersion(offered) {
  if (typeof offered === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(offered)) return offered;
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}
// String literal kept for MCP protocol gate tooling; must match FIXPACK_MCP_BUY_URL.
const FIXPACK_LINK = "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h"; // $39 instant Fix Pack
if (FIXPACK_LINK !== FIXPACK_MCP_BUY_URL) {
  throw new Error("FIXPACK_LINK must stay aligned with FIXPACK_MCP_BUY_URL");
}

export { TOOLS };

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

async function handle(msg, ctx = {}) {
  const { id, method, params } = msg || {};
  switch (method) {
    case "initialize":
      return okMsg(id, {
        protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
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

      if (name === "check_agent_readiness") {
        const host = String(args.host || args.url || "").trim();
        if (!host) return okMsg(id, { content: [{ type: "text", text: "Provide a host, e.g. example.com" }], isError: true });
        try {
          const { payload } = await runAgentReadinessCheck(host, { clientKey: ctx.clientKey });
          return okMsg(id, {
            content: [{ type: "text", text: formatAgentReadiness(payload) }],
            structuredContent: payload,
          });
        } catch (e) {
          const safe = e.status === 400 || e.status === 429 ? e.message : `Could not check ${host}`;
          return okMsg(id, { content: [{ type: "text", text: safe }], isError: true });
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

router.use(mcpHeaders);

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
      "Tools: free AI-readiness and agent-readiness checks, a paid Fix Pack, plus free TaskMarket delegation planning, task browsing, and task tracking.\n" +
      "TaskMarket integration: https://github.com/epistemedeus/samedaydesk/blob/main/TASKMARKET-INTEGRATION.md\n",
  );
});

// Streamable HTTP and the TypeScript SDK: a present MCP-Protocol-Version that
// this server does not implement is HTTP 400 on requests after initialize.
// Initialize negotiates the version in the JSON-RPC body. A missing header
// stays accepted for clients that predate the header, including this probe.
router.post("/", async (req, res) => {
  const admission = mcpAdmissionForRequest(req);
  if (admission.error) return res.status(admission.status).json(admission.error);
  const ctx = { clientKey: clientKey(req) };
  // Validate and bound the entire producer body before choosing any async tool.
  // Per-entry failures must not discard valid work from a legacy mixed batch.
  const out = (await Promise.all(admission.entries.map(async (message) => {
    if (message.kind === "response") return null;
    if (message.error) return message.kind === "notification" ? null : message.error;
    try {
      const result = await handle(message.entry, ctx);
      return message.kind === "notification" ? null : result;
    } catch {
      return message.kind === "notification" ? null : errMsg(message.entry.id, -32603, "Internal error");
    }
  }))).filter(Boolean);
  if (!out.length) return res.status(202).end();
  return res.status(admission.status).json(admission.batch ? out : out[0]);
});

export default router;
