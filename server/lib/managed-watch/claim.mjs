import { randomBytes } from "node:crypto";
import { DEFAULTS } from "./limits.mjs";

function result(fields) {
  return {
    operationId: fields.operationId ?? null,
    at: fields.at,
    outcome: fields.outcome,
    evidenceClass: fields.evidenceClass ?? null,
    failureCode: fields.failureCode ?? null,
    usefulChange: false,
    usefulNegative: false,
    delivered: false,
    deliveryState: null,
    capture: null,
    publicSourceChanged: false,
    naturalCustomerDemand: false,
    sourceCalls: 0,
    sourceBytes: 0,
    runtimeMs: 0,
  };
}

export function trimResults(results) {
  const copy = results.slice(-DEFAULTS.maxRetainedResults);
  return copy;
}

export function refuseBeforeRead(watch, nowIso) {
  if (Date.parse(watch.expiresAt) <= Date.parse(nowIso)) {
    watch.status = "expired";
    watch.lease = null;
    watch.pending = null;
    watch.updatedAt = nowIso;
    watch.results = trimResults(watch.results.concat([result({
      at: nowIso, outcome: "expired", failureCode: "expired",
    })]));
    return "expired";
  }
  if (watch.costs.operations >= watch.budget.maxOperations || watch.costs.sourceCalls >= watch.budget.maxChecks) {
    watch.nextDueAt = watch.expiresAt;
    watch.updatedAt = nowIso;
    watch.results = trimResults(watch.results.concat([result({
      at: nowIso, outcome: "budget_exhausted", failureCode: "budget_exhausted",
    })]));
    return "budget_exhausted";
  }
  return null;
}

export function markClaimed(watch, { nowIso, workerId, leaseMs }) {
  const refused = refuseBeforeRead(watch, nowIso);
  if (refused) return refused;
  watch.status = "running";
  watch.lease = {
    workerId,
    pid: process.pid,
    operationId: `op_${randomBytes(12).toString("hex")}`,
    until: new Date(Date.parse(nowIso) + leaseMs).toISOString(),
    phase: "claimed",
  };
  watch.pending = {
    operationId: watch.lease.operationId,
    phase: "claimed",
    document: null,
    failure: null,
    bytes: 0,
  };
  watch.costs.operations += 1;
  watch.updatedAt = nowIso;
  return "claimed";
}
