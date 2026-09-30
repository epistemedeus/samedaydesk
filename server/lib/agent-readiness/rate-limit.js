import { isPrivateIp, normalizeIp } from "./ssrf.js";

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

export function clientKey(req) {
  const peer = normalizeIp(req?.socket?.remoteAddress || req?.ip || "");
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded && isPrivateIp(peer)) return `xff:${forwarded.slice(0, 80)}`;
  return `peer:${peer || "unknown"}`;
}

export function consumeClient(key, now = Date.now()) {
  const limit = Number(process.env.AGENT_READINESS_RATE_LIMIT || 12);
  const windowMs = Number(process.env.AGENT_READINESS_RATE_WINDOW_MS || 10 * 60 * 1000);
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
