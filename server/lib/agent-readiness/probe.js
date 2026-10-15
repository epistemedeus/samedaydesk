// Fetches the fixed discovery paths, follows MCP links named by those files,
// and speaks only initialize, tools/list, and one unknown-tool call.
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { LATEST_MCP_VERSION } from "./checks.js";
import { classifyRetrieval } from "./retrieval.js";
import { discoverMcpLinks, needsWwwFallback, parseLlmsTxt } from "./discovery.js";
import { PROBE_PATHS } from "./probeScript.js";
import { PublicHostError, assertPublicHostname, assertPublicUrl, isPrivateIp, normalizeIp, resolvePublicAddresses } from "./ssrf.js";
import { createRequestBudget } from "./request-budget.js";

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

export async function rawExchange(url, options = {}) {
  const method = options.method || "GET";
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const address = options.address?.address;
  const empty = (error) => ({ status: 0, headers: {}, body: "", error });
  let hostname;
  try {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return empty("connection");
    hostname = assertPublicHostname(url.hostname);
    // Validate before opening any resource. An IP URL skips Node's lookup hook;
    // it must neither bypass admission nor substitute a different pinned IP.
    if (!net.isIP(address || "") || isPrivateIp(address)
      || (net.isIP(hostname) && normalizeIp(hostname) !== normalizeIp(address))) return empty("connection");
  } catch { return empty("connection"); }
  if (options.signal?.aborted) return empty("aborted");

  const lib = url.protocol === "https:" ? https : http;
  const headers = { accept: "*/*", "user-agent": USER_AGENT };
  for (const [key, value] of Object.entries(options.headers || {})) {
    const name = key.toLowerCase();
    if (!BLOCKED_REQUEST_HEADERS.has(name)) headers[name] = value;
  }
  headers["user-agent"] = USER_AGENT;
  headers.host = url.host; // logical authority, never the numeric socket target
  if (options.body && method !== "GET" && method !== "HEAD") headers["content-length"] = Buffer.byteLength(options.body);

  // One agent/socket per admitted hop. A global pooled connection is keyed by
  // hostname, not the admission, and could bypass a later address decision.
  const agent = new lib.Agent({ keepAlive: false, maxSockets: 1 });
  const budget = createRequestBudget(options.timeoutMs ?? FETCH_TIMEOUT_MS, options.signal);
  if (budget.exhausted) { budget.dispose(); agent.destroy(); return empty(options.signal?.aborted ? "aborted" : "timeout"); }
  return new Promise((resolve) => {
    let req;
    let response;
    let socket;
    let requestClosed = false;
    let socketClosed = false;
    let result;
    let size = 0;
    const chunks = [];
    const complete = () => {
      if (result && requestClosed && (!socket || socketClosed)) resolve(result);
    };
    const finish = (value) => {
      if (result) return;
      result = value;
      budget.signal.removeEventListener("abort", onAbort);
      budget.dispose();
      // Resolve only after the owned request AND socket have closed, including
      // redirects, rejected bodies, byte caps, connect/TLS errors and aborts.
      response?.destroy();
      req?.destroy();
      agent.destroy();
      if (!req) requestClosed = true;
      complete();
    };
    const snapshot = (extra = {}) => ({
      status: response?.statusCode || 0,
      headers: headerMap(response?.headers),
      body: Buffer.concat(chunks, size).toString("utf8"),
      ...extra,
    });
    const onAbort = () => finish(snapshot({ error: options.signal?.aborted ? "aborted" : "timeout" }));
    budget.signal.addEventListener("abort", onAbort, { once: true });
    try {
      req = lib.request({
        protocol: url.protocol,
        // Connect to the admitted numeric address. No DNS callback or fallback
        // resolver runs at connect time. TLS still verifies the URL's identity.
        hostname: address,
        family: net.isIP(address),
        autoSelectFamily: false,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method, headers, agent,
        ...(url.protocol === "https:" ? { servername: net.isIP(hostname) ? "" : hostname } : {}),
      }, (res) => {
        response = res;
        res.on("error", () => finish(snapshot({ error: "connection" })));
        res.on("end", () => finish(snapshot()));
        res.on("close", () => {
          if (!res.complete) finish(snapshot({ error: "connection" }));
        });
        // Metadata only: do not wait on, retain or relay redirect/error bodies,
        // including a final redirect at the hop limit or a never-ending 404.
        if (res.statusCode >= 300) {
          finish({ status: res.statusCode, headers: headerMap(res.headers), body: "", disposed: true });
          return;
        }
        res.on("data", (chunk) => {
          const room = Math.max(0, maxBytes - size);
          const kept = chunk.subarray(0, room);
          chunks.push(kept); size += kept.length;
          if (chunk.length > room) finish(snapshot({ truncated: true }));
        });
      });
      req.on("socket", (s) => {
        socket = s;
        s.once("close", () => { socketClosed = true; complete(); });
        if (result) s.destroy();
      });
      req.on("close", () => {
        requestClosed = true;
        if (!result) finish(snapshot({ error: "connection" }));
        complete();
      });
      req.on("error", () => finish(snapshot({ error: "connection" })));
      if (options.body && method !== "GET" && method !== "HEAD") req.write(options.body);
      req.end();
    } catch {
      finish(snapshot({ error: "connection" }));
    }
  });
}

export async function guardedExchange(urlString, options = {}) {
  const raw = options.rawExchange || rawExchange;
  const budget = createRequestBudget(options.timeoutMs ?? FETCH_TIMEOUT_MS, options.signal);
  let current;
  let method = options.method || "GET";
  let body = options.body ?? null;
  const redirects = [];
  try {
    current = new URL(urlString);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let addresses;
      try {
        ({ url: current, addresses } = await assertPublicUrl(current, options.lookup, { signal: budget.signal }));
      } catch (err) {
        if (budget.exhausted) return { status: 0, headers: {}, body: "", error: options.signal?.aborted ? "aborted" : "timeout", finalUrl: current.toString(), ...(redirects.length ? { redirects } : {}) };
        if (hop > 0 && err instanceof PublicHostError) throw new PublicHostError("Redirect target is not a public address");
        throw err;
      }
      const res = await raw(current, { ...options, method, body, address: addresses[0], signal: budget.signal, timeoutMs: Math.max(1, budget.remaining()), discardRedirectBody: true });
      const location = res.headers?.location;
      if (!res.error && res.status >= 300 && res.status < 400 && location && hop < MAX_REDIRECTS) {
        const next = new URL(location, current);
        if (next.protocol !== "http:" && next.protocol !== "https:") throw new PublicHostError("Redirect left http(s)");
        if (next.username || next.password) throw new PublicHostError("Redirect included credentials");
        redirects.push({ status: res.status, location: redirectLocation(current, next) });
        if (res.status !== 307 && res.status !== 308) { method = "GET"; body = null; }
        current = next;
        continue;
      }
      return { ...res, ...(budget.exhausted ? { error: options.signal?.aborted ? "aborted" : "timeout" } : {}), finalUrl: current.toString(), ...(redirects.length ? { redirects } : {}) };
    }
    throw new PublicHostError("Too many redirects");
  } finally { budget.dispose(); }
}

function redirectLocation(fromUrl, nextUrl) {
  const port = (url) => url.port || (url.protocol === "https:" ? "443" : "80");
  const same = nextUrl.hostname === fromUrl.hostname
    && nextUrl.protocol === fromUrl.protocol
    && port(nextUrl) === port(fromUrl);
  if (same) return `${nextUrl.pathname}${nextUrl.search}`;
  return nextUrl.toString();
}

function toResponse(got) {
  const headers = headerMap(got?.headers);
  const entry = { status: Number(got?.status) || 0, headers };
  if (headers["content-type"]) entry.contentType = headers["content-type"];
  const rawBody = got?.body == null ? "" : String(got.body);
  const bodyBytes = Buffer.from(rawBody, "utf8");
  if (rawBody) entry.body = bodyBytes.subarray(0, MAX_BODY_BYTES).toString("utf8");
  if (got?.truncated || bodyBytes.length > MAX_BODY_BYTES) entry.truncated = true;
  if (got?.error) entry.error = String(got.error);
  if (Array.isArray(got?.redirects)) {
    const redirects = got.redirects
      .filter((hop) => hop && typeof hop.status === "number" && typeof hop.location === "string" && hop.location)
      .map((hop) => ({ status: hop.status, location: hop.location }));
    if (redirects.length) entry.redirects = redirects;
  }
  if (typeof got?.finalUrl === "string" && got.finalUrl) entry.finalUrl = got.finalUrl;
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
  if (classifyRetrieval(got).kind !== "retrieved") return undefined;
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
  const lookup = deps.lookup;
  const exchange = deps.exchange || ((url, options) => guardedExchange(url, { ...options, lookup, rawExchange: deps.rawExchange }));
  const input = normalizeHostInput(raw);
  let host = input.host;
  const protocol = input.protocol;
  await resolvePublicAddresses(host, lookup);

  const authority = () => net.isIP(host) === 6 ? `[${host}]` : host;
  const root = await exchange(`${protocol}://${authority()}/`, { method: "GET" });
  let wwwFallback;
  let redirectedToWww = false;
  try {
    redirectedToWww = new URL(root.finalUrl || "").hostname === `www.${host}`;
  } catch {
    redirectedToWww = false;
  }
  if (!net.isIP(host) && !host.startsWith("www.") && (redirectedToWww || needsWwwFallback(host, { status: root.status, body: root.body }))) {
    const next = `www.${host}`;
    await resolvePublicAddresses(next, lookup);
    wwwFallback = { from: host, to: next };
    host = next;
  }

  const base = `${protocol}://${authority()}`;
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
