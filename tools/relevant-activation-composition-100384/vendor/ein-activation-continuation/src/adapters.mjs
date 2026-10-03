/** SPDX-License-Identifier: MIT
 * MCP and A2A operation adapters. Catalog and operations stay on the selected
 * transport. A missing skill is a refusal, not an HTTP call labeled as success.
 */
import { randomBytes } from "node:crypto";

import { ContinuationError, recovery } from "./errors.mjs";
import { createApiTransport } from "./transport.mjs";

const MCP_PROTOCOL = "2025-11-25";
const A2A_VERSION = "1.0";
const KNOWN_CODES = new Map([
  ["assessment_not_found", 404],
  ["assessment_facts_mismatch", 409],
  ["intended_recipient_mismatch", 409],
  ["assessment_expired", 409],
  ["assessment_already_bound", 409],
  ["operation_identity_conflict", 409],
  ["operation_payload_mismatch", 409],
  ["incomplete_assessment_not_claimable", 409],
  ["not_claimed", 409],
  ["secret_field_rejected", 400],
  ["service_configuration_error", 503],
  ["email_not_verified", 403],
  ["claim_token_query_is_not_accepted", 400],
  ["prepare_failpoint", 500],
]);

export const TRANSPORTS = Object.freeze(["http", "mcp", "a2a", "a2a-rest"]);

export function parseTransportEnv(env) {
  const raw = typeof env.EIN_CONTINUATION_TRANSPORT === "string" ? env.EIN_CONTINUATION_TRANSPORT.trim() : "";
  const transport = raw || "http";
  if (!TRANSPORTS.includes(transport)) {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_CONTINUATION_TRANSPORT is not http, mcp, a2a, or a2a-rest",
      recovery: recovery(
        "fix_input",
        "Choose the transport the current server actually publishes. This client will not relabel another transport as success.",
      ),
    });
  }
  const catalogRaw = typeof env.EIN_CONTINUATION_CATALOG_TRANSPORT === "string"
    ? env.EIN_CONTINUATION_CATALOG_TRANSPORT.trim()
    : "";
  if (catalogRaw && transport !== "a2a" && transport !== "a2a-rest") {
    throw new ContinuationError({
      code: "invalid_input",
      message: "EIN_CONTINUATION_CATALOG_TRANSPORT applies only when operations use A2A",
      recovery: recovery(
        "fix_input",
        "Leave it unset for http and mcp. Those transports read the catalog themselves.",
      ),
    });
  }
  if (catalogRaw && catalogRaw !== "http") {
    throw new ContinuationError({
      code: "invalid_input",
      message: "The only explicit catalog transport is http",
      recovery: recovery(
        "fix_input",
        "Set EIN_CONTINUATION_CATALOG_TRANSPORT=http to read the current catalog over HTTP while A2A performs operations, or leave it unset to stop.",
      ),
    });
  }
  return { transport, catalogTransport: catalogRaw || null };
}

function refuseHumanOnly(kind, method, path) {
  if (/\/claim(?:\/|$)/.test(path) || /\/grants(?:\/|$)/.test(path) || path.includes("/checkout") || path.includes("/payments")) {
    throw new ContinuationError({
      code: "transport_unsupported",
      message: `${kind} does not claim, pay, or issue grants.`,
      operation: `${method} ${path}`,
      recovery: recovery(
        "human_claim",
        "The human opens the stored one-tap HTTPS claim URL. This client did not send claim, payment, or grant issuance.",
      ),
    });
  }
}

function toolCall(method, path) {
  if (method === "POST" && path === "/api/agent/v1/assessments") return { name: "assess_formation" };
  if (method === "POST" && path === "/api/agent/v1/applications") return { name: "prepare_application" };
  const status = /^\/api\/agent\/v1\/applications\/([^/]+)\/status$/.exec(path);
  if (method === "GET" && status) {
    return { name: "get_application_status", applicationId: decodeURIComponent(status[1]) };
  }
  return null;
}

function statusFor(payload) {
  const code = typeof payload?.code === "string" ? payload.code : "";
  if (KNOWN_CODES.has(code)) return KNOWN_CODES.get(code);
  if (typeof payload?.retryAfterSeconds === "number") return 429;
  const message = typeof payload?.error === "string" ? payload.error : "";
  if (/Invalid, expired, or revoked grant|Missing agent grant token/i.test(message)) return 401;
  if (/not scoped to this application/i.test(message)) return 403;
  if (/Application not found|Assessment not found/i.test(message)) return 404;
  if (/rate limit/i.test(message)) return 429;
  return 400;
}

function asBusiness(payload, { mutation }) {
  const failed = payload && typeof payload === "object" && !Array.isArray(payload)
    && typeof payload.error === "string"
    && payload.assessment == null
    && typeof payload.applicationId !== "string"
    && payload.openapi == null
    && payload.status?.applicationId == null;
  if (!failed) {
    const prepared = payload?.status === "provisional" && payload?.complete === true && typeof payload?.applicationId === "string";
    return { ok: true, status: prepared ? 201 : 200, payload };
  }
  const status = statusFor(payload);
  if (mutation && payload.error === "Tool execution failed" && typeof payload.code !== "string") {
    throw new ContinuationError({
      code: "unknown_outcome",
      causeCode: "tool_execution_failed",
      status,
      message: "Mutation result is unknown.",
      recovery: recovery(
        "replay_same_bound_prepare",
        "Replay the same task, recipient, and operation id. Do not open another intake.",
      ),
    });
  }
  if (mutation && (status >= 500 || payload.code === "prepare_failpoint")) {
    throw new ContinuationError({
      code: "unknown_outcome",
      causeCode: payload.code || "unavailable",
      status,
      message: "Mutation result is unknown.",
      recovery: recovery(
        "replay_same_bound_prepare",
        "Replay the same task, recipient, and operation id. Do not open another intake.",
      ),
    });
  }
  throw new ContinuationError({
    status,
    code: typeof payload.code === "string" && KNOWN_CODES.has(payload.code)
      ? payload.code
      : status === 401
        ? "invalid_grant"
        : status === 403
          ? "insufficient_scope"
          : status === 404
            ? "not_found"
            : status === 429
              ? "rate_limited"
              : status === 409
                ? "conflict"
                : "invalid_input",
    message: status === 401
      ? "request was not authorized"
      : status === 403
        ? "credential is not scoped to this request"
        : status === 429
          ? "request was rate limited"
          : "request conflicts with current server state",
  });
}

function dataPart(parts) {
  if (!Array.isArray(parts)) return undefined;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (part.data && typeof part.data === "object" && !Array.isArray(part.data)) return part.data;
    const content = part.content;
    if (content?.$case === "data" && content.value && typeof content.value === "object") return content.value;
  }
  return undefined;
}

function immediateA2AMessage(body) {
  return body?.result?.message ?? body?.message ?? null;
}

function a2aHasTask(body) {
  return Boolean(body?.task || body?.result?.task);
}

function a2aPayload(body, { mutation }) {
  const message = immediateA2AMessage(body);
  if (a2aHasTask(body) && !message) {
    if (mutation) {
      throw unknownMutation({
        causeCode: "non_immediate_task",
        operation: "A2A SendMessage",
      });
    }
    throw new ContinuationError({
      code: "transport_unsupported",
      message: "A2A returned a task. This server does not offer background tasks, and a task id is not a case.",
      recovery: recovery(
        "stop",
        "Do not poll an A2A task for application status. Read grant-scoped status, or stop.",
      ),
    });
  }
  const data = dataPart(message?.parts);
  if (!data) {
    if (mutation) {
      throw unknownMutation({
        causeCode: "malformed_result",
        operation: "A2A SendMessage",
      });
    }
    throw new ContinuationError({
      code: "invalid_response",
      message: "A2A response did not contain one data part with the operation body.",
      recovery: recovery("stop", "Do not treat this response as HTTP success and do not call the formation route to fill it in."),
    });
  }
  return data;
}

function sameOriginPath(url, origin) {
  const parsed = new URL(url);
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  return parsed.pathname;
}

const CAUSE = /^[a-z][a-z0-9_]{0,63}$/;

function boundedCause(value) {
  return typeof value === "string" && CAUSE.test(value) ? value : "protocol_error";
}

function jsonRpcCause(code) {
  if (typeof code === "number" && Number.isInteger(code) && code >= -32768 && code <= -32000) {
    return `jsonrpc_n${Math.abs(code)}`;
  }
  return "protocol_error";
}

function unknownMutation({ causeCode, operation, status = null }) {
  return new ContinuationError({
    code: "unknown_outcome",
    causeCode: boundedCause(causeCode),
    status,
    message: "Mutation result is unknown.",
    operation,
    recovery: recovery(
      "replay_same_bound_prepare",
      "Replay the same bound prepare. Do not choose a new operation id, claim link, grant, or payment.",
    ),
  });
}

function protocolRefusal({ code, status, message, operation, mutation }) {
  const read = mutation !== true;
  return new ContinuationError({
    status,
    code,
    message,
    operation,
    recovery: recovery(
      code === "rate_limited"
        ? (read ? "retry_read" : "retry_same_operation")
        : code === "invalid_input"
          ? "fix_input"
          : "stop",
      code === "rate_limited"
        ? "The server refused this request before dispatch. Retry the same operation later. Do not mint another operation id. This refusal is not a stored case."
        : code === "invalid_input"
          ? "The server rejected this request before dispatch. Fix the input. Do not treat the refusal as a committed case and do not mint another operation id."
          : "This transport refused the call before dispatch. Do not relabel it as another transport and do not mint another operation id.",
    ),
  });
}

function rpcErrorOf(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.jsonrpc !== "2.0" || !payload.error || typeof payload.error !== "object" || Array.isArray(payload.error)) return null;
  return payload.error;
}

function idsMatch(left, right) {
  return left === right;
}

/**
 * MCP JSON-RPC errors that protocol.ts and host.ts return before callTool.
 * HTTP 200 -32602 is pre-dispatch here. A2A reuses -32602 after execute, so it is not in this set.
 */
function mcpPreDispatch(status, error) {
  const code = error?.code;
  if (status === 429 && code === -32000) return "rate_limited";
  if (status === 403 && code === -32000) return "invalid_input";
  if ((status === 400 || status === 200) && (code === -32700 || code === -32600)) return "invalid_input";
  if (status === 200 && code === -32601) return "transport_unsupported";
  if (status === 200 && code === -32602) return "invalid_input";
  return null;
}

/**
 * A2A errors raised before SendMessage/execute: parse (-32700), method not found (-32601),
 * content-type (-32005), and version (-32009). RequestMalformed -32602 is also used after execute.
 */
function a2aPreDispatch(status, error) {
  const code = error?.code;
  if ((status === 200 || status === 400) && code === -32700) return "invalid_input";
  if (code === -32601) return "transport_unsupported";
  if (code === -32005) return "invalid_input";
  if (code === -32009) return "transport_unsupported";
  return null;
}

function classifyRpc({ status, payload, mutation, requestId, operation, preDispatch }) {
  const error = rpcErrorOf(payload);
  if (error) {
    const kind = preDispatch(status, error);
    const id = payload.id;
    const idOk = id === undefined || id === null || idsMatch(id, requestId);
    if (kind && idOk) {
      return protocolRefusal({
        code: kind,
        status: kind === "rate_limited" ? 429 : status,
        message: kind === "rate_limited"
          ? "request was rate limited"
          : kind === "transport_unsupported"
            ? "The server rejected this method before dispatch."
            : "The server rejected this request before dispatch.",
        operation,
        mutation,
      });
    }
    if (mutation) {
      return unknownMutation({
        causeCode: idOk ? jsonRpcCause(error.code) : "response_id_mismatch",
        operation,
        status,
      });
    }
    return new ContinuationError({
      status: status === 200 ? 400 : status,
      code: "invalid_response",
      message: "Protocol response did not match this read.",
      operation,
      recovery: recovery("stop", "Do not treat this read as success and do not prepare because a read failed."),
    });
  }
  if (status !== 200) return undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !idsMatch(payload.id, requestId) || !Object.prototype.hasOwnProperty.call(payload, "result")) {
    if (mutation) {
      return unknownMutation({
        causeCode: payload && typeof payload === "object" && !Array.isArray(payload) && !idsMatch(payload.id, requestId)
          ? "response_id_mismatch"
          : "malformed_result",
        operation,
        status,
      });
    }
    return new ContinuationError({
      code: "invalid_response",
      message: "Protocol response did not match this read.",
      operation,
      recovery: recovery("stop", "Do not treat this read as success and do not prepare because a read failed."),
    });
  }
  return "accept";
}

export async function createContinuationTransport({
  apiOrigin,
  fetch: fetchImpl,
  timeoutMs,
  maxResponseBytes,
  transport = "http",
  catalogTransport = null,
} = {}) {
  const http = await createApiTransport({ apiOrigin, fetch: fetchImpl, timeoutMs, maxResponseBytes });
  const stats = { requests: 0, latencyMs: 0 };
  const innerRequest = http.request.bind(http);
  http.request = async (method, path, options) => {
    const started = Date.now();
    stats.requests += 1;
    try {
      return await innerRequest(method, path, options);
    } finally {
      stats.latencyMs += Date.now() - started;
    }
  };
  if (transport === "http") {
    return {
      ...http,
      kind: "http",
      catalogSource: "http",
      openapiSource: "http",
      stats,
      readCatalog() {
        return http.request("GET", "/api/v1/service-catalog", { success: [200] });
      },
      readOpenApi(path) {
        return http.request("GET", path, { success: [200] });
      },
      request(method, path, options) {
        refuseHumanOnly("http", method, path);
        return http.request(method, path, options);
      },
    };
  }

  const state = {
    kind: transport,
    catalogSource: transport === "mcp" ? "mcp" : "unsupported",
    openapiSource: transport === "mcp" ? "mcp" : "a2a",
    a2aPath: transport === "a2a-rest" ? "/a2a/rest/message:send" : "/a2a/jsonrpc",
    cardSeen: false,
  };
  let rpcId = 0;

  async function postJson(path, body, headers, { mutation, secrets, decide }) {
    return http.request("POST", path, {
      body,
      success: [200],
      mutation,
      secrets,
      headers,
      decide,
    });
  }

  async function mcpRpc(method, params, { mutation = false, secrets = [] } = {}) {
    rpcId += 1;
    const requestId = rpcId;
    const operation = `MCP ${method}`;
    const response = await postJson("/mcp", {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    }, { "mcp-protocol-version": MCP_PROTOCOL }, {
      mutation,
      secrets,
      decide: (status, payload) => classifyRpc({
        status,
        payload,
        mutation,
        requestId,
        operation,
        preDispatch: mcpPreDispatch,
      }),
    });
    return response.payload?.result;
  }

  async function readAgentCard() {
    const response = await http.request("GET", "/.well-known/agent-card.json", { success: [200] });
    const card = response.payload;
    const binding = transport === "a2a-rest" ? "HTTP+JSON" : "JSONRPC";
    const iface = (card?.supportedInterfaces ?? []).find((item) => item?.protocolBinding === binding && item?.protocolVersion === A2A_VERSION);
    const path = iface ? sameOriginPath(iface.url, http.origin) : null;
    if (!path) {
      throw new ContinuationError({
        code: "contract_mismatch",
        message: `The current agent card does not publish ${binding} ${A2A_VERSION} on this origin.`,
        recovery: recovery("stop", "Do not call a remembered A2A path. Read the current card again."),
      });
    }
    const skills = new Set((card.skills ?? []).map((skill) => skill?.id).filter((id) => typeof id === "string"));
    for (const required of ["assess_formation", "prepare_application", "get_application_status", "get_formation_contract"]) {
      if (!skills.has(required)) {
        throw new ContinuationError({
          code: "capability_unavailable",
          message: `The current agent card does not offer ${required}.`,
          recovery: recovery("stop", "Do not invent the skill and do not call its HTTP route as A2A."),
        });
      }
    }
    if (skills.has("claim_application") || skills.has("prepare_payment")) {
      throw new ContinuationError({
        code: "transport_unsupported",
        message: "The agent card offers a claim or payment skill this client will not call.",
        recovery: recovery("stop", "Refuse the card. Claim and payment stay on the human HTTPS page."),
      });
    }
    if (card.capabilities?.streaming === true || card.capabilities?.pushNotifications === true) {
      throw new ContinuationError({
        code: "transport_unsupported",
        message: "Streaming or push notifications are not this continuation.",
        recovery: recovery("stop", "Use the immediate message binding only. Do not follow a stream."),
      });
    }
    state.a2aPath = binding === "HTTP+JSON" && !path.endsWith("/message:send")
      ? `${path.replace(/\/$/, "")}/message:send`
      : path;
    state.cardSeen = true;
    return card;
  }

  async function a2aSend(skill, input, { mutation, secrets }) {
    if (!state.cardSeen) await readAgentCard();
    const message = {
      messageId: `ein-${randomBytes(8).toString("hex")}`,
      role: "ROLE_USER",
      parts: [{ data: { skill, input } }],
    };
    if (transport === "a2a-rest") {
      const response = await postJson(state.a2aPath, { message }, { "A2A-Version": A2A_VERSION }, {
        mutation,
        secrets,
        decide: (status, payload) => {
          if (status !== 200) return undefined;
          if (typeof payload === "string") {
            return mutation
              ? unknownMutation({ causeCode: "non_immediate_stream", operation: "A2A message:send", status })
              : new ContinuationError({
                code: "transport_unsupported",
                message: "A2A HTTP+JSON did not return an immediate message.",
                operation: "A2A message:send",
                recovery: recovery("stop", "Do not follow a stream or a task, and do not repeat the call over formation HTTP."),
              });
          }
          if (a2aHasTask(payload) && !immediateA2AMessage(payload)) {
            return mutation
              ? unknownMutation({ causeCode: "non_immediate_task", operation: "A2A message:send", status })
              : new ContinuationError({
                code: "transport_unsupported",
                message: "A2A HTTP+JSON did not return an immediate message.",
                operation: "A2A message:send",
                recovery: recovery("stop", "Do not follow a stream or a task, and do not repeat the call over formation HTTP."),
              });
          }
          return "accept";
        },
      });
      return a2aPayload(response.payload, { mutation });
    }
    rpcId += 1;
    const requestId = rpcId;
    const response = await postJson(state.a2aPath, {
      jsonrpc: "2.0",
      id: requestId,
      method: "SendMessage",
      params: { message },
    }, { "A2A-Version": A2A_VERSION }, {
      mutation,
      secrets,
      decide: (status, payload) => classifyRpc({
        status,
        payload,
        mutation,
        requestId,
        operation: "A2A SendMessage",
        preDispatch: a2aPreDispatch,
      }),
    });
    return a2aPayload(response.payload, { mutation });
  }

  async function callTool(name, input, options) {
    if (transport === "mcp") {
      const result = await mcpRpc("tools/call", { name, arguments: input }, options);
      const malformed = !result || typeof result !== "object" || Array.isArray(result);
      const payload = !malformed && result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)
        ? result.structuredContent
        : null;
      if (malformed || !payload || (result.isError === true && payload.error == null)) {
        if (options.mutation === true) {
          throw unknownMutation({
            causeCode: "malformed_result",
            operation: `MCP ${name}`,
          });
        }
        throw new ContinuationError({
          code: "invalid_response",
          message: malformed
            ? "MCP tools/call did not return a result object."
            : "MCP tool result has no structured operation body.",
          operation: `MCP ${name}`,
          recovery: recovery("stop", "Do not parse the text part as success and do not fall back to HTTP."),
        });
      }
      return asBusiness(payload, options);
    }
    const payload = await a2aSend(name, input, options);
    return asBusiness(payload, options);
  }

  return {
    origin: http.origin,
    kind: state.kind,
    get catalogSource() {
      return state.catalogSource;
    },
    get openapiSource() {
      return state.openapiSource;
    },
    stats,
    async readCatalog() {
      if (transport === "mcp") {
          const result = await mcpRpc("resources/read", { uri: "ein://service-catalog" });
          const text = result?.contents?.[0]?.text;
          if (typeof text !== "string") {
            throw new ContinuationError({
              code: "capability_unavailable",
              message: "MCP did not return the service catalog resource.",
              recovery: recovery("stop", "Do not GET /api/v1/service-catalog and call that MCP discovery."),
            });
          }
          try {
            return { status: 200, payload: JSON.parse(text) };
          } catch {
            throw new ContinuationError({
              code: "invalid_response",
              message: "MCP service catalog resource was not JSON.",
              recovery: recovery("stop", "Do not replace it with a cached offer."),
            });
          }
        }
        await readAgentCard();
        if (catalogTransport !== "http") {
          throw new ContinuationError({
            code: "catalog_not_on_transport",
            message: "The service catalog is not an A2A skill. It was not read over HTTP.",
            recovery: recovery(
              "use_catalog_transport",
              "Set EIN_CONTINUATION_CATALOG_TRANSPORT=http to read the current catalog over HTTP and keep assess, prepare, and status on A2A. A stored offer is not the current contract. MCP can read the catalog itself.",
            ),
          });
        }
        state.catalogSource = "http";
        return http.request("GET", "/api/v1/service-catalog", { success: [200] });
    },
    async readOpenApi() {
      return callTool("get_formation_contract", {}, { mutation: false });
    },
    async request(method, path, options = {}) {
      refuseHumanOnly(state.kind, method, path);
        const tool = toolCall(method, path);
        if (!tool) {
          throw new ContinuationError({
            code: "transport_unsupported",
            message: `${state.kind} has no skill for ${method} ${path}.`,
            operation: `${method} ${path}`,
            recovery: recovery(
              "stop",
              "Do not send this call to the formation HTTP route and report the selected transport as successful.",
            ),
          });
        }
        const input = tool.name === "get_application_status"
          ? { applicationId: tool.applicationId, AgentGrant: options.grantToken }
          : options.body ?? {};
        if (tool.name === "get_application_status" && (typeof options.grantToken !== "string" || !options.grantToken)) {
          throw new ContinuationError({
            code: "missing_grant",
            status: 401,
            message: "A human-issued status grant is required.",
            recovery: recovery("human_issues_grant", "The human issues a revocable grant. This client does not mint one."),
          });
        }
        return callTool(tool.name, input, {
          mutation: options.mutation === true,
          secrets: options.secrets ?? [],
        });
    },
  };
}
