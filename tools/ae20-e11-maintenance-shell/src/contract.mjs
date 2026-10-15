import { PINS } from "./pins.mjs";

const SAFE_ASKS = new Set(["safe_derivative", PINS.requiredCoverage]);
const REFUSAL_STATES = new Set(["unavailable", "revoked", "sharing_denied", "not_accepted"]);

// Admission predicate for an already produced E02 CurrentReuseResult.
// This module does not call readCurrent and does not store a grant.
// safe_derivative_only is never widened to raw or private bytes.

export function decidePermission({ principal, work, readCurrent, now, laterTaskId, asked, sourceTaskId }) {
  const checks = [];
  if (!principal || typeof principal.accountId !== "string" || principal.accountId.length < 1
    || typeof principal.tenantId !== "string" || principal.tenantId.length < 1) {
    checks.push({ kind: "distinct-consumer", ok: false });
    return decision("unauthenticated", checks);
  }

  const distinct = principal.role === "consumer"
    && principal.accountId !== work?.contributorAccountId
    && principal.accountId !== work?.requesterAccountId;
  checks.push({ kind: "distinct-consumer", ok: distinct });
  if (!distinct) return decision("forbidden", checks);

  const bindingOk = Boolean(work)
    && typeof work.tenantId === "string"
    && typeof work.taskId === "string"
    && typeof work.laterTaskId === "string"
    && typeof work.contextId === "string"
    && typeof work.contributorAccountId === "string"
    && typeof work.requesterAccountId === "string";
  if (!bindingOk) {
    checks.push({ kind: "tenant", ok: false });
    return decision("forbidden", checks);
  }

  const tenantOk = principal.tenantId === work.tenantId;
  checks.push({ kind: "tenant", ok: tenantOk });
  if (!tenantOk) return decision("cross_tenant", checks);

  const taskOk = typeof laterTaskId === "string"
    && laterTaskId.length > 0
    && laterTaskId === work.laterTaskId
    && laterTaskId !== work.taskId
    && work.taskId === sourceTaskId;
  checks.push({ kind: "task", ok: taskOk });
  if (!taskOk) return decision("task_mismatch", checks);

  if (readCurrent == null || typeof readCurrent !== "object" || Array.isArray(readCurrent) || typeof readCurrent.state !== "string") {
    checks.push({ kind: "readCurrent", state: null, ok: false });
    return decision("missing_permission", checks);
  }
  if (readCurrent.state === "revoked" || readCurrent.state === "withdrawn") {
    checks.push({ kind: "readCurrent", state: readCurrent.state, ok: false });
    return decision("revoked", checks, { withdrawn: true });
  }
  if (readCurrent.state !== "current") {
    const code = REFUSAL_STATES.has(readCurrent.state) ? readCurrent.state : "unavailable";
    checks.push({ kind: "readCurrent", state: readCurrent.state, ok: false });
    return decision(code, checks);
  }

  const expiresAt = readCurrent.knowledge?.expiresAt;
  const exp = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
  const nowMs = typeof now === "string" ? Date.parse(now) : Number.NaN;
  if (!Number.isFinite(exp) || !Number.isFinite(nowMs) || exp <= nowMs) {
    checks.push({ kind: "readCurrent", state: "current", ok: false });
    return decision("sharing_denied", checks, { expired: true });
  }

  const coverage = readCurrent.knowledge?.coverage;
  const covers = Array.isArray(coverage) && coverage.includes(PINS.requiredCoverage);
  const sharingOk = readCurrent.sharing === PINS.sharing;
  const reviewOk = readCurrent.review === PINS.review;
  const rightsClaim = Object.hasOwn(readCurrent, "rights") ? readCurrent.rights : PINS.canonicalGrant;
  const rightsOk = rightsClaim === PINS.canonicalGrant;
  const normalizedAsk = normalizeAsked(asked);
  const askOk = normalizedAsk != null && SAFE_ASKS.has(normalizedAsk);
  const contextOk = readCurrent.binding?.contextId === work.contextId;
  const admitted = covers && sharingOk && reviewOk && rightsOk && askOk && contextOk;
  checks.push({ kind: "readCurrent", state: "current", ok: admitted });
  if (!admitted) return decision(contextOk ? "wrong_rights" : "forbidden", checks);
  return decision("current", checks, { admitted: true });
}

function normalizeAsked(asked) {
  if (asked == null) return "safe_derivative";
  if (typeof asked !== "string" || asked.length < 1 || asked.length > 64) return null;
  return asked;
}

function decision(code, checks, extra = {}) {
  return {
    ok: extra.admitted === true,
    code,
    checks,
    rights: PINS.canonicalGrant,
    rawServed: false,
    withdrawn: extra.withdrawn === true,
    expired: extra.expired === true,
  };
}
