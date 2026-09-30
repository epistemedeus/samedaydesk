import type { Request } from "express";
import { ApiError } from "./errors.js";
import { hashToken } from "./crypto.js";
import type { ServiceConfig } from "./config.js";
import type { CorrespondenceStore } from "./store/types.js";
import type { ActiveGrant } from "./types.js";

export type AuthedRequest = Request & {
  grant?: ActiveGrant;
  bearerToken?: string;
};

export function readBearer(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

export async function requireGrant(
  req: AuthedRequest,
  store: CorrespondenceStore,
  roles?: Array<ActiveGrant["role"]>,
): Promise<ActiveGrant> {
  const token = readBearer(req);
  if (!token) throw new ApiError(401, "unauthorized", "invalid grant");
  const grant = await store.findActiveGrantByTokenHash(hashToken(token));
  if (!grant) throw new ApiError(401, "unauthorized", "invalid grant");
  if (roles && !roles.includes(grant.role)) {
    throw new ApiError(403, "forbidden", "insufficient scope");
  }
  req.grant = grant;
  req.bearerToken = token;
  return grant;
}

export function requireProjectAccess(grant: ActiveGrant, projectId: string): void {
  if (grant.projectId !== projectId) {
    throw new ApiError(404, "not_found", "project not found");
  }
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
