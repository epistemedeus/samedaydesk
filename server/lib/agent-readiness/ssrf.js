// Public http(s) hosts only. Private, loopback, and link-local addresses are
// refused after DNS resolution, including every address a name returns.
import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

export class PublicHostError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicHostError";
    this.status = 400;
    this.code = "ssrf";
  }
}

const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function inCidr(ip, base, bits) {
  const addr = ipv4ToInt(ip);
  const network = ipv4ToInt(base);
  if (addr == null || network == null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (addr & mask) === (network & mask);
}

function ipv6Hextets(ip) {
  const lower = ip.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head.map((part) => parseInt(part || "0", 16));
  }
  const tail = halves[1] ? halves[1].split(":") : [];
  if (head.some((part) => part === "") || tail.some((part) => part === "")) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const all = [...head, ...Array(missing).fill("0"), ...tail];
  if (all.length !== 8) return null;
  return all.map((part) => parseInt(part, 16));
}

export function normalizeIp(ip) {
  const value = String(ip || "").trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!net.isIP(value)) return "";
  // Collapse IPv4-mapped IPv6 (including hex form) and canonicalize IPv6 so
  // textual equivalents cannot acquire different rate buckets.
  return ipaddr.process(value).toString();
}

export function isPrivateIp(ip) {
  const value = normalizeIp(ip);
  if (!value) return true;
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    return true;
  }
  if (net.isIPv4(value) || ipv4ToInt(value) != null) {
    const ranges = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return ranges.some(([base, bits]) => inCidr(value, base, bits));
  }
  if (net.isIPv6(value)) {
    const hextets = ipv6Hextets(value);
    if (!hextets || hextets.some((n) => Number.isNaN(n))) return true;
    const first = hextets[0];
    if (hextets.every((n) => n === 0)) return true;
    if (hextets.slice(0, 7).every((n) => n === 0) && hextets[7] === 1) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xff00) === 0xff00) return true;
    if (first === 0x2001 && hextets[1] === 0x0db8) return true;
    return false;
  }
  return true;
}

export function assertPublicHostname(hostname) {
  const host = String(hostname || "").trim().replace(/\.$/, "").toLowerCase();
  if (!host || host.includes(" ") || host.includes("@")) {
    throw new PublicHostError("Enter a public host such as example.com");
  }
  if (
    BLOCKED_NAMES.has(host)
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
  ) {
    throw new PublicHostError("That host is not a public address");
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new PublicHostError("That host is not a public address");
  }
  return host;
}

export async function resolvePublicAddresses(hostname, lookup = dns.lookup) {
  const host = assertPublicHostname(hostname);
  if (net.isIP(host)) {
    return [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  }
  let addrs;
  let timer;
  const looked = lookup(host, { all: true, verbatim: true }).then(
    (value) => ({ ok: true, value }),
    (err) => ({ ok: false, err }),
  );
  try {
    const outcome = await Promise.race([
      looked,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("dns timeout")), 4000);
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);
    if (!outcome.ok) throw outcome.err;
    addrs = outcome.value;
  } catch (err) {
    if (err instanceof PublicHostError) throw err;
    throw new PublicHostError("Could not resolve that host");
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(addrs) || addrs.length === 0) {
    throw new PublicHostError("Could not resolve that host");
  }
  for (const entry of addrs) {
    if (!entry?.address || isPrivateIp(entry.address)) {
      throw new PublicHostError("That host is not a public address");
    }
  }
  return addrs.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));
}

// ---- Bounded public fetch (shared): every hop is re-validated ----
// Redirects are followed manually so each Location is checked against the
// public-host guard and the caller's origin policy before it is requested.
export const FETCH_FAILURE = Object.freeze({
  OFF_ORIGIN_REDIRECT: "off_origin_redirect",
  TOO_MANY_REDIRECTS: "too_many_redirects",
  BAD_REDIRECT: "bad_redirect",
  NOT_HTTP: "not_http",
});

export class BoundedFetchError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "BoundedFetchError";
    this.code = code;
    this.status = 502;
    Object.assign(this, detail);
  }
}

/** Parse and guard a URL: http(s), no credentials, host resolves only to public addresses. */
export async function assertPublicUrl(raw, lookup = dns.lookup) {
  let u;
  try { u = raw instanceof URL ? new URL(raw.toString()) : new URL(String(raw)); }
  catch { throw new PublicHostError("That doesn't look like a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new BoundedFetchError(FETCH_FAILURE.NOT_HTTP, "Only http(s) URLs are supported", { url: u.toString() });
  }
  if (u.username || u.password) throw new PublicHostError("URLs with credentials are not allowed");
  await resolvePublicAddresses(u.hostname, lookup);
  return u;
}

const stripWww = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/**
 * fetchPublicBounded(url, opts)
 *  - allowedOrigin: every hop must stay on this exact origin (string) or
 *  - allowHostVariants: true lets a hop change scheme or toggle "www." on the same host
 *  - maxRedirects, maxBytes, timeoutMs, headers
 * Returns { ok, status, finalUrl, body, redirects: [url...], oversize, headers }.
 */
export async function fetchPublicBounded(url, opts = {}) {
  const {
    allowedOrigin = null,
    allowHostVariants = false,
    maxRedirects = 3,
    maxBytes = 2_500_000,
    timeoutMs = 10_000,
    headers = {},
    lookup = dns.lookup,
  } = opts;
  let current = await assertPublicUrl(url, lookup);
  const startHost = stripWww(current.hostname);
  const redirects = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  try {
    for (let hop = 0; ; hop += 1) {
      const res = await fetch(current.toString(), { signal: ctrl.signal, redirect: "manual", headers });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop >= maxRedirects) {
          throw new BoundedFetchError(FETCH_FAILURE.TOO_MANY_REDIRECTS, "Too many redirects", { url: current.toString(), redirects });
        }
        let next;
        try { next = new URL(res.headers.get("location"), current); }
        catch { throw new BoundedFetchError(FETCH_FAILURE.BAD_REDIRECT, "Invalid redirect", { url: current.toString() }); }
        const sameOrigin = allowedOrigin ? next.origin === allowedOrigin : true;
        const variantOk = allowHostVariants && stripWww(next.hostname) === startHost;
        if (allowedOrigin ? !sameOrigin : (!variantOk && next.hostname !== current.hostname)) {
          throw new BoundedFetchError(FETCH_FAILURE.OFF_ORIGIN_REDIRECT, "Redirect left the site origin", {
            url: current.toString(), location: next.toString(), redirects,
          });
        }
        next = await assertPublicUrl(next, lookup);
        redirects.push(next.toString());
        current = next;
        continue;
      }
      let body = "";
      let oversize = false;
      if (res.body) {
        const chunks = [];
        let total = 0;
        for await (const chunk of res.body) {
          total += chunk.length;
          if (total > maxBytes) { oversize = true; chunks.push(Buffer.from(chunk).subarray(0, maxBytes - (total - chunk.length))); break; }
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      return { ok: res.ok, status: res.status, finalUrl: current.toString(), body, redirects, oversize, headers: res.headers };
    }
  } finally {
    clearTimeout(timer);
  }
}
