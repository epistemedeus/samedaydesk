import { MCP_TOOL_NAMES } from "../mcp-tool-inventory.js";

export const MCP_SOURCE_HEADER = "x-samedaydesk-agent-source";
export const MCP_SOURCES = Object.freeze(["unattributed", "agentverse-a2a-v1"]);
export const MCP_OUTCOME_TOOLS = Object.freeze(["_none", "_unknown", ...MCP_TOOL_NAMES]);
export const MCP_OUTCOME_EVENTS = Object.freeze([
  "http_request", "tool_attempt", "normal_result", "tool_refusal",
  "protocol_error", "notification_completed", "response_finished", "disconnected",
]);
export const MCP_OUTCOME_KEYS = Object.freeze(MCP_SOURCES.flatMap(source =>
  MCP_OUTCOME_TOOLS.flatMap(tool => MCP_OUTCOME_EVENTS.map(event => `${source}|${tool}|${event}`))));
const keys = new Set(MCP_OUTCOME_KEYS);

export function declaredMcpSource(headers) {
  // Exact static allowlist only. Arrays, combined duplicates and arbitrary text
  // collapse to unattributed. Even a matching value is caller-spoofable.
  return headers?.[MCP_SOURCE_HEADER] === "agentverse-a2a-v1" ? "agentverse-a2a-v1" : "unattributed";
}

export function validateMcpOutcomes(value) {
  const invalid = () => { throw new Error("pulse_invalid_field:mcpOutcomes"); };
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "counts,observedFrom") invalid();
  const date = typeof value.observedFrom === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedFrom) ? new Date(value.observedFrom) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== value.observedFrom) invalid();
  const counts = value.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.keys(counts).length > keys.size) invalid();
  const out = Object.create(null);
  for (const [key, count] of Object.entries(counts)) {
    if (!keys.has(key) || !Number.isSafeInteger(count) || count < 0) invalid();
    out[key] = count;
  }
  return { observedFrom: date.toISOString(), counts: out };
}

export function mergeMcpOutcomes(base, add) {
  if (!add) return base ? structuredClone(base) : null;
  if (!base) return structuredClone(add);
  const counts = { ...base.counts };
  for (const [key, count] of Object.entries(add.counts)) counts[key] = (counts[key] || 0) + count;
  return { observedFrom: Date.parse(base.observedFrom) <= Date.parse(add.observedFrom) ? base.observedFrom : add.observedFrom, counts };
}
