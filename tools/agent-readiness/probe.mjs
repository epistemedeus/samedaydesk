// Public read of agent-readiness surfaces. Never sends a payment header.

import dns from "node:dns/promises";
import net from "node:net";
import { knownCaptures } from "./captures.mjs";
import { RPC_INIT_ID, RPC_TOOLS_ID } from "./shape.mjs";

export const USER_AGENT = "SameDayDeskAgentReadiness/1.0 (+https://samedaydesk.com/tools/agent-readiness)";
const TIMEOUT_MS = 12000;
const MAX_BYTES = 262144;

const INIT_BODY = {
  jsonrpc: "2.0",
  id: RPC_INIT_ID,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "samedaydesk-agent-readiness", version: "0" },
  },
};

const TOOLS_BODY = {
  jsonrpc: "2.0",
  id: RPC_TOOLS_ID,
  method: "tools/list",
  params: {},
};

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80") || value.startsWith("::ffff:");
  }
  return true;
}

export function assertPublicHttpUrl(raw, { allowLoopback = false } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("Enter a full http(s) URL"), { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("Only http(s) URLs are supported"), { status: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("URLs with credentials are not checked"), { status: 400 });
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  if (loopback && allowLoopback) return url;
  if (loopback || host.endsWith(".localhost") || host.endsWith(".local") || host === "0.0.0.0") {
    throw Object.assign(new Error("That host is not a public website"), { status: 400 });
  }
  return url;
}

export async function assertPublicHost(hostname, { allowLoopback = false } = {}) {
  if (allowLoopback && (hostname === "127.0.0.1" || hostname === "localhost")) return;
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw Object.assign(new Error("That address is not a public website"), { status: 400 });
    return;
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw Object.assign(new Error("Could not resolve that domain"), { status: 400 });
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw Object.assign(new Error("That host is not a public website"), { status: 400 });
  }
}

function headersOf(response) {
  const headers = {};
  for (const name of ["content-type", "location", "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function readBody(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { text: buffer.subarray(0, MAX_BYTES).toString("utf8"), truncated: buffer.length > MAX_BYTES };
  }
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > MAX_BYTES) {
      truncated = true;
      chunks.push(step.value.subarray(0, Math.max(0, step.value.byteLength - (total - MAX_BYTES))));
      break;
    }
    chunks.push(step.value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

async function request(url, { method = "GET", headers = {}, body, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json, text/plain, */*", ...headers },
      body,
    });
    const read = await readBody(response);
    return {
      status: response.status,
      headers: headersOf(response),
      contentType: response.headers.get("content-type") || "",
      body: read.text,
      truncated: read.truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

function asEntry(result, extra = {}) {
  if (result.truncated) return { unobserved: true, status: result.status, detail: "response truncated" };
  return {
    status: result.status,
    contentType: result.contentType,
    headers: result.headers,
    body: result.body,
    ...extra,
  };
}

export async function probeOrigin(rawOrigin, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const allowLoopback = Boolean(options.allowLoopback);
  const url = assertPublicHttpUrl(rawOrigin, { allowLoopback });
  await assertPublicHost(url.hostname, { allowLoopback });
  const origin = url.origin;
  const errors = [];
  const responses = {};

  async function take(key, path, init) {
    try {
      const result = await request(`${origin}${path}`, { ...init, fetchImpl });
      responses[key] = asEntry(result, init.requestId ? { requestId: init.requestId } : {});
      if (result.truncated) errors.push(`${key} truncated`);
    } catch (error) {
      responses[key] = { unobserved: true };
      errors.push(`${key} ${error.name === "AbortError" ? "timed out" : error.message}`);
    }
  }

  await take("GET /llms.txt", "/llms.txt", { method: "GET" });
  await take("GET /robots.txt", "/robots.txt", { method: "GET" });
  await take("GET /.well-known/mcp.json", "/.well-known/mcp.json", { method: "GET" });
  await take("GET /.well-known/mcp-registry-auth", "/.well-known/mcp-registry-auth", { method: "GET" });
  await take("GET /.well-known/x402", "/.well-known/x402", { method: "GET" });
  await take("OPTIONS /mcp", "/mcp", {
    method: "OPTIONS",
    headers: {
      origin: "https://samedaydesk.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  await take("POST /mcp initialize", "/mcp", {
    method: "POST",
    requestId: RPC_INIT_ID,
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(INIT_BODY),
  });
  await take("POST /mcp tools/list", "/mcp", {
    method: "POST",
    requestId: RPC_TOOLS_ID,
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(TOOLS_BODY),
  });

  try {
    const card = await request(`${origin}/.well-known/agent-card.json`, { method: "GET", fetchImpl });
    const entry = asEntry(card);
    const location = card.headers.location || "";
    const followOffOrigin = options.followOffOrigin !== false;
    if (!card.truncated && card.status >= 300 && card.status < 400 && location) {
      try {
        const next = new URL(location);
        const sameOrigin = next.origin === origin;
        if (!sameOrigin && !followOffOrigin) {
          responses["GET /.well-known/agent-card.json"] = entry;
          return { origin, responses, errors, paid: false };
        }
        if (next.protocol === "https:") {
          await assertPublicHost(next.hostname, { allowLoopback });
          const followed = await request(next.toString(), { method: "GET", fetchImpl });
          entry.followed = asEntry(followed, { finalUrl: next.toString() });
        }
      } catch (error) {
        errors.push(`agent-card follow ${error.message}`);
      }
    }
    responses["GET /.well-known/agent-card.json"] = entry;
  } catch (error) {
    responses["GET /.well-known/agent-card.json"] = { unobserved: true };
    errors.push(`agent-card ${error.name === "AbortError" ? "timed out" : error.message}`);
  }

  return { origin, responses, errors, paid: false };
}

export async function probeKnownHosts(options = {}) {
  const hosts = [];
  for (const capture of knownCaptures()) {
    try {
      const probed = await probeOrigin(capture.origin, options);
      hosts.push({
        id: capture.id,
        label: capture.label,
        origin: capture.origin,
        role: capture.role,
        heldOut: false,
        errors: probed.errors,
        capture: {
          id: capture.id,
          label: capture.label,
          origin: capture.origin,
          role: capture.role,
          heldOut: false,
          responses: probed.responses,
        },
      });
    } catch (error) {
      hosts.push({
        id: capture.id,
        label: capture.label,
        origin: capture.origin,
        role: capture.role,
        errors: [error.message],
        capture: null,
      });
    }
  }
  return hosts;
}
