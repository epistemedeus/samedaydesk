import {
  APEX_SERVER_NAME,
  APEX_TOOLS,
  GATEWAY_TOOL_COUNT,
  MCP_PROTOCOL,
  RPC_REQUEST_ID,
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

function hasOwn(message, key) {
  return Object.prototype.hasOwnProperty.call(message, key);
}

function asObject(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  return message;
}

// Identity of one probe response: JSON-RPC 2.0 and the exact request id.
// Missing, null, and any other id are not this call.
export function rpcIdentity(message, expectedId) {
  const body = asObject(message);
  const present = Boolean(body) && hasOwn(body, "id");
  const id = present ? body.id : null;
  if (!body) return { ok: false, reason: "shape", expectedId, present: false, id: null };
  if (body.jsonrpc !== "2.0") return { ok: false, reason: "jsonrpc", expectedId, present, id };
  if (!present || body.id !== expectedId) return { ok: false, reason: "id", expectedId, present, id };
  return { ok: true, reason: null, expectedId, present: true, id: body.id };
}

// initialize and tools/list must be a result object and must not carry error.
export function rpcResultBody(message) {
  const body = asObject(message);
  if (!body) return { ok: false, reason: "shape" };
  if (hasOwn(body, "error")) return { ok: false, reason: "error" };
  const result = body.result;
  if (!hasOwn(body, "result") || result == null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "result" };
  }
  return { ok: true, reason: null };
}

// JSON-RPC Invalid params for the absent probe (request id 3).
// A result body, including isError, is not this code.
// A -32602 object whose id is missing, null, or not 3 is not this call.
export function isJsonRpc32602(message) {
  if (!rpcIdentity(message, RPC_REQUEST_ID.absent).ok) return false;
  if (hasOwn(message, "result")) return false;
  return message.error?.code === -32602;
}

function pushFailure(failures, response, identity, body) {
  if (!identity.ok) {
    failures.push({ response, ...identity });
    return;
  }
  if (body && !body.ok) {
    failures.push({
      response,
      ok: false,
      reason: body.reason,
      expectedId: identity.expectedId,
      present: identity.present,
      id: identity.id,
    });
  }
}

// Gate for trusting result fields. Absent -32602 stays in isJsonRpc32602 so a
// bound non-32602 body still reports ABSENT_TOOL_NOT_32602.
export function bindProbeResponses(messages) {
  const initialize = rpcIdentity(messages?.initialize, RPC_REQUEST_ID.initialize);
  const listed = rpcIdentity(messages?.listed, RPC_REQUEST_ID.toolsList);
  const absent = rpcIdentity(messages?.absent, RPC_REQUEST_ID.absent);
  const failures = [];
  pushFailure(failures, "initialize", initialize, initialize.ok ? rpcResultBody(messages.initialize) : null);
  pushFailure(failures, "tools/list", listed, listed.ok ? rpcResultBody(messages.listed) : null);
  pushFailure(failures, "absent", absent, null);
  return { ok: failures.length === 0, failures };
}

function failureFor(rpc, response) {
  return rpc.failures.some((failure) => failure.response === response);
}

// Copy protocol and tools only from responses that are bound to requests 1 and 2.
export function sessionFromProbeResponses(initializeJson, listedJson, absentJson) {
  const messages = {
    initialize: initializeJson ?? null,
    listed: listedJson ?? null,
    absent: absentJson ?? null,
  };
  const rpc = bindProbeResponses(messages);
  const trustInitialize = !failureFor(rpc, "initialize");
  const trustList = !failureFor(rpc, "tools/list");
  return {
    protocol: trustInitialize ? (initializeJson?.result?.protocolVersion ?? null) : null,
    serverInfo: trustInitialize ? (initializeJson?.result?.serverInfo ?? null) : null,
    tools: trustList ? (listedJson?.result?.tools ?? null) : null,
    absent: absentJson ?? null,
    messages,
    rpc,
  };
}

function reject(code, message, detail) {
  return { ok: false, code, message, detail };
}

/**
 * Accept this host only when the three probe responses are JSON-RPC 2.0
 * bound to request ids 1, 2, and 3, tools/list is exactly the apex five,
 * and the protocol is 2024-11-05. Reject a 24-tool list. Reject an absent
 * tool whose body is not JSON-RPC -32602 for id 3.
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

  if (session?.messages) {
    const rpc = bindProbeResponses(session.messages);
    if (!rpc.ok) {
      return reject(
        "RPC_RESPONSE_BIND",
        "JSON-RPC response is not bound to the probe request",
        { ...base, rpc },
      );
    }
  }

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
