// Caller URL fetch. Credentials and Origin never leave the caller, including across redirects.
// Limits and private-address checks are the agent-readiness ones.
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { FETCH_TIMEOUT_MS, MAX_BODY_BYTES, MAX_REDIRECTS } from "../../../server/lib/agent-readiness/probe.js";
import { PublicHostError, resolvePublicAddresses } from "../../../server/lib/agent-readiness/ssrf.js";

export { FETCH_TIMEOUT_MS, MAX_BODY_BYTES, MAX_REDIRECTS, PublicHostError };

const ALWAYS_DROP = new Set(["authorization", "cookie", "cookie2", "proxy-authorization", "origin"]);

function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

export function outboundHeaders(input, { crossOrigin }) {
  const out = { accept: "application/json", "user-agent": "SameDayDeskTaskReadiness/1.0" };
  for (const [key, value] of Object.entries(input || {})) {
    const name = String(key).toLowerCase();
    if (ALWAYS_DROP.has(name)) continue;
    if (crossOrigin && name !== "accept") continue;
    if (name === "accept" || name === "content-type") out[name] = String(value);
  }
  delete out.authorization;
  delete out.cookie;
  delete out.origin;
  return out;
}

export function boundedTransport(url, options) {
  const lib = url.protocol === "https:" ? https : http;
  const headers = { ...options.headers };
  const method = options.method || "GET";
  if (options.body && method !== "GET" && method !== "HEAD") {
    headers["content-length"] = Buffer.byteLength(options.body);
  }
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
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
        const family = options.address.family === 6 ? 6 : 4;
        if (lookupOptions && lookupOptions.all) cb(null, [{ address: options.address.address, family }]);
        else cb(null, options.address.address, family);
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      let truncated = false;
      res.on("data", (chunk) => {
        if (size >= maxBytes) {
          truncated = true;
          res.destroy();
          return;
        }
        const room = maxBytes - size;
        chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
        size += Math.min(chunk.length, room);
        if (chunk.length > room) {
          truncated = true;
          res.destroy();
        }
      });
      const done = () => finish({
        status: res.statusCode || 0,
        headers: headerMap(res.headers),
        body: Buffer.concat(chunks).toString("utf8"),
        truncated,
      });
      res.on("end", done);
      res.on("error", done);
      res.on("close", done);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish({ status: 0, headers: {}, body: "", truncated: false }));
    if (options.body && method !== "GET" && method !== "HEAD") req.write(options.body);
    req.end();
  });
}

export async function fetchBounded(urlString, options = {}) {
  const lookup = options.lookup || dns.lookup;
  const transport = options.transport || boundedTransport;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let current;
  try {
    current = new URL(urlString);
  } catch {
    throw new PublicHostError("URL is not usable");
  }
  if (current.username || current.password) throw new PublicHostError("Credentials are not allowed");
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    throw new PublicHostError("Only http(s) URLs are supported");
  }
  let method = options.method || "GET";
  let body = options.body ?? null;
  const started = Date.now();
  const startOrigin = current.origin;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (Date.now() - started > timeoutMs) throw new PublicHostError("Fetch timed out");
    let addresses;
    try {
      addresses = await resolvePublicAddresses(current.hostname, lookup);
    } catch (err) {
      if (hop > 0 && err instanceof PublicHostError) {
        throw new PublicHostError("Redirect target is not a public address");
      }
      throw err;
    }
    const headers = outboundHeaders(options.headers, { crossOrigin: current.origin !== startOrigin });
    const res = await transport(current, {
      method,
      body: method === "GET" || method === "HEAD" ? null : body,
      headers,
      address: addresses[0],
      timeoutMs,
      maxBytes,
    });
    const location = res.headers?.location;
    if (res.status >= 300 && res.status < 400 && location && hop < maxRedirects) {
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new PublicHostError("Redirect left http(s)");
      if (next.username || next.password) throw new PublicHostError("Redirect included credentials");
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = null;
      }
      current = next;
      continue;
    }
    if (res.status >= 300 && res.status < 400 && location && hop >= maxRedirects) {
      throw new PublicHostError("Too many redirects");
    }
    return {
      status: res.status,
      headers: res.headers,
      body: res.body,
      truncated: Boolean(res.truncated),
      finalUrl: current.toString(),
      hops: hop,
    };
  }
  throw new PublicHostError("Too many redirects");
}
