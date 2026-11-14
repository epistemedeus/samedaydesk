/**
 * SameDayDesk client endpoint for the Make and n8n kits. Pure request handler; see
 * bin/serve.mjs for the HTTP wrapper used on a VM.
 *
 * Routes:
 *   POST /periods            evaluate (or replay) a period from a workflow request
 *   POST /periods/accepted   hand off an accepted output once per Idempotency-Key
 *   POST /periods/flowassert record a FlowAssert disposition, separate from acceptance
 *
 * State is a projection only: the effect projection keyed by request digest, the accepted
 * journey results keyed by task id (for later-period replay), and delivered keys.
 */
import { createKitEffects, runPeriod, stablePeriod } from "./period-map.mjs";
import { fromWorkflowRequest } from "./workflow-request.mjs";

function header(headers, name) {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

export function createClientEndpoint({ effects = createKitEffects(), clock = null } = {}) {
  const acceptedByTask = new Map();
  const deliveries = new Map();
  const flowassertRecords = [];

  function evaluate(body, headers) {
    let input;
    try {
      input = fromWorkflowRequest(body, { clock: clock ?? undefined });
    } catch (error) {
      return { status: 400, body: { error: "bad_request", message: error.message } };
    }
    const periodN = input.followsTaskId ? (acceptedByTask.get(input.followsTaskId) ?? {}) : null;
    const outcome = runPeriod(input, { effects, periodN });
    const period = stablePeriod(outcome.period);
    const claimedKey = header(headers, "idempotency-key");
    if (claimedKey && period.idempotencyKey && claimedKey !== period.idempotencyKey) {
      return {
        status: 409,
        body: { error: "idempotency_key_mismatch", message: "replay must carry the same request as the original key", period },
      };
    }
    const journey = outcome.result?.periodNPlus1 ?? outcome.result;
    if (journey?.acceptedOutput && journey.artifact?.decision === "accept") {
      acceptedByTask.set(journey.acceptedOutput.taskId, journey);
    }
    return {
      status: 200,
      body: {
        kind: outcome.kind,
        platform: input.source,
        period,
        outcome: outcome.result?.outcome ?? null,
        adapter: outcome.adapter,
      },
    };
  }

  function accepted(body, headers) {
    const key = header(headers, "idempotency-key");
    if (!key) return { status: 400, body: { error: "idempotency_key_required" } };
    const effect = effects.get(key);
    if (!effect || effect.decision !== "accept") {
      return { status: 409, body: { error: "unknown_or_unaccepted_key", idempotencyKey: key } };
    }
    const prior = deliveries.get(key) ?? 0;
    deliveries.set(key, prior === 0 ? 1 : prior);
    return {
      status: prior === 0 ? 201 : 200,
      body: { delivered: true, duplicate: prior > 0, secondEffect: false, idempotencyKey: key },
    };
  }

  function flowassert(body) {
    flowassertRecords.push({ captureId: body?.captureId ?? null, flowassert: body?.flowassert ?? null });
    return { status: 200, body: { recorded: true, affectsAcceptance: false } };
  }

  return {
    effects,
    handle({ method = "POST", path, headers = {}, body = null }) {
      if (method !== "POST") return { status: 405, body: { error: "method_not_allowed" } };
      const route = String(path || "").replace(/\/+$/, "");
      if (route.endsWith("/periods/accepted")) return accepted(body, headers);
      if (route.endsWith("/periods/flowassert")) return flowassert(body);
      if (route.endsWith("/periods")) return evaluate(body, headers);
      return { status: 404, body: { error: "not_found" } };
    },
    deliveredCount(key) {
      return deliveries.get(key) ?? 0;
    },
    deliveriesTotal() {
      let total = 0;
      for (const count of deliveries.values()) total += count;
      return total;
    },
    flowassertRecords() {
      return flowassertRecords.slice();
    },
  };
}
