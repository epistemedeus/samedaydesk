import { MCP_TOOL_NAMES } from "../mcp-tool-inventory.js";
import { amount, TASKMARKET_NETWORK_INFO, TASKMARKET_METADATA_TTL_MS } from "../taskmarket-networks.js";

export const MCP_SOURCE_HEADER = "x-samedaydesk-agent-source";
export const MCP_SOURCES = Object.freeze(["unattributed", "agentverse-a2a-v1"]);
export const MCP_OUTCOME_TOOLS = Object.freeze(["_none", "_unknown", ...MCP_TOOL_NAMES]);
export const MCP_OUTCOME_EVENTS = Object.freeze([
  "http_request", "tool_attempt", "normal_result", "tool_refusal",
  "protocol_error", "notification_completed", "response_finished", "disconnected",
]);
export const MCP_BROWSE_EVENTS = Object.freeze(["browse_empty", "browse_non_empty", "browse_unclassified"]);
export const MCP_OUTCOME_KEYS = Object.freeze(MCP_SOURCES.flatMap(source =>
  [...MCP_OUTCOME_TOOLS.flatMap(tool => MCP_OUTCOME_EVENTS.map(event => `${source}|${tool}|${event}`)),
    ...MCP_BROWSE_EVENTS.map(event => `${source}|browse_taskmarket_tasks|${event}`)]));
const keys = new Set(MCP_OUTCOME_KEYS);

export function declaredMcpSource(headers) {
  // Exact static allowlist only. Arrays, combined duplicates and arbitrary text
  // collapse to unattributed. Even a matching value is caller-spoofable.
  return headers?.[MCP_SOURCE_HEADER] === "agentverse-a2a-v1" ? "agentverse-a2a-v1" : "unattributed";
}

export function validateMcpOutcomes(value) {
  const invalid = () => { throw new Error("pulse_invalid_field:mcpOutcomes"); };
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !["counts,observedFrom", "browseObservedFrom,counts,observedFrom"].includes(Object.keys(value).sort().join(","))) invalid();
  const date = typeof value.observedFrom === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedFrom) ? new Date(value.observedFrom) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== value.observedFrom) invalid();
  if (Object.hasOwn(value, "browseObservedFrom")) {
    const stamp = value.browseObservedFrom;
    if (typeof stamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp) ||
        !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp || stamp < value.observedFrom) invalid();
  }
  const counts = value.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.keys(counts).length > keys.size) invalid();
  const out = Object.create(null);
  for (const [key, count] of Object.entries(counts)) {
    if (!keys.has(key) || !Number.isSafeInteger(count) || count < 0) invalid();
    if (MCP_BROWSE_EVENTS.includes(key.split("|")[2]) && !value.browseObservedFrom) invalid();
    out[key] = count;
  }
  return { observedFrom: date.toISOString(), counts: out, ...(value.browseObservedFrom ? { browseObservedFrom: value.browseObservedFrom } : {}) };
}

export function mergeMcpOutcomes(base, add) {
  if (!add) return base ? structuredClone(base) : null;
  if (!base) return structuredClone(add);
  const counts = { ...base.counts };
  for (const [key, count] of Object.entries(add.counts)) counts[key] = (counts[key] || 0) + count;
  const starts = [base.browseObservedFrom, add.browseObservedFrom].filter(Boolean).sort();
  return { observedFrom: Date.parse(base.observedFrom) <= Date.parse(add.observedFrom) ? base.observedFrom : add.observedFrom, counts,
    ...(starts.length ? { browseObservedFrom: starts[0] } : {}) };
}

function canonicalTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

// Match the actual structured producer AND its mirrored MCP text. No second
// fetch, string regex, result retention, or content-derived dimension.
export function classifyBrowseResult(result) {
  try {
    const value = result?.structuredContent;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "count,fetched_at,filters,metadata,safety,source,tasks" ||
        value.source !== "https://api.taskmarket.dev/api/tasks" ||
        !canonicalTimestamp(value.fetched_at) ||
        !value.metadata || typeof value.metadata !== "object" || Array.isArray(value.metadata) ||
        Object.keys(value.metadata).sort().join(",") !== "fetched_at,max_age_ms,source" ||
        value.metadata.source !== TASKMARKET_NETWORK_INFO ||
        value.metadata.max_age_ms !== TASKMARKET_METADATA_TTL_MS ||
        !canonicalTimestamp(value.metadata.fetched_at) ||
        typeof value.safety !== "string" || !value.safety || value.safety.length > 1000 ||
        !value.filters || typeof value.filters !== "object" || Array.isArray(value.filters) ||
        !Number.isInteger(value.count) || value.count < 0 || value.count > 25 ||
        !Array.isArray(value.tasks) || value.tasks.length !== value.count ||
        !Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== "text" ||
        typeof result.content[0].text !== "string" || result.content[0].text.length > 262_144) return "browse_unclassified";
    const ids = new Set();
    for (const task of value.tasks) {
      if (!task || typeof task !== "object" || Array.isArray(task) ||
          typeof task.id !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(task.id) ||
          typeof task.title !== "string" || !task.title || task.title.length > 160 ||
          typeof task.description !== "string" || task.description.length > 1200 ||
          ids.has(task.id) || !Array.isArray(task.tags) || task.tags.length > 10 || task.tags.some(tag => typeof tag !== "string" || tag.length > 1000) ||
          !task.asset || typeof task.asset !== "object" ||
          task.chain_id !== task.asset.chain_id ||
          !["served", "chain_unknown", "chain_not_served", "task_metadata_conflict"].includes(task.asset.metadata_status) ||
          !task.reward || typeof task.reward.base_units !== "string" || !/^\d{1,78}$/.test(task.reward.base_units) ||
          (task.asset.decimals !== null && (!Number.isInteger(task.asset.decimals) || task.asset.decimals < 0 || task.asset.decimals > 255)) ||
          JSON.stringify(task.reward) !== JSON.stringify(amount(task.reward.base_units, task.asset))) return "browse_unclassified";
      ids.add(task.id);
    }
    if (result.content[0].text !== `TaskMarket browse taskmarket tasks result:\n\n${JSON.stringify(value, null, 2)}`) return "browse_unclassified";
    return value.count === 0 ? "browse_empty" : "browse_non_empty";
  } catch { return "browse_unclassified"; }
}

export function browseCoverage(outcomes) {
  const counts = {};
  for (const source of MCP_SOURCES) {
    counts[source] = Object.fromEntries(MCP_BROWSE_EVENTS.map(event => [event, outcomes?.browseObservedFrom ? outcomes.counts[`${source}|browse_taskmarket_tasks|${event}`] || 0 : null]));
    const classified = Object.values(counts[source]).reduce((sum, count) => sum + count, 0);
    counts[source].normal_without_cardinality = Math.max(0, (outcomes?.counts[`${source}|browse_taskmarket_tasks|normal_result`] || 0) - classified);
  }
  return {
    observedFrom: outcomes?.browseObservedFrom || null,
    counts, complete: false,
    coverage: outcomes?.browseObservedFrom ? "lower_bound_from_first_observation" : "unknown",
    historicalCardinality: "unknown_no_backfill",
    meaning: "Categories count server-produced normal browse results, including suppressed notifications. Empty/non-empty require a bounded, consistent structured inventory and mirrored text. Unclassified is not empty. Normal results without this dimension have unknown cardinality; absent historical categories are not historical zeros. Non-empty is not actionable funding, peer receipt, usefulness, acceptance or revenue.",
  };
}
