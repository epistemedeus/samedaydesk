// Fetches the fixed discovery paths, follows MCP links named by those files,
// and speaks only initialize, tools/list, and one unknown-tool call.
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { LATEST_MCP_VERSION } from "./checks.js";
import { discoverMcpLinks, needsWwwFallback, parseLlmsTxt } from "./discovery.js";
import { PROBE_PATHS } from "./probeScript.js";
import { PublicHostError, assertPublicHostname, resolvePublicAddresses } from "./ssrf.js";

export const FETCH_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 200_000;
export const MAX_REDIRECTS = 3;
export const MAX_LINKED_CATALOGS = 4;
export const MAX_LINKED_ENDPOINTS = 8;
export const UNKNOWN_TOOL_NAME = "__definitely_not_a_tool__";
export const USER_AGENT = "SameDayDeskAgentReadiness/1.0 (+https://samedaydesk.com/agent-readiness)";

const BLOCKED_REQUEST_HEADERS = new Set(["authorization", "cookie", "cookie2", "proxy-authorization"]);

export function normalizeHostInput(raw) {
  let text = String(raw || "").trim();
  if (!text) throw new PublicHostError("Enter a public host such as example.com");
  if (/[\s]/.test(text)) throw new PublicHostError("Enter a public host such as example.com");
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new PublicHostError("Enter a public host such as example.com");
  }
  if (url.username || url.password) throw new PublicHostError("Credentials are not allowed");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicHostError("Only http(s) hosts are supported");
  }
  const host = assertPublicHostname(url.hostname);
  return { host, protocol: url.protocol.replace(":", "") };
}

export function mcpRpcBody(kind) {
  if (kind === "initialize") {
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_MCP_VERSION,
        capabilities: {},
        clientInfo: { name: "samedaydesk-agent-readiness", version: "1" },
      },
    };
  }
  if (kind === "tools/list") {
    return { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
  }
  if (kind === "unknown") {
    return {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: UNKNOWN_TOOL_NAME, arguments: {} },
    };
  }
  throw new Error("refusing MCP method");
}

function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

export function rawExchange(url, options = {}) {
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const address = options.address;
  const lib = url.protocol === "https:" ? https : http;
  const headers = {
    accept: "*/*",
    "user-agent": USER_AGENT,
  };
  for (const [key, value] of Object.entries(options.headers || {})) {
    const name = key.toLowerCase();
    if (BLOCKED_REQUEST_HEADERS.has(name)) continue;
    headers[name] = value;
  }
  headers["user-agent"] = USER_AGENT;
  if (options.body && method !== "GET" && method !== "HEAD") {
    headers["content-length"] = Buffer.byteLength(options.body);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      servername: url.hostname,
      timeout: timeoutMs,
      lookup(_hostname, lookupOptions, cb) {
        if (typeof lookupOptions === "function") {
          cb = lookupOptions;
          lookupOptions = {};
        }
        if (!address) {
          cb(new Error("missing pinned address"));
          return;
        }
        const family = address.family === 6 ? 6 : 4;
        if (lookupOptions && lookupOptions.all) cb(null, [{ address: address.address, family }]);
        else cb(null, address.address, family);
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        if (size >= maxBytes) return;
        const room = maxBytes - size;
        chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
        size += Math.min(chunk.length, room);
        if (chunk.length > room) res.destroy();
      });
      const done = () => finish({
        status: res.statusCode || 0,
        headers: headerMap(res.headers),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.on("end", done);
      res.on("error", done);
      res.on("close", done);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish({ status: 0, headers: {}, body: "" }));
    if (options.body && method !== "GET" && method !== "HEAD") req.write(options.body);
    req.end();
  });
}

export async function guardedExchange(urlString, options = {}) {
  const lookup = options.lookup || dns.lookup;
  const raw = options.rawExchange || rawExchange;
  let current = new URL(urlString);
  let method = options.method || "GET";
  let body = options.body ?? null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let addresses;
    try {
      addresses = await resolvePublicAddresses(current.hostname, lookup);
    } catch (err) {
      if (hop > 0 && err instanceof PublicHostError) {
        throw new PublicHostError("Redirect target is not a public address");
      }
      throw err;
    }
    const res = await raw(current, { ...options, method, body, address: addresses[0] });
    const location = res.headers?.location;
    if (res.status >= 300 && res.status < 400 && location && hop < MAX_REDIRECTS) {
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new PublicHostError("Redirect left http(s)");
      }
      if (next.username || next.password) throw new PublicHostError("Redirect included credentials");
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = null;
      }
      current = next;
      continue;
    }
    return { ...res, finalUrl: current.toString() };
  }
  throw new PublicHostError("Too many redirects");
}

function toResponse(got) {
  const headers = headerMap(got?.headers);
  const entry = { status: Number(got?.status) || 0, headers };
  if (headers["content-type"]) entry.contentType = headers["content-type"];
  if (got?.body) entry.body = String(got.body).slice(0, MAX_BODY_BYTES);
  return entry;
}

function parseRpc(text) {
  if (!text) return undefined;
  for (const line of String(text).split(/\r?\n/)) {
    let trimmed = line.trim();
    if (trimmed.startsWith("data:")) trimmed = trimmed.slice(5).trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      /* keep scanning */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function rpc(exchange, url, kind) {
  const body = mcpRpcBody(kind);
  if (body.method === "tools/call" && body.params?.name !== UNKNOWN_TOOL_NAME) {
    throw new Error("refusing to call a real MCP tool");
  }
  if (!["initialize", "tools/list", "tools/call"].includes(body.method)) {
    throw new Error("refusing MCP method");
  }
  let got;
  try {
    got = await exchange(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof PublicHostError) throw err;
    return undefined;
  }
  return parseRpc(got?.body);
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function readPath(exchange, url) {
  try {
    return toResponse(await exchange(url, { method: "GET" }));
  } catch (err) {
    if (err instanceof PublicHostError) return { status: 0, headers: {} };
    throw err;
  }
}

async function readPreflight(exchange, url) {
  try {
    const got = await exchange(url, {
      method: "OPTIONS",
      headers: {
        origin: "https://samedaydesk.com",
        "access-control-request-method": "GET",
      },
    });
    return { status: Number(got.status) || 0, headers: headerMap(got.headers) };
  } catch (err) {
    if (err instanceof PublicHostError) return { status: 0, headers: {} };
    throw err;
  }
}

export async function probeHost(raw, deps = {}) {
  const lookup = deps.lookup || dns.lookup;
  const exchange = deps.exchange || ((url, options) => guardedExchange(url, { ...options, lookup, rawExchange: deps.rawExchange }));
  const input = normalizeHostInput(raw);
  let host = input.host;
  const protocol = input.protocol;
  await resolvePublicAddresses(host, lookup);

  const root = await exchange(`${protocol}://${host}/`, { method: "GET" });
  let wwwFallback;
  let redirectedToWww = false;
  try {
    redirectedToWww = new URL(root.finalUrl || "").hostname === `www.${host}`;
  } catch {
    redirectedToWww = false;
  }
  if (!host.startsWith("www.") && (redirectedToWww || needsWwwFallback(host, { status: root.status, body: root.body }))) {
    const next = `www.${host}`;
    await resolvePublicAddresses(next, lookup);
    wwwFallback = { from: host, to: next };
    host = next;
  }

  const base = `${protocol}://${host}`;
  const responses = {};
  const corsPreflight = {};
  await mapPool(PROBE_PATHS, 4, async (probePath) => {
    responses[probePath] = await readPath(exchange, `${base}${probePath}`);
    corsPreflight[probePath] = await readPreflight(exchange, `${base}${probePath}`);
  });

  const bundle = {
    schema: "agent-readiness.probe.v1",
    host,
    probedAt: new Date().toISOString(),
    responses,
    corsPreflight,
    ...(wwwFallback ? { wwwFallback } : {}),
  };

  const own = `${base}/mcp`;
  try {
    const initialize = await rpc(exchange, own, "initialize");
    if (initialize) {
      bundle.mcp = {
        url: own,
        offeredVersion: LATEST_MCP_VERSION,
        initialize,
        toolsList: await rpc(exchange, own, "tools/list"),
        unknownToolCall: await rpc(exchange, own, "unknown"),
      };
    }
  } catch (err) {
    if (!(err instanceof PublicHostError)) throw err;
  }

  const llms = responses["/llms.txt"];
  if (llms && llms.status >= 200 && llms.status < 300 && llms.body) {
    const catalogs = parseLlmsTxt(llms.body, host).links.filter((link) => link.kind === "catalog").slice(0, MAX_LINKED_CATALOGS);
    if (catalogs.length) {
      bundle.linkedResponses = {};
      for (const catalog of catalogs) {
        bundle.linkedResponses[catalog.url] = await readPath(exchange, catalog.url);
      }
    }
  }

  const ownNorm = own.replace(/\/$/, "");
  const discovered = discoverMcpLinks(bundle).filter((link) => link.kind === "endpoint");
  const self = discovered.find((link) => link.url.replace(/\/$/, "") === ownNorm);
  if (self && bundle.mcp) bundle.mcp.foundVia = self.sources;

  for (const link of discovered.filter((item) => item.url.replace(/\/$/, "") !== ownNorm).slice(0, MAX_LINKED_ENDPOINTS)) {
    const entry = {
      url: link.url,
      offeredVersion: LATEST_MCP_VERSION,
      foundVia: link.sources,
    };
    try {
      const initialize = await rpc(exchange, link.url, "initialize");
      entry.initialize = initialize;
      if (initialize) {
        entry.toolsList = await rpc(exchange, link.url, "tools/list");
        entry.unknownToolCall = await rpc(exchange, link.url, "unknown");
      }
    } catch (err) {
      if (!(err instanceof PublicHostError)) throw err;
    }
    (bundle.linkedMcp ??= []).push(entry);
  }

  return bundle;
}
