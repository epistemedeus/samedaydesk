import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { USER_AGENT } from "./constants.mjs";
import { PublicHostError, addressBlocked, assertPublicUrl } from "./public-host.mjs";

const HOP_LIMIT = 2;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 20_000;

function headerMap(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const name = key.toLowerCase();
    if (name === "set-cookie" || name === "cookie") continue;
    out[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

export async function resolvePublic(hostname, lookup = dns.lookup) {
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new PublicHostError("dns_failed", "Could not resolve that host");
  }
  if (!Array.isArray(records) || records.length === 0) throw new PublicHostError("dns_failed", "Could not resolve that host");
  for (const record of records) {
    if (!record?.address || addressBlocked(record.address)) throw new PublicHostError("address_refused", "That host is not a public address");
  }
  return records.map((record) => ({ address: record.address, family: record.family === 6 ? 6 : 4 }));
}

function nodeTransport(url, { address, timeoutMs, maxBytes }) {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { accept: "application/json, application/yaml, text/plain, */*", "user-agent": USER_AGENT },
      servername: url.hostname,
      timeout: timeoutMs,
      lookup(_hostname, options, callback) {
        if (typeof options === "function") {
          callback = options;
          options = {};
        }
        if (options && options.all) callback(null, [{ address: address.address, family: address.family }]);
        else callback(null, address.address, address.family);
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
        const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
        chunks.push(slice);
        size += slice.length;
        if (chunk.length > room) {
          truncated = true;
          res.destroy();
        }
      });
      const done = () => resolve({
        status: res.statusCode || 0,
        headers: headerMap(res.headers),
        body: Buffer.concat(chunks),
        truncated,
      });
      res.on("end", done);
      res.on("error", done);
      res.on("close", done);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0), truncated: false }));
    req.end();
  });
}

export async function probePublic(urlString, options = {}) {
  const lookup = options.lookup || dns.lookup;
  const transport = options.transport || nodeTransport;
  const maxRedirects = options.maxRedirects ?? HOP_LIMIT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const hops = [];
  let current = assertPublicUrl(urlString);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const addresses = await resolvePublic(current.hostname, lookup);
    const response = await transport(current, { address: addresses[0], timeoutMs, maxBytes, hop });
    hops.push({ url: current.href, status: response.status });
    if (response.truncated) throw new PublicHostError("body_truncated", "Response exceeded the byte limit");
    const location = response.headers?.location;
    const redirect = response.status >= 300 && response.status < 400;
    if (!redirect) {
      return {
        finalUrl: current.href,
        status: response.status,
        contentType: response.headers?.["content-type"] || "",
        body: response.body,
        hops,
      };
    }
    if (!location || hop === maxRedirects) throw new PublicHostError("redirect_refused", "Redirect was not followed");
    const next = assertPublicUrl(new URL(location, current).href);
    if (next.protocol === "http:" && current.protocol === "https:") {
      throw new PublicHostError("redirect_downgrade", "HTTPS downgrade was refused");
    }
    current = next;
  }
  throw new PublicHostError("redirect_refused", "Redirect was not followed");
}
