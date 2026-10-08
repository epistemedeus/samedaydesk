/**
 * Unpaid MCP HTTP client. Hard-refuses PAYMENT-SIGNATURE and tools/call POSTs
 * that would exercise paid Fix Pack / Stripe paths. Loopback http only.
 */
import http from "node:http";
import { FORBIDDEN_HEADERS, PAID_TOOL } from "./catalog.mjs";
import {
  assertLoopbackUnpaidOrigin,
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

/**
 * Guard: throw if any forbidden payment header is present (case-insensitive).
 * Never attaches them to the wire request.
 */
export function assertNoPaymentHeaders(headers = {}) {
  const norm = normalizeHeaderMap(headers);
  for (const forbidden of FORBIDDEN_HEADERS) {
    const key = forbidden.toLowerCase();
    if (norm[key] != null && String(norm[key]).length > 0) {
      const err = new Error(
        `refusing to send forbidden payment header: ${forbidden}`,
      );
      err.code = "PAYMENT_HEADER_REFUSE";
      err.header = forbidden;
      throw err;
    }
  }
  return true;
}

/**
 * Guard: refuse tools/call of the paid Fix Pack tool (and any tools/call when
 * strict unpaid list-only mode is requested).
 */
export function assertUnpaidCallAllowed(method, params, { allowFreeCall = false } = {}) {
  if (method !== "tools/call") return true;
  const name = params?.name;
  if (name === PAID_TOOL) {
    const err = new Error(
      `refusing paid tools/call: ${PAID_TOOL} (Stripe license / Fix Pack path)`,
    );
    err.code = "PAID_REFUSE";
    err.tool = PAID_TOOL;
    throw err;
  }
  if (!allowFreeCall) {
    const err = new Error(
      "tools/call is out of unpaid verify scope; tools/list only, never POST payment",
    );
    err.code = "USAGE";
    err.tool = name || null;
    throw err;
  }
  return true;
}

function rpc(id, method, params) {
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return body;
}

function requestLoopback(url, { method, body, headers = {}, timeoutMs = 15_000 } = {}) {
  assertNoPaymentHeaders(headers);
  const u = assertLoopbackUnpaidOrigin(url);
  const encoded = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
  if (encoded && /"PAYMENT-SIGNATURE"|PAYMENT-SIGNATURE/i.test(encoded)) {
    const err = new Error("refusing payload that embeds PAYMENT-SIGNATURE");
    err.code = "PAYMENT_HEADER_REFUSE";
    throw err;
  }

  const safeHeaders = {
    accept: "application/json, text/plain;q=0.9,*/*;q=0.1",
  };
  if (encoded != null) safeHeaders["content-type"] = "application/json";
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
        method,
        headers: {
          ...safeHeaders,
          ...(encoded != null ? { "content-length": Buffer.byteLength(encoded) } : {}),
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
          } else {
            chunks.push(c);
          }
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          finish(resolve, {
            status: res.statusCode,
            headers: res.headers,
            body: text,
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
    if (encoded != null) req.write(encoded);
    req.end();
  });
}

/**
 * POST JSON-RPC to an MCP URL. Strips forbidden headers; refuses paid call.
 * Loopback http only — never opens a live apex or Stripe socket.
 */
export function postMcp(url, payload, { headers = {}, timeoutMs = 15_000 } = {}) {
  if (payload?.method === "tools/call") {
    assertUnpaidCallAllowed(payload.method, payload.params, { allowFreeCall: false });
  }
  return requestLoopback(url, { method: "POST", body: payload, headers, timeoutMs });
}

export function getMcp(url, { headers = {}, timeoutMs = 15_000 } = {}) {
  return requestLoopback(url, { method: "GET", headers, timeoutMs });
}

export async function listTools(mcpUrl) {
  const initialize = await postMcp(
    mcpUrl,
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "sds-w1040-mcp-unpaid", version: "1.0.0" },
    }),
  );
  if (initialize.status !== 200 || !initialize.json?.result) {
    return { initialize, listed: null };
  }
  const listed = await postMcp(mcpUrl, rpc(2, "tools/list", {}));
  return { initialize, listed };
}

export function toolNames(listed) {
  const tools = listed?.json?.result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => t.name);
}

export { rpc };
