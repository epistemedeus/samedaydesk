import { FIXPACK_MCP_BUY_URL } from "./fixpack-license.js";
const FIXPACK_LINK = FIXPACK_MCP_BUY_URL;

export const MCP_TOOL_NAMES = Object.freeze([
  "check_ai_readiness",
  "check_agent_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

export const MCP_TOOL_NAME_MAX_LEN = Math.max(...MCP_TOOL_NAMES.map((name) => name.length));

export const TOOLS = [
  {
    name: MCP_TOOL_NAMES[0],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description:
      "Free. Check whether agents can discover and call a public website. Fetches discovery files, follows MCP links " +
      "named by those files, and runs only initialize, tools/list, and one unknown-tool call. Never executes a real tool. " +
      "Returns a 0-100 score, every check with an evidence URL, and the top fixes. No license.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Public host to score, for example example.com" },
      },
      required: ["host"],
    },
    outputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        score: { type: "number" },
        free: { type: "boolean" },
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              status: { type: "string" },
              reason: { type: "string" },
              fix: { type: "string" },
              evidenceUrl: { type: "string" },
            },
            required: ["id", "title", "status", "reason", "fix"],
          },
        },
        topFixes: { type: "array" },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              status: { type: "number" },
            },
            required: ["url"],
          },
        },
      },
      required: ["host", "score", "checks", "topFixes", "evidence"],
    },
  },
  {
    name: MCP_TOOL_NAMES[2],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
    name: MCP_TOOL_NAMES[3],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
    name: MCP_TOOL_NAMES[4],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
    name: MCP_TOOL_NAMES[5],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
