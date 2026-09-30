// Pinned apex MCP identity. Tool names come from the server inventory.
import { MCP_TOOL_NAMES } from "../../../server/lib/mcp-tool-inventory.js";

export const MCP_PROTOCOL = "2024-11-05";

export const APEX_SERVER_NAME = "samedaydesk-agent-tools";

export const APEX_SERVER_INFO = Object.freeze({
  name: APEX_SERVER_NAME,
  version: "1.2.0",
});

export const APEX_TOOLS = MCP_TOOL_NAMES;

// Sent only as an absent name. It must stay off APEX_TOOLS.
export const ABSENT_TOOL_NAME = "absent_tool_not_on_apex_host";

// Probe request ids. A response is this call only when its id matches exactly.
export const RPC_REQUEST_ID = Object.freeze({
  initialize: 1,
  toolsList: 2,
  absent: 3,
});

export const GATEWAY_TOOL_COUNT = 24;

export const DENIED_GATEWAY_HOSTS = Object.freeze(["agents.samedaydesk.com"]);

export const SEEDED_IDS = Object.freeze([
  "absent-tool-not-32602",
  "absent-tool-32601",
  "gateway-24-tool-list",
  "absent-32602-wrong-id",
  "absent-32602-null-id",
  "absent-32602-missing-id",
  "initialize-wrong-id",
  "tools-list-missing-id",
]);
