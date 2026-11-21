import { evaluateDecision } from "./evaluate.mjs";

const JSON_HEADERS = Object.freeze({ "content-type": "application/json" });

function httpResponse(status, body) {
  return { status, headers: { ...JSON_HEADERS }, body };
}

function parseBody(body) {
  if (body == null) return { ok: false, message: "request body required" };
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch {
      return { ok: false, message: "request body must be JSON" };
    }
  }
  if (typeof body === "object") return { ok: true, value: body };
  return { ok: false, message: "request body must be JSON" };
}

function coerceHorizon(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function payloadFromObject(value) {
  if (!value || typeof value !== "object") return { ok: false, message: "evaluate payload required" };
  return { ok: true, payload: value };
}

function payloadFromMcp(message) {
  if (!message || message.jsonrpc !== "2.0") return { ok: false, message: "MCP JSON-RPC payload required" };
  if (message.method !== "tools/call") {
    return { ok: false, message: "evaluate façade accepts MCP tools/call only" };
  }
  const name = message.params?.name;
  if (name && name !== "evaluate" && name !== "recurring-decision-evaluate") {
    return { ok: false, message: `unsupported MCP tool ${name}` };
  }
  const args = message.params?.arguments;
  if (!args || typeof args !== "object") return { ok: false, message: "MCP tools/call arguments required" };
  return { ok: true, payload: args, id: message.id ?? null };
}

function runEvaluate(payload) {
  return evaluateDecision({
    intent: payload.intent,
    prior: payload.prior ?? null,
    capture: payload.capture ?? null,
    clock: payload.clock,
    horizonHours: coerceHorizon(payload.horizonHours),
    previous: payload.previous ?? null,
    reference: payload.reference ?? null,
    statePath: null,
  });
}

/**
 * Receive a caller-owned HTTPS evaluate request (the body posted by the
 * n8n HTTP Request node) and run evaluateDecision in-process. This is
 * not a resident service and does not write state or capture customer data.
 */
export function receiveEvaluateHttpRequest(request) {
  if (!request || typeof request !== "object") return httpResponse(400, { ok: false, message: "request required" });
  const method = String(request.method || "POST").toUpperCase();
  if (method !== "POST") return httpResponse(405, { ok: false, message: "evaluate façade accepts POST only" });
  const parsed = parseBody(request.body);
  if (!parsed.ok) return httpResponse(400, { ok: false, message: parsed.message });
  if (parsed.value && parsed.value.jsonrpc === "2.0") {
    const mcp = receiveEvaluateMcpCall(parsed.value);
    return httpResponse(mcp.error ? 400 : 200, mcp);
  }
  const extracted = payloadFromObject(parsed.value);
  if (!extracted.ok) return httpResponse(400, { ok: false, message: extracted.message });
  const result = runEvaluate(extracted.payload);
  return httpResponse(result.ok ? 200 : 400, result);
}

/**
 * Receive an MCP JSON-RPC tools/call for evaluate and run evaluateDecision
 * in-process. Intended for a caller-owned façade that speaks the same
 * body shape as POST /mcp-server/http tools/call.
 */
export function receiveEvaluateMcpCall(message) {
  const extracted = payloadFromMcp(message);
  if (!extracted.ok) {
    return {
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32600, message: extracted.message },
    };
  }
  const result = runEvaluate(extracted.payload);
  return {
    jsonrpc: "2.0",
    id: extracted.id,
    result,
  };
}

/**
 * Accept either an HTTP request shape ({ method, body }) or a raw MCP
 * JSON-RPC message and route it to the matching receiver.
 */
export function receiveEvaluateRequest(input) {
  if (input && input.jsonrpc === "2.0") {
    const mcp = receiveEvaluateMcpCall(input);
    return httpResponse(mcp.error ? 400 : 200, mcp);
  }
  return receiveEvaluateHttpRequest(input);
}
