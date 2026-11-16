// The quick start block: one sentence a person copies to their agent, plus a
// command line and an MCP route. The same text is in index.html's static
// shell so agents and crawlers that never run scripts read it.
export const QUICKSTART = {
  label: "Send this to your agent",
  prompt:
    "Read https://samedaydesk.com/start.md, then run the free route check on my service and tell me which build fits.",
  helper: "Your agent checks your service and brings back a scope and a fixed price. You approve and pay.",
  // The command line is not released yet; the free check answers over HTTP today.
  cli: 'curl -s "https://samedaydesk.com/api/tools/ai-readiness?url=https://example.com"',
  cliHelper: "Runs the free check over HTTP. The samedaydesk command line follows.",
  mcp: '{"mcpServers":{"samedaydesk":{"url":"https://samedaydesk.com/mcp"}}}',
  mcpHelper: "Free tools at https://samedaydesk.com/mcp. Paid tools at https://agents.samedaydesk.com/mcp.",
} as const;
