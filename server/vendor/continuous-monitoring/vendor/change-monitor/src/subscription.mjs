import { MonitorError } from "./errors.mjs";
import { parseInstant } from "./clock.mjs";
import { assertReceiverId } from "./receivers.mjs";

export const SUBSCRIPTION_SCHEMA = "change-monitor.subscription.v1";
export const COMPARISON_POLICY = "material-fields";

const SUBSCRIPTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}$/;
const SCOPE = {
  "release-gate": /^release-gate:[a-z0-9][a-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._+-]*$/,
  "route-lock": /^route-lock:decision:[A-Za-z0-9._:-]{8,200}$/,
  "source-projection": /^source-projection:(moltjobs|x402stats|smithery_mcp)$/,
};

const TOP_KEYS = new Set([
  "subscriptionId",
  "owner",
  "source",
  "comparison",
  "destination",
  "budget",
  "expiresAt",
]);
const SOURCE_KEYS = new Set(["kind", "scope"]);
const COMPARISON_KEYS = new Set(["policy", "materialFields"]);
const DESTINATION_KEYS = new Set(["receiverId"]);
const BUDGET_KEYS = new Set(["maxUsefulEvents"]);
const PATCH_KEYS = new Set(["expiresAt", "budget", "destination", "comparison"]);
const FORBIDDEN_KEYS = new Set([
  "url",
  "uri",
  "webhook",
  "endpoint",
  "callback",
  "callbackurl",
  "href",
  "fetch",
  "host",
]);

function rejectUrlStrings(value, label) {
  if (typeof value === "string") {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.includes("://")) {
      throw new MonitorError(`${label} cannot carry a URL`, { code: "url_rejected" });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectUrlStrings(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new MonitorError(`${label}.${key} is not accepted. Destinations are registry ids.`, {
        code: "url_rejected",
      });
    }
    rejectUrlStrings(entry, `${label}.${key}`);
  }
}

function rejectUnknown(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MonitorError(`${label} must be an object`, { code: "invalid_subscription" });
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new MonitorError(`${label} contains unsupported field ${key}`, { code: "invalid_subscription" });
    }
  }
}

function assertMaterialFields(fields, adapter) {
  if (fields === undefined || fields === null) return null;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new MonitorError("materialFields must be a non-empty subset of the adapter fields", {
      code: "invalid_subscription",
    });
  }
  const allowed = new Set(adapter.MATERIAL_FIELDS);
  const seen = new Set();
  const out = [];
  for (const field of fields) {
    if (typeof field !== "string" || !allowed.has(field) || seen.has(field)) {
      throw new MonitorError(`material field is not declared by the ${adapter.id} adapter: ${field}`, {
        code: "invalid_subscription",
      });
    }
    seen.add(field);
    out.push(field);
  }
  return out.sort();
}

export function parseSubscription(input, { now, knownReceivers, adapterFor }) {
  rejectUrlStrings(input, "subscription");
  rejectUnknown(input, TOP_KEYS, "subscription");
  if (typeof input.subscriptionId !== "string" || !SUBSCRIPTION_ID.test(input.subscriptionId)) {
    throw new MonitorError("subscriptionId must be a short stable id", { code: "invalid_subscription" });
  }
  if (typeof input.owner !== "string" || !OWNER.test(input.owner)) {
    throw new MonitorError("owner must be a short name", { code: "invalid_subscription" });
  }
  rejectUnknown(input.source, SOURCE_KEYS, "source");
  const kind = input.source.kind;
  const scopePattern = SCOPE[kind];
  if (!scopePattern) {
    throw new MonitorError("source.kind is not a registered adapter", { code: "invalid_subscription" });
  }
  if (typeof input.source.scope !== "string" || !scopePattern.test(input.source.scope)) {
    throw new MonitorError(`source.scope does not match the ${kind} scope contract`, { code: "invalid_subscription" });
  }
  const adapter = adapterFor(kind);
  rejectUnknown(input.comparison, COMPARISON_KEYS, "comparison");
  if (input.comparison.policy !== COMPARISON_POLICY) {
    throw new MonitorError(`comparison.policy must be ${COMPARISON_POLICY}`, { code: "invalid_subscription" });
  }
  const materialFields = assertMaterialFields(input.comparison.materialFields, adapter);
  rejectUnknown(input.destination, DESTINATION_KEYS, "destination");
  const receiverId = assertReceiverId(input.destination.receiverId);
  if (!knownReceivers.has(receiverId)) {
    throw new MonitorError("destination receiverId is not in the process receiver registry", {
      code: "unknown_receiver",
    });
  }
  rejectUnknown(input.budget, BUDGET_KEYS, "budget");
  const maxUsefulEvents = input.budget.maxUsefulEvents;
  if (!Number.isInteger(maxUsefulEvents) || maxUsefulEvents < 1 || maxUsefulEvents > 10000) {
    throw new MonitorError("budget.maxUsefulEvents must be an integer from 1 through 10000", {
      code: "invalid_subscription",
    });
  }
  const expiresAtMs = parseInstant(input.expiresAt, "expiresAt");
  const nowMs = parseInstant(now, "now");
  if (expiresAtMs <= nowMs) {
    throw new MonitorError("expiresAt must be after the injected clock", { code: "invalid_subscription" });
  }
  return {
    schema: SUBSCRIPTION_SCHEMA,
    subscriptionId: input.subscriptionId,
    owner: input.owner,
    source: { kind, scope: input.source.scope },
    comparison: { policy: COMPARISON_POLICY, materialFields },
    destination: { receiverId },
    budget: { maxUsefulEvents },
    expiresAt: input.expiresAt,
    status: "active",
    statusReason: null,
    revision: 1,
    baseline: null,
    currentClass: null,
    lastAcceptedEvidenceId: null,
    lastFailureFingerprint: null,
    lastEventId: null,
    createdAt: now,
    updatedAt: now,
    revisionLog: [{ revision: 1, at: now, action: "subscribe", baselineReset: false }],
  };
}

export function parseRevisionPatch(patch, { now, current, knownReceivers, adapterFor }) {
  rejectUrlStrings(patch, "revision");
  rejectUnknown(patch, PATCH_KEYS, "revision");
  if (Object.keys(patch).length === 0) {
    throw new MonitorError("revision patch is empty", { code: "invalid_subscription" });
  }
  const adapter = adapterFor(current.source.kind);
  const next = {
    expiresAt: current.expiresAt,
    budget: { ...current.budget },
    destination: { ...current.destination },
    comparison: {
      policy: current.comparison.policy,
      materialFields: current.comparison.materialFields ? [...current.comparison.materialFields] : null,
    },
    baselineReset: false,
  };
  if (patch.expiresAt !== undefined) {
    const expiresAtMs = parseInstant(patch.expiresAt, "expiresAt");
    if (expiresAtMs <= parseInstant(now, "now")) {
      throw new MonitorError("expiresAt must be after the injected clock", { code: "invalid_subscription" });
    }
    next.expiresAt = patch.expiresAt;
  }
  if (patch.budget !== undefined) {
    rejectUnknown(patch.budget, BUDGET_KEYS, "budget");
    const maxUsefulEvents = patch.budget.maxUsefulEvents;
    if (!Number.isInteger(maxUsefulEvents) || maxUsefulEvents > 10000) {
      throw new MonitorError("budget.maxUsefulEvents must be an integer", { code: "invalid_subscription" });
    }
    if (maxUsefulEvents < current.budget.maxUsefulEvents) {
      throw new MonitorError("budget maxUsefulEvents can only increase", { code: "budget_decrease" });
    }
    next.budget = { maxUsefulEvents };
  }
  if (patch.destination !== undefined) {
    rejectUnknown(patch.destination, DESTINATION_KEYS, "destination");
    const receiverId = assertReceiverId(patch.destination.receiverId);
    if (!knownReceivers.has(receiverId)) {
      throw new MonitorError("destination receiverId is not in the process receiver registry", {
        code: "unknown_receiver",
      });
    }
    next.destination = { receiverId };
  }
  if (patch.comparison !== undefined) {
    rejectUnknown(patch.comparison, COMPARISON_KEYS, "comparison");
    if (patch.comparison.policy !== undefined && patch.comparison.policy !== COMPARISON_POLICY) {
      throw new MonitorError(`comparison.policy must be ${COMPARISON_POLICY}`, { code: "invalid_subscription" });
    }
    if (patch.comparison.materialFields !== undefined) {
      const materialFields = assertMaterialFields(patch.comparison.materialFields, adapter);
      const previous = current.comparison.materialFields ? [...current.comparison.materialFields].sort() : null;
      if (JSON.stringify(materialFields) !== JSON.stringify(previous)) {
        next.comparison = { policy: COMPARISON_POLICY, materialFields };
        next.baselineReset = true;
      }
    }
  }
  return next;
}
