// One owning admission contract for mounted execution, observation and schemas.
// Headerless POSTs use the inherited March-2025 compatibility path. November
// and June Streamable HTTP carry one message; 2024 batches are an SDS extension,
// not an implementation of the deprecated HTTP+SSE transport.
import { MCP_TOOL_NAMES, TOOLS } from "./mcp-tool-inventory.js";

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05",
]);
export const MCP_BATCH_MIN = 1;
export const MCP_BATCH_MAX = 25;
export const MCP_METHOD_MAX_LEN = 128;
export const MCP_BODY_LIMIT = "1mb";
export const MCP_BATCH_PROTOCOL_VERSIONS = Object.freeze(["2025-03-26", "2024-11-05"]);
const TOOL_NAMES = new Set(MCP_TOOL_NAMES);
const TOOL_SCHEMAS = new Map(TOOLS.map(tool => [tool.name, tool.inputSchema]));

export const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
export const rpcIdSchema = () => ({ type: ["string", "integer"] });
export const rpcMessageSchema = () => ({
  type: "object", required: ["jsonrpc", "method"],
  properties: {
    jsonrpc: { const: "2.0" }, id: rpcIdSchema(),
    method: { type: "string", minLength: 1, maxLength: MCP_METHOD_MAX_LEN },
    params: { type: "object" },
  },
});
export const rpcBatchSchema = (items) => ({ type: "array", minItems: MCP_BATCH_MIN, maxItems: MCP_BATCH_MAX, items });

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
// Parsed JSON has own data fields. Do not invoke accessors or inherit a tool
// name when callers use this contract directly (including pulse tests).
function field(value, key) {
  const descriptor = record(value) ? Object.getOwnPropertyDescriptor(value, key) : null;
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}
function dataField(value, key) {
  return !Object.hasOwn(value, key) || Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value");
}
const validId = id => typeof id === "string" || (typeof id === "number" && Number.isInteger(id));

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some(candidate => matchesType(value, candidate));
  if (type === "object") return record(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validSuppliedArguments(args, schema) {
  // Preserve inherited missing-field/domain failures as useful isError tool
  // results. Supplied fields must have the advertised structural types before
  // any async adapter (especially license validation) can be selected.
  for (const [name, spec] of Object.entries(schema?.properties || {})) {
    if (!Object.hasOwn(args, name)) continue;
    if (!dataField(args, name)) return false;
    const value = field(args, name);
    if (spec.type && !matchesType(value, spec.type)) return false;
    if (spec.items && !value.every(item => matchesType(item, spec.items.type))) return false;
  }
  return true;
}

export function mcpMethodClass(method) {
  if (["initialize", "tools/list", "tools/call"].includes(method)) return method;
  return typeof method === "string" && method.startsWith("notifications/") ? "notifications" : "other";
}

function validateEntry(entry) {
  const invalid = () => ({ error: rpcError(null, -32600, "Invalid Request") });
  if (!record(entry) || field(entry, "jsonrpc") !== "2.0") return invalid();
  const hasId = Object.hasOwn(entry, "id");
  const id = field(entry, "id");
  if (hasId && !validId(id)) return invalid();
  const method = field(entry, "method");
  if (!Object.hasOwn(entry, "method")) {
    // This stateless server has no pending server requests. Accept well-formed
    // response messages as no-ops, never dispatch them as methods.
    const hasResult = Object.hasOwn(entry, "result");
    const hasError = Object.hasOwn(entry, "error");
    const error = field(entry, "error");
    if (!hasId || hasResult === hasError || Object.hasOwn(entry, "params")) return invalid();
    if (hasResult && !record(field(entry, "result"))) return invalid();
    if (hasError && (!record(error) || !Number.isInteger(field(error, "code")) || typeof field(error, "message") !== "string")) return invalid();
    return { kind: "response", entry, observation: { methodClass: "other" } };
  }
  if (typeof method !== "string" || !method || method.length > MCP_METHOD_MAX_LEN || Object.hasOwn(entry, "result") || Object.hasOwn(entry, "error")) return invalid();
  if (hasId && method.startsWith("notifications/")) return invalid();
  const kind = hasId ? "request" : "notification";
  const out = { kind, entry, observation: { methodClass: mcpMethodClass(method) } };
  const params = field(entry, "params");
  const invalidParams = () => ({ ...out, error: rpcError(id ?? null, -32602, "Invalid params") });
  if (!dataField(entry, "params") || (Object.hasOwn(entry, "params") && !record(params))) return invalidParams();
  if (method === "tools/call") {
    const name = field(params, "name");
    if (typeof name !== "string" || !name || !dataField(params, "arguments") || (Object.hasOwn(params, "arguments") && !record(field(params, "arguments")))) return invalidParams();
    if (!validSuppliedArguments(field(params, "arguments") || {}, TOOL_SCHEMAS.get(name))) return invalidParams();
    if (TOOL_NAMES.has(name)) out.observation.toolName = name;
  }
  return out;
}

export function protocolHeaderValue(req) {
  const raw = req.headers?.["mcp-protocol-version"];
  return raw == null ? null : Array.isArray(raw) ? raw.join(", ") : String(raw);
}

export function isInitializationRequest(body) {
  if (Array.isArray(body)) return false;
  const validated = validateEntry(body);
  return validated.kind === "request" && !validated.error && field(body, "method") === "initialize";
}

export function unsupportedProtocolMessage(version) {
  return `Bad Request: Unsupported protocol version: ${version} (supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")})`;
}

export function rejectedMcpAdmission(status, code, message) {
  return { batch: false, status, error: rpcError(null, code, message), entries: [], messages: [] };
}

export function admitMcpBody(body, headerVersion = null) {
  const batch = Array.isArray(body);
  // No batch (or invalid initialize) may borrow the singleton negotiation exemption.
  if (headerVersion !== null && !SUPPORTED_PROTOCOL_VERSIONS.includes(headerVersion) && !isInitializationRequest(body)) {
    return rejectedMcpAdmission(400, -32000, unsupportedProtocolMessage(headerVersion));
  }
  if (batch) {
    if (body.length < MCP_BATCH_MIN || body.length > MCP_BATCH_MAX) return rejectedMcpAdmission(400, -32600, `Invalid Request: compatibility batch must contain ${MCP_BATCH_MIN}..${MCP_BATCH_MAX} messages`);
    if (headerVersion !== null && !MCP_BATCH_PROTOCOL_VERSIONS.includes(headerVersion)) return rejectedMcpAdmission(400, -32600, "Invalid Request: this protocol version requires one message per POST");
  }
  const entries = (batch ? body : [body]).map(validateEntry);
  return {
    batch, status: !batch && !entries[0].kind ? 400 : 200,
    entries, messages: entries.filter(entry => entry.observation).map(entry => entry.observation),
  };
}

// The mounted pulse observer produces this once; route execution receives the
// same decision. Parser errors supply an already-rejected decision here too.
export function mcpAdmissionForRequest(req) {
  return req.mcpAdmission ||= admitMcpBody(req.body, protocolHeaderValue(req));
}

// Public interpreter retained for existing callers, derived from admission.
export function parseMcpProtocolBody(body, headerVersion = null) {
  const admission = admitMcpBody(body, headerVersion);
  return { admitted: admission.messages.length > 0, messages: admission.messages };
}
