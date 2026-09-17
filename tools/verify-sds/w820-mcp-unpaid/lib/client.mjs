/**
 * Unpaid MCP HTTP client for w820.
 * Hard-refuses PAYMENT-SIGNATURE and paid Fix Pack tools/call POSTs.
 * Allows unpaid free-tool tools/call against loopback fixture only (isError demo).
 * http-only — never imports https, so live TLS apex cannot be POSTed.
 */
import http from "node:http";
import { FORBIDDEN_HEADERS, PAID_TOOL, FREE_TOOLS } from "./catalog.mjs";
import {
  assertLoopbackUnpaidOrigin,
  assertNoPaymentUrl,
  MAX_MCP_BODY_BYTES,
} from "./origin.mjs";

const FORBIDDEN_HEADER_KEYS = FORBIDDEN_HEADERS.map((h) => h.toLowerCase());

function normalizeHeaderMap(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[String(k).toLowerCase()] = v;
  }
  return out;
}

export function assertNoPaymentHeaders(headers = {}) {
  const norm = normalizeHeaderMap(headers);
  for (const forbidden of FORBIDDEN_HEADERS) {
    const key = forbidden.toLowerCase();
    if (norm[key] != null && String(norm[key]).length > 0) {
      const err = new Error(`refusing to send forbidden payment header: ${forbidden}`);
      err.code = "PAYMENT_HEADER_REFUSE";
      err.header = forbidden;
      throw err;
    }
  }
  return true;
}

/**
 * Guard: refuse tools/call of the paid Fix Pack tool and license-shaped args.
 * Free tools may be POSTed against the loopback fixture for isError demo.
 */
export function assertUnpaidCallAllowed(method, params) {
  if (method !== "tools/call") return true;
  const name = params?.name;
  const args = params?.arguments || {};
  if (name === PAID_TOOL) {
    const err = new Error(
      `refusing paid tools/call: ${PAID_TOOL} (Stripe license / Fix Pack path)`,
    );
    err.code = "PAID_REFUSE";
    err.tool = PAID_TOOL;
    throw err;
  }
  if (name && !FREE_TOOLS.includes(name)) {
    const err = new Error(`tools/call of unknown tool is out of unpaid w820 scope: ${name}`);
    err.code = "USAGE";
    err.tool = name;
    throw err;
  }
  if (args && typeof args === "object") {
    const license = args.license;
    if (license != null && String(license).length > 0) {
      const err = new Error("refusing tools/call that presents a Stripe license argument");
      err.code = "PAID_REFUSE";
      err.tool = name || PAID_TOOL;
      throw err;
    }
  }
  return true;
}

function rpc(id, method, params) {
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return body;
}

function assertPayloadUnpaid(encoded, payload) {
  if (/"PAYMENT-SIGNATURE"|PAYMENT-SIGNATURE|X-PAYMENT|stripe-signature/i.test(encoded)) {
    const err = new Error("refusing payload that embeds PAYMENT-SIGNATURE");
    err.code = "PAYMENT_HEADER_REFUSE";
    throw err;
  }
  if (payload?.method === "tools/call") {
    assertUnpaidCallAllowed(payload.method, payload.params);
  }
}

/**
 * POST JSON-RPC to a loopback MCP URL. Strips forbidden headers; refuses paid call.
 */
export function postMcp(url, payload, { headers = {}, timeoutMs = 15_000 } = {}) {
  assertNoPaymentHeaders(headers);
  assertNoPaymentUrl(url);
  if (payload?.method === "tools/call") {
    assertUnpaidCallAllowed(payload.method, payload.params);
  }
  const encoded = JSON.stringify(payload);
  assertPayloadUnpaid(encoded, payload);

  const u = assertLoopbackUnpaidOrigin(url);
  const safeHeaders = {
    "content-type": "application/json",
    accept: "application/json",
  };
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_HEADER_KEYS.includes(lower)) continue;
    if (lower === "content-type" || lower === "accept") continue;
    safeHeaders[k] = v;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const req = http.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 80,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          ...safeHeaders,
          "content-length": Buffer.byteLength(encoded),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > MAX_MCP_BODY_BYTES) {
            req.destroy();
            const err = new Error("MCP response too large");
            err.code = "RUNTIME";
            finish(reject, err);
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            json = null;
          }
          finish(resolve, {
            status: res.statusCode,
            headers: res.headers,
            body,
            json,
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      const err = new Error("MCP request timeout");
      err.code = "RUNTIME";
      finish(reject, err);
    });
    req.on("error", (e) => {
      const err = new Error(e.message);
      err.code = "RUNTIME";
      finish(reject, err);
    });
    req.write(encoded);
    req.end();
  });
}

export async function initializeSession(mcpUrl) {
  return postMcp(
    mcpUrl,
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "sds-w820-mcp-unpaid", version: "1.0.0" },
    }),
  );
}

export async function listTools(mcpUrl) {
  const initialize = await initializeSession(mcpUrl);
  const listed = await postMcp(mcpUrl, rpc(2, "tools/list", {}));
  return { initialize, listed };
}

/**
 * Unpaid tools/call against fixture. Never paid tool. Never payment headers.
 * initialize → tools/list → tools/call so list always happens before call.
 */
export async function callUnpaidTool(mcpUrl, toolName, args = {}) {
  assertUnpaidCallAllowed("tools/call", { name: toolName, arguments: args });
  assertLoopbackUnpaidOrigin(mcpUrl);
  const initialize = await initializeSession(mcpUrl);
  if (initialize.status !== 200 || !initialize.json?.result) {
    return { initialize, listed: null, called: null, toolName };
  }
  const listed = await postMcp(mcpUrl, rpc(2, "tools/list", {}));
  const called = await postMcp(
    mcpUrl,
    rpc(3, "tools/call", { name: toolName, arguments: args }),
  );
  return { initialize, listed, called, toolName };
}

export function toolNames(listed) {
  const tools = listed?.json?.result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => t.name);
}

/**
 * Assert MCP CallToolResult isError shape (MCP tools/call result with isError:true).
 */
export function assertIsErrorShape(callResult) {
  const result = callResult?.json?.result;
  if (!result || typeof result !== "object") {
    const err = new Error("tools/call response missing result object");
    err.code = "ISERROR_SHAPE";
    throw err;
  }
  if (result.isError !== true) {
    const err = new Error("expected CallToolResult.isError === true for unpaid demo");
    err.code = "ISERROR_SHAPE";
    err.detail = { isError: result.isError };
    throw err;
  }
  if (!Array.isArray(result.content) || result.content.length === 0) {
    const err = new Error("expected CallToolResult.content array with ≥1 entry");
    err.code = "ISERROR_SHAPE";
    throw err;
  }
  const textEntry = result.content.find(
    (c) => c && c.type === "text" && typeof c.text === "string",
  );
  if (!textEntry) {
    const err = new Error("expected content entry with type:text and text string");
    err.code = "ISERROR_SHAPE";
    throw err;
  }
  return {
    isError: true,
    content: result.content,
    text: textEntry.text,
  };
}

export { rpc };
