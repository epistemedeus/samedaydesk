// Speak to a disposable target and grade it with the received SDS255 checker.
// The public result is finding status, never a score.
import { LATEST_MCP_VERSION, runChecks } from "../../../server/lib/agent-readiness/checks.js";
import { UNKNOWN_TOOL_NAME } from "../../../server/lib/agent-readiness/probe.js";
import { validateBundle } from "../../../server/lib/agent-readiness/schema.js";
import { FINDING_ID } from "./handoff.mjs";

async function postMcp(origin, body, extraHeaders = {}) {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function responseRecord(status, contentType, body) {
  return {
    status,
    contentType: contentType || "",
    body,
  };
}

export function unknownToolRequest() {
  return {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: UNKNOWN_TOOL_NAME, arguments: {} },
  };
}

export async function observeTarget(origin) {
  const host = new URL(origin).host;
  const llmsRes = await fetch(`${origin}/llms.txt`);
  const llmsText = await llmsRes.text();
  const mcpGet = await fetch(`${origin}/mcp`);
  const mcpGetText = await mcpGet.text();
  const initialize = await postMcp(origin, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_MCP_VERSION,
      capabilities: {},
      clientInfo: { name: "l08-agent-repair", version: "0" },
    },
  });
  const toolsList = await postMcp(origin, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const request = unknownToolRequest();
  const unknown = await postMcp(origin, request);
  const bundle = validateBundle({
    schema: "agent-readiness.probe.v1",
    host,
    probedAt: new Date().toISOString(),
    responses: {
      "/llms.txt": responseRecord(llmsRes.status, llmsRes.headers.get("content-type"), llmsText),
      "/mcp": responseRecord(mcpGet.status, mcpGet.headers.get("content-type"), mcpGetText),
    },
    mcp: {
      url: `${origin}/mcp`,
      offeredVersion: LATEST_MCP_VERSION,
      initialize: initialize.json,
      toolsList: toolsList.json,
      unknownToolCall: unknown.json,
    },
  });
  const { checks } = runChecks(bundle);
  const finding = checks.find((check) => check.id === FINDING_ID) ?? null;
  return {
    statuses: Object.fromEntries(checks.map((check) => [check.id, check.status])),
    finding: finding
      ? { id: finding.id, title: finding.title, status: finding.status, reason: finding.reason }
      : null,
    exchange: { request, response: unknown.json, httpStatus: unknown.status },
    endpoints: [
      { method: "GET", path: "/llms.txt", httpStatus: llmsRes.status },
      { method: "POST", path: "/mcp", httpStatus: unknown.status },
    ],
  };
}

export function changedFindings(before, after) {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return ids
    .filter((id) => before[id] !== after[id])
    .map((id) => ({ id, before: before[id] ?? "absent", after: after[id] ?? "absent" }));
}
