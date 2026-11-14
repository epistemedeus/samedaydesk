/**
 * Direct control: the same recipe as the Make and n8n artifacts, written as plain
 * code against the client endpoint (no workflow graph). Records are handled in
 * order; a transport error stops the run, as a failing module or node would.
 */
import { CLIENT_ENDPOINT, REQUEST_KIND } from "./client-endpoint.mjs";

export function runDirectPeriod(request, { endpoint, registry }) {
  const httpCalls = [];
  const post = (route, body, idempotencyKey = null) => {
    const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {};
    const res = endpoint.handle({ method: "POST", url: `${CLIENT_ENDPOINT}${route}`, headers, body });
    httpCalls.push({ route, idempotencyKey, status: res.transportError ? "transport_error" : res.status });
    if (res.transportError) throw Object.assign(new Error(res.message), { route });
    return res;
  };
  let response = null;
  try {
    const evaluated = post("/evaluate", { kind: REQUEST_KIND, platform: "direct", period: request.period, records: request.records, mappings: registry });
    response = { code: evaluated.body.ok ? 200 : 422, body: evaluated.body };
    if (!evaluated.body.ok) return { platform: "direct", status: "success", error: null, response, httpCalls };
    const periodId = evaluated.body.periodId;
    for (const record of evaluated.body.records) {
      if (record.outcome === "ready") {
        post("/apply", { ledgerKey: record.ledgerKey, idempotencyKey: record.idempotencyKey, recordKey: record.recordKey, periodId }, record.ledgerKey);
      } else if (record.retryable && record.sameIdempotencyKey) {
        const replayed = post("/replay", { idempotencyKey: record.sameIdempotencyKey, recordKey: record.recordKey }, record.sameIdempotencyKey).body.record;
        if (replayed.outcome === "ready") {
          post("/apply", { ledgerKey: replayed.ledgerKey, idempotencyKey: replayed.idempotencyKey, recordKey: replayed.recordKey, periodId }, replayed.ledgerKey);
        }
      }
    }
    return { platform: "direct", status: "success", error: null, response, httpCalls };
  } catch (error) {
    return { platform: "direct", status: "error", error: { node: error.route ?? null, message: error.message }, response, httpCalls };
  }
}
