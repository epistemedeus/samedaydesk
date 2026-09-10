import {
  ERROR_CODES,
  FEED_SCHEMA,
  FORBIDDEN_FIELDS,
  JOIN_SCHEMA,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function joinError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

export function rejectForbidden(obj, path = "") {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rejectForbidden(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_FIELDS.includes(key)) {
      const isRevenue =
        /revenue|earned|synthetic|forecast|projectedSales|fakeEarnings|conversionCount|conversionRate|buyerCount|liveClicks|realTraffic/i.test(
          key,
        );
      const isIntent =
        /intent|clickIsConversion|activationIsConversion|qualifiedLead|hotLead/i.test(
          key,
        );
      throw joinError(
        isRevenue
          ? ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE
          : isIntent
            ? ERROR_CODES.FORBIDDEN_INTENT
            : ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden field: ${key}`,
        { path: here, field: key },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

export function validateFeed(feed) {
  if (!isPlainObject(feed)) {
    throw joinError(ERROR_CODES.INVALID_INPUT, "feed must be an object");
  }
  rejectForbidden(feed);
  if (feed.schema !== FEED_SCHEMA) {
    throw joinError(
      ERROR_CODES.INVALID_INPUT,
      `feed.schema must be ${FEED_SCHEMA}`,
      { got: feed.schema ?? null },
    );
  }
  if (feed.status === "rejected") {
    throw joinError(
      ERROR_CODES.REJECTED_FEED,
      feed.error?.message || "feed status is rejected",
      { error: feed.error || null },
    );
  }
  if (!Array.isArray(feed.repairRecommendations)) {
    throw joinError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "feed.repairRecommendations required",
      { missing: ["repairRecommendations"] },
    );
  }
  return feed;
}

export function validateJoinResult(result) {
  if (!isPlainObject(result)) {
    throw joinError(ERROR_CODES.INVALID_INPUT, "join result must be an object");
  }
  rejectForbidden(result);
  if (result.schema !== JOIN_SCHEMA) {
    throw joinError(
      ERROR_CODES.INVALID_INPUT,
      `schema must be ${JOIN_SCHEMA}`,
      { got: result.schema ?? null },
    );
  }
  if (!Array.isArray(result.gaps)) {
    throw joinError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "gaps[] required (explicit, even if empty)",
      { missing: ["gaps"] },
    );
  }
  if (result.claims?.conversionFromClick === true) {
    throw joinError(
      ERROR_CODES.FORBIDDEN_INTENT,
      "conversionFromClick claim forbidden",
    );
  }
  if (result.claims?.revenueFromListPrice === true) {
    throw joinError(
      ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
      "revenueFromListPrice claim forbidden",
    );
  }
  const denies = result.claims?.denies;
  if (!Array.isArray(denies) || !denies.includes("invented_revenue")) {
    throw joinError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "claims.denies must include invented_revenue",
      { missing: ["claims.denies"] },
    );
  }
  if (
    result.diagnosis?.status === "unavailable" &&
    Object.prototype.hasOwnProperty.call(result.diagnosis, "activationCount")
  ) {
    throw joinError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable diagnosis must not report activationCount (unavailable ≠ no_users)",
    );
  }
  return result;
}
