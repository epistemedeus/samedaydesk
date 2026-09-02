export const MCP_TOOL_NAMES = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

export const MCP_TOOL_NAME_MAX_LEN = Math.max(...MCP_TOOL_NAMES.map((name) => name.length));
