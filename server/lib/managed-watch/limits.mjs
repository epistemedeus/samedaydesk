import { createHash } from "node:crypto";
import os from "node:os";
import { WatchError } from "./errors.mjs";

export function watchHostId(env = process.env) {
  const configured = String(env.MANAGED_WATCH_HOST_ID || "").trim();
  return configured || os.hostname();
}

export const DEFAULTS = Object.freeze({
  cadenceMs: 3_600_000,
  expiryMs: 7 * 24 * 3_600_000,
  maxChecks: 24,
  maxBodyBytes: 262_144,
  maxTimeMs: 8_000,
  maxOperations: 24,
  maxUsefulEvents: 8,
  leaseMs: 30_000,
  minCadenceMs: 60_000,
  maxCadenceMs: 7 * 24 * 3_600_000,
  maxExpiryMs: 30 * 24 * 3_600_000,
  maxRetainedResults: 16,
});

export const SUPPORTED_SCOPES = Object.freeze([
  "source-projection:moltjobs",
  "source-projection:x402stats",
  "source-projection:smithery_mcp",
]);

export const TASK_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}$/;
const FORBIDDEN_KEYS = new Set([
  "url", "uri", "webhook", "endpoint", "callback", "callbackurl", "href", "fetch", "host",
  "prompt", "wallet", "privatekey", "authorization", "redirect", "location",
]);

export function hashGrantToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function watchOptIn(env = process.env) {
  const raw = env.MANAGED_WATCH_OPT_IN;
  if (raw == null || String(raw).trim() === "" || String(raw).trim() === "0") return false;
  if (String(raw).trim() === "1") return true;
  throw new WatchError("invalid_config", "MANAGED_WATCH_OPT_IN must be unset, 0, or 1", 503);
}

export function iso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
  throw new WatchError("bad_clock", "clock instant must be an ISO-8601 timestamp");
}

export function plusMs(isoText, ms) {
  return new Date(Date.parse(isoText) + ms).toISOString();
}

function rejectForbidden(value, label) {
  if (typeof value === "string") {
    if (value.includes("://") || /^[a-z][a-z0-9+.-]*:/i.test(value) && value.includes("//")) {
      throw new WatchError("url_rejected", `${label} cannot carry a URL`);
    }
    if (/169\.254\.169\.254|metadata\.google\.internal/i.test(value)) {
      throw new WatchError("ssrf", `${label} names a blocked target`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbidden(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new WatchError("url_rejected", `${label}.${key} is not accepted`);
    }
    rejectForbidden(entry, `${label}.${key}`);
  }
}

function positiveInt(value, name, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new WatchError("invalid_budget", `${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function normalizeEnrollment(body, nowIso) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WatchError("invalid_enrollment", "enrollment must be an object");
  }
  rejectForbidden(body, "enrollment");
  const allowed = new Set(["taskId", "source", "predicate", "cadenceMs", "expiresAt", "budget", "comparison"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new WatchError("invalid_enrollment", `unsupported field ${key}`);
  }
  if (typeof body.taskId !== "string" || !TASK_ID.test(body.taskId)) {
    throw new WatchError("invalid_enrollment", "taskId must match [a-z0-9][a-z0-9_-]{0,63}");
  }
  if (body.predicate !== "material-change") {
    throw new WatchError("invalid_enrollment", "predicate must be material-change");
  }
  const source = body.source;
  if (!source || source.kind !== "source-projection" || !SUPPORTED_SCOPES.includes(source.scope)) {
    throw new WatchError("invalid_enrollment", "source must be a supported source-projection scope");
  }
  if (Object.keys(source).some((key) => key !== "kind" && key !== "scope")) {
    throw new WatchError("url_rejected", "source accepts only kind and scope");
  }
  let budgetSource = "default";
  const budgetIn = body.budget == null ? {} : body.budget;
  if (body.budget != null) {
    if (!budgetIn || typeof budgetIn !== "object" || Array.isArray(budgetIn)) {
      throw new WatchError("invalid_budget", "budget must be an object");
    }
    budgetSource = "caller";
  }
  if (body.cadenceMs != null && (!Number.isInteger(body.cadenceMs) || body.cadenceMs <= 0)) {
    throw new WatchError("invalid_cadence", "cadenceMs must be a positive integer");
  }
  const cadenceMs = body.cadenceMs == null
    ? DEFAULTS.cadenceMs
    : positiveInt(body.cadenceMs, "cadenceMs", { min: DEFAULTS.minCadenceMs, max: DEFAULTS.maxCadenceMs });
  let expiresAt;
  if (body.expiresAt == null) expiresAt = plusMs(nowIso, DEFAULTS.expiryMs);
  else {
    expiresAt = iso(body.expiresAt);
    const delta = Date.parse(expiresAt) - Date.parse(nowIso);
    if (delta <= 0) throw new WatchError("invalid_expiry", "expiresAt must be after now");
    if (delta > DEFAULTS.maxExpiryMs) throw new WatchError("invalid_expiry", "expiresAt exceeds 30 days");
  }
  const budget = {
    maxChecks: budgetIn.maxChecks == null ? DEFAULTS.maxChecks : positiveInt(budgetIn.maxChecks, "maxChecks", { min: 1, max: 10_000 }),
    maxBodyBytes: budgetIn.maxBodyBytes == null ? DEFAULTS.maxBodyBytes : positiveInt(budgetIn.maxBodyBytes, "maxBodyBytes", { min: 1, max: 262_144 }),
    maxTimeMs: budgetIn.maxTimeMs == null ? DEFAULTS.maxTimeMs : positiveInt(budgetIn.maxTimeMs, "maxTimeMs", { min: 1, max: 60_000 }),
    maxOperations: budgetIn.maxOperations == null ? DEFAULTS.maxOperations : positiveInt(budgetIn.maxOperations, "maxOperations", { min: 1, max: 10_000 }),
    maxUsefulEvents: budgetIn.maxUsefulEvents == null ? DEFAULTS.maxUsefulEvents : positiveInt(budgetIn.maxUsefulEvents, "maxUsefulEvents", { min: 1, max: 10_000 }),
  };
  let materialFields;
  if (body.comparison != null) {
    if (body.comparison.policy !== "material-fields") {
      throw new WatchError("invalid_enrollment", "comparison.policy must be material-fields");
    }
    if (body.comparison.materialFields != null) {
      if (!Array.isArray(body.comparison.materialFields) || body.comparison.materialFields.some((item) => typeof item !== "string")) {
        throw new WatchError("invalid_enrollment", "materialFields must be strings");
      }
      materialFields = body.comparison.materialFields;
    }
  }
  return { taskId: body.taskId, source: { kind: "source-projection", scope: source.scope }, predicate: "material-change", cadenceMs, expiresAt, budget, budgetSource, materialFields };
}

export function assertOwnerId(projectId) {
  if (typeof projectId !== "string" || !OWNER.test(projectId)) {
    throw new WatchError("invalid_grant", "grant project id is not a monitor owner", 403);
  }
}

export function publicWatch(watch) {
  return {
    schema: "sds.managed-watch.enrollment.v1",
    taskId: watch.taskId,
    projectId: watch.projectId,
    status: watch.status,
    predicate: watch.predicate,
    source: watch.source,
    cadenceMs: watch.cadenceMs,
    expiresAt: watch.expiresAt,
    nextDueAt: watch.nextDueAt,
    budget: watch.budget,
    budgetSource: watch.budgetSource,
    baselineDigest: watch.baselineDigest,
    results: watch.results,
    costs: watch.costs,
    leaseHeld: watch.status === "running",
    paidServiceLaunch: false,
    subscriptionOffered: false,
    proposedManagedPrice: null,
    naturalCustomerDemand: false,
  };
}
