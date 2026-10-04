import net from "node:net";
import proxyaddr from "proxy-addr";
import { normalizeIp } from "./ssrf.js";

const buckets = new Map();

export class RateLimitError extends Error {
  constructor(retryAfterSec) {
    super(`Too many checks from this client. Retry in ${retryAfterSec}s.`);
    this.name = "RateLimitError";
    this.status = 429;
    this.code = "rate_limit";
    this.retryAfterSec = retryAfterSec;
  }
}

export const TRUSTED_PROXIES_ENV = "AGENT_READINESS_TRUSTED_PROXIES";
let cachedPolicy;
let cachedTrust;

function trustedProxyPolicy(raw) {
  if (raw === cachedPolicy) return cachedTrust;
  cachedPolicy = raw;
  cachedTrust = null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ranges = raw.split(",").map(value => value.trim());
  // Literal IPs/CIDRs only. No trust-all, named private ranges, or hop counts.
  // Invalid configuration fails closed rather than trusting a partial list.
  for (const range of ranges) {
    const [address, bits, extra] = range.split("/");
    const family = net.isIP(address);
    if (!family || address.includes("%") || extra !== undefined) return null;
    if (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (family === 4 ? 32 : 128))) return null;
  }
  try { cachedTrust = proxyaddr.compile(ranges); } catch { /* fail closed */ }
  return cachedTrust;
}

export function clientKey(req) {
  // req.ip may already have been derived from a different Express trust policy.
  // The socket peer is this boundary's authority; missing peer stays unknown.
  const peer = normalizeIp(req?.socket?.remoteAddress || "");
  const fallback = `peer:${peer || "unknown"}`;
  const trust = trustedProxyPolicy(process.env[TRUSTED_PROXIES_ENV]);
  if (!peer || !trust || !trust(peer)) return fallback;
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.length > 4096) return fallback;
  const hops = forwarded.split(",").map(value => value.trim());
  if (hops.length > 32 || hops.some(value => !net.isIP(value) || value.includes("%"))) return fallback;
  const addresses = hops.map(normalizeIp);
  let client = peer;
  // Walk from the authenticated connection outward. Stop at the nearest
  // untrusted address; caller-supplied prefixes to its left are never authority.
  for (let i = addresses.length - 1; i >= 0 && trust(client); i--) client = addresses[i];
  return `xff:${client}`;
}

export const AGENT_READINESS_RATE_LIMIT_DEFAULT = 12;
export const AGENT_READINESS_RATE_WINDOW_MS_DEFAULT = 10 * 60 * 1000;

export function consumeClient(key, now = Date.now()) {
  const limit = Number(process.env.AGENT_READINESS_RATE_LIMIT || AGENT_READINESS_RATE_LIMIT_DEFAULT);
  const windowMs = Number(process.env.AGENT_READINESS_RATE_WINDOW_MS || AGENT_READINESS_RATE_WINDOW_MS_DEFAULT);
  const id = String(key || "unknown");
  let bucket = buckets.get(id);
  if (!bucket || now >= bucket.reset) {
    if (buckets.size > 5000) buckets.clear();
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((bucket.reset - now) / 1000)));
  }
  return { remaining: limit - bucket.count, reset: bucket.reset };
}

export function resetRateLimits() {
  buckets.clear();
}
