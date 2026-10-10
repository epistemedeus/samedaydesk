// Apex A2A card. Skill ids are the apex MCP tool inventory, not a second list.
import { MCP_TOOL_NAMES } from "./mcp-tool-inventory.js";

export const APEX_ORIGIN = "https://samedaydesk.com";

const SKILL_TEXT = {
  check_ai_readiness: "Free. Score whether AI search engines can crawl and understand a public site.",
  check_agent_readiness: "Free. Score whether agents can discover and call a public site. No license.",
  generate_complete_fix_pack: "Paid. Complete AI-readiness Fix Pack. Requires a Stripe license.",
  plan_taskmarket_delegation: "Free plan only. Prepares a TaskMarket delegation and does not create or fund a task.",
  browse_taskmarket_tasks: "Free. Read public TaskMarket tasks.",
  track_taskmarket_task: "Free. Read one public TaskMarket task.",
  project_funnel_evidence: "Free. Project one declared observation packet. No fetch, no customer query, no store, no spend.",
};

export function apexAgentCard() {
  return {
    protocolVersion: "0.3.0",
    name: "SameDayDesk",
    description: "Free apex agent tools for AI readiness and agent readiness. Paid machine-commerce tools stay on https://agents.samedaydesk.com/.well-known/agent-card.json. The original-task correspondence interface is a no-spend next action, not an MCP skill and not a payment tool.",
    url: `${APEX_ORIGIN}/mcp`,
    version: "1.2.0",
    interfaces: [
      { transport: "MCP", url: `${APEX_ORIGIN}/mcp` },
      { transport: "HTTP", url: `${APEX_ORIGIN}/agent-readiness` },
      { transport: "HTTP", url: `${APEX_ORIGIN}/openapi.json` },
      { transport: "HTTP", url: `${APEX_ORIGIN}/skill.md` },
      {
        transport: "HTTP",
        url: `${APEX_ORIGIN}/discovery/original-task-correspondence.json`,
        description: "No-spend original-task correspondence descriptor. Not an MCP skill and not a payment tool.",
      },
    ],
    skills: MCP_TOOL_NAMES.map((name) => ({
      id: name,
      name,
      description: SKILL_TEXT[name] || name,
      tags: name === "check_ai_readiness" || name === "check_agent_readiness" ? ["free", "read-only"] : [],
    })),
  };
}
