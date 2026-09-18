/**
 * Unpaid MCP client for initialize + skills/list.
 * Hard-refuses tools/call, PAYMENT-SIGNATURE, and Stripe/extract spend paths.
 */
import http from "node:http";
import https from "node:https";
import { FORBIDDEN_HEADERS, MCP_PROTOCOL } from "./catalog.mjs";

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

export function assertListOnly(method, params) {
  if (method === "tools/call") {
    const err = new Error(
      `refusing tools/call (${params?.name || "unknown"}); mcp-skills-list is skills/list only`,
    );
    err.code = "TOOLS_CALL_REFUSE";
    err.tool = params?.name || null;
    throw err;
  }
  if (method !== "initialize" && method !== "skills/list" && method !== "skills/get") {
    const err = new Error(`method ${method} is out of skills/list verify scope`);
    err.code = "USAGE";
    throw err;
  }
  return true;
}

export function rpc(id, method, params) {
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return body;
}

export function postMcp(url, payload, { headers = {}, timeoutMs = 15_000 } = {}) {
  assertNoPaymentHeaders(headers);
  assertListOnly(payload?.method, payload?.params);
  const encoded = JSON.stringify(payload);
  if (/"PAYMENT-SIGNATURE"|PAYMENT-SIGNATURE/i.test(encoded)) {
    const err = new Error("refusing payload that embeds PAYMENT-SIGNATURE");
    err.code = "PAYMENT_HEADER_REFUSE";
    throw err;
  }
  if (/"tools\/call"/.test(encoded)) {
    const err = new Error("refusing payload that embeds tools/call");
    err.code = "TOOLS_CALL_REFUSE";
    throw err;
  }

  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  const safeHeaders = {
    "content-type": "application/json",
    accept: "application/json",
  };
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_HEADERS.map((h) => h.toLowerCase()).includes(lower)) continue;
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

export async function listSkills(mcpUrl, { protocolVersion = MCP_PROTOCOL } = {}) {
  const initialize = await postMcp(
    mcpUrl,
    rpc(1, "initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "sds-mcp-skills-list", version: "1.0.0" },
    }),
  );
  const listed = await postMcp(mcpUrl, rpc(2, "skills/list", {}));
  return { initialize, listed };
}
