import type { Request } from "express";
import { ApiError } from "./errors.js";
import { hashToken } from "./crypto.js";
import type { ServiceConfig } from "./config.js";
import type { EarnedWorkStore } from "./store/types.js";
import type { ContributorPrincipal } from "./types.js";

export type AuthedRequest = Request & {
  contributor?: ContributorPrincipal;
  bearerToken?: string;
};

export function readBearer(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

export async function requireContributor(
  req: AuthedRequest,
  store: EarnedWorkStore,
): Promise<ContributorPrincipal> {
  const token = readBearer(req);
  if (!token) throw new ApiError(401, "unauthorized", "invalid grant");
  const principal = await store.findContributorByTokenHash(hashToken(token));
  if (!principal) throw new ApiError(401, "unauthorized", "invalid grant");
  req.contributor = principal;
  req.bearerToken = token;
  return principal;
}

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(config: ServiceConfig, maxBuckets = 10_000, clock = Date.now) {
  const buckets = new Map<string, Bucket>();
  let nextSweep = 0;
  return function rateLimit(key: string): void {
    const now = clock();
    if (now >= nextSweep) {
      for (const [id, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(id);
      }
      nextSweep = now + config.rateLimitWindowMs;
    }
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && buckets.size >= maxBuckets) {
        throw new ApiError(429, "rate_limited", "rate limit capacity reached");
      }
      buckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
      return;
    }
    current.count += 1;
    if (current.count > config.rateLimitMax) {
      throw new ApiError(429, "rate_limited", "rate limit exceeded");
    }
  };
}
