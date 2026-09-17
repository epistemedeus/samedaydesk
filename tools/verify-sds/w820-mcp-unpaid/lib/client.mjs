/**
 * Unpaid MCP HTTP client. Hard-refuses PAYMENT-SIGNATURE and tools/call POSTs
 * that would exercise paid Fix Pack / Stripe paths.
 */
import http from "node:http";
import https from "node:https";
import { FORBIDDEN_HEADERS, PAID_TOOL, looksLikePaymentUrl } from "./catalog.mjs";

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

/**
 * Guard: refuse Stripe / checkout / cs_ license URLs before any socket.
 */
export function assertNoPaymentUrl(value) {
  if (looksLikePaymentUrl(value)) {
    const err = new Error(`refusing Stripe/checkout path in unpaid harness: ${value}`);
    err.code = "STRIPE_PATH_REFUSE";
    err.path = value;
    throw err;
  }
  return true;
}

/**
 * Normalize an --origin value to a /mcp URL. Rejects payment query/hosts.
 * Does not append "/mcp" onto an existing query string.
 */
export function resolveMcpUrl(origin) {
  const trimmed = String(origin || "").trim();
  if (!trimmed) {
    const err = new Error("missing MCP origin");
    err.code = "USAGE";
    throw err;
  }
  assertNoPaymentUrl(trimmed);
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    const err = new Error(`invalid MCP origin: ${trimmed}`);
    err.code = "USAGE";
    throw err;
  }
  assertNoPaymentUrl(u.toString());
  let path = u.pathname.replace(/\/+$/, "") || "";
  if (!path.endsWith("/mcp")) path = `${path}/mcp`;
  return `${u.origin}${path}`;
}

function rpc(id, method, params) {
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return body;
}

/**
 * POST JSON-RPC to an MCP URL. Strips any forbidden headers; refuses paid call.
 */
export function postMcp(url, payload, { headers = {}, timeoutMs = 15_000 } = {}) {
  assertNoPaymentHeaders(headers);
  assertNoPaymentUrl(url);
  if (payload?.method === "tools/call") {
    assertUnpaidCallAllowed(payload.method, payload.params, { allowFreeCall: false });
  }
  const encoded = JSON.stringify(payload);
  if (/"PAYMENT-SIGNATURE"|PAYMENT-SIGNATURE/i.test(encoded)) {
    const err = new Error("refusing payload that embeds PAYMENT-SIGNATURE");
    err.code = "PAYMENT_HEADER_REFUSE";
    throw err;
  }
  if (/"tools\/call"/i.test(encoded) && payload?.method === "tools/call") {
    assertUnpaidCallAllowed(payload.method, payload.params, { allowFreeCall: false });
  }

  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
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
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
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
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            json = null;
          }
          resolve({
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
      reject(err);
    });
    req.on("error", (e) => {
      const err = new Error(e.message);
      err.code = "RUNTIME";
      reject(err);
    });
    req.write(encoded);
    req.end();
  });
}

export async function listTools(mcpUrl) {
  const initialize = await postMcp(
    mcpUrl,
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "sds-w820-mcp-unpaid", version: "1.0.0" },
    }),
  );
  const listed = await postMcp(mcpUrl, rpc(2, "tools/list", {}));
  return { initialize, listed };
}

export function toolNames(listed) {
  const tools = listed?.json?.result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => t.name);
}

export { rpc };
