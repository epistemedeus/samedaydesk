import {
  APEX_SERVER_NAME,
  APEX_TOOLS,
  GATEWAY_TOOL_COUNT,
  MCP_PROTOCOL,
} from "./catalog.mjs";

export function toolNamesFromList(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => {
    if (typeof tool === "string") return tool;
    if (tool && typeof tool.name === "string") return tool.name;
    return "";
  });
}

export function sameToolNames(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

// JSON-RPC Invalid params. A result body, including isError, is not this code.
export function isJsonRpc32602(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  if (message.jsonrpc !== "2.0") return false;
  if (Object.prototype.hasOwnProperty.call(message, "result")) return false;
  return message.error?.code === -32602;
}

function reject(code, message, detail) {
  return { ok: false, code, message, detail };
}

/**
 * Accept this host only when tools/list is exactly the apex five and the
 * protocol is 2024-11-05. Reject a 24-tool list. Reject an absent tool
 * whose body is not JSON-RPC -32602.
 */
export function judgeApexSession(session) {
  const names = toolNamesFromList(session?.tools);
  const protocol = session?.protocol ?? null;
  const serverName = session?.serverInfo?.name ?? null;
  const absentCode = session?.absent?.error?.code ?? null;
  const base = {
    expected: [...APEX_TOOLS],
    actual: names,
    protocol,
    serverName,
    absentErrorCode: absentCode,
    toolCount: names.length,
  };

  if (names.length === GATEWAY_TOOL_COUNT) {
    return reject(
      "GATEWAY_SURFACE",
      "a 24-tool list is not this apex host",
      base,
    );
  }
  if (serverName === "x402-data-gateway") {
    return reject(
      "GATEWAY_SURFACE",
      "gateway serverInfo is not this apex host",
      base,
    );
  }
  if (protocol !== MCP_PROTOCOL) {
    return reject(
      "PROTOCOL",
      `protocol must be ${MCP_PROTOCOL}`,
      base,
    );
  }
  if (serverName !== APEX_SERVER_NAME) {
    return reject(
      "HOST_MISMATCH",
      "serverInfo.name is not the apex MCP host",
      base,
    );
  }
  if (!sameToolNames(names, APEX_TOOLS)) {
    return reject(
      "HOST_MISMATCH",
      "tools/list is not exactly the apex five",
      base,
    );
  }
  if (!isJsonRpc32602(session?.absent)) {
    return reject(
      "ABSENT_TOOL_NOT_32602",
      "absent tool is not JSON-RPC -32602",
      base,
    );
  }
  return {
    ok: true,
    code: null,
    message: "apex MCP tools/list and absent-tool -32602",
    detail: base,
  };
}

export function sessionChecks(session, verdict) {
  const names = toolNamesFromList(session?.tools);
  return {
    positive: {
      toolsExact: sameToolNames(names, APEX_TOOLS),
      protocol: session?.protocol ?? null,
      protocolOk: session?.protocol === MCP_PROTOCOL,
    },
    negative: {
      absentToolCode: session?.absent?.error?.code ?? null,
      absentToolIs32602: isJsonRpc32602(session?.absent),
      toolCount: names.length,
      twentyFourToolListAccepted: names.length === GATEWAY_TOOL_COUNT && verdict.ok === true,
    },
  };
}
