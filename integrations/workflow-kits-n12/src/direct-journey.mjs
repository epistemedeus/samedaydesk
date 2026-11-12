/**
 * The direct route: a caller posts the same periods straight to the SameDayDesk client
 * endpoint, with no Make or n8n in between. Used for the direct comparison row and by
 * the installed-package check. Synthetic fixtures only; nothing leaves the process.
 *
 * One endpoint (one effect projection) serves the whole journey, so effect counts
 * cover every period:
 *   1. period N with a stale capture            capture_stale, retryable, no effect
 *   2. period N, fresh capture, not committed   uncommitted, retryable, key K, no effect
 *   3. period N, committed retry                accepted on the same key K, one effect
 *   4. hand-off of K                            delivered once
 *   5. lost reply: replay with Idempotency-Key  recovered, secondEffect false
 *   6. hand-off of K again                      duplicate, no second delivery
 *   7. continuation file missing                non-retryable exception, no effect
 *   8. later period, changed schema, undeclared schema_changed, no effect
 *   9. later period with the declared adapter   accepted on a new key K2, one effect
 *  10. hand-off of K2, then replay of 9         delivered once, recovered
 */
import { createClientEndpoint } from "./client-endpoint.mjs";
import { buildWorkflowRequest } from "./workflow-request.mjs";
import { periodNWebhookBody, schemaChangeWebhookBody } from "../scripts/build-artifacts.mjs";
import { CLOCK, loadJson } from "../vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs";

export const DIRECT_CLOCK = CLOCK;
export const DIRECT_SCHEMA_ADAPTER = Object.freeze({ payloadVersion: "later-period-output-keys.v1" });

function request(period, { committed = true, clock }) {
  return buildWorkflowRequest({
    platform: "native",
    period,
    workflowOutput: period.capture?.payload ?? null,
    committed,
    clock,
  });
}

function brief(reply) {
  const p = reply.body?.period ?? null;
  return {
    status: reply.status,
    decision: p?.decision ?? null,
    exception: p?.exception?.code ?? null,
    complete: p?.completeness?.complete ?? null,
    retryable: p?.retry?.retryable ?? null,
    idempotencyKey: p?.idempotencyKey ?? null,
    sameIdempotencyKey: p?.retry?.sameIdempotencyKey ?? null,
    recovered: p?.retry?.recovered ?? null,
    secondEffect: p?.retry?.secondEffect ?? null,
    adapter: reply.body?.adapter?.payloadVersion ?? null,
    duplicate: reply.body?.duplicate ?? null,
  };
}

export function runDirectJourney({ clock = DIRECT_CLOCK } = {}) {
  const endpoint = createClientEndpoint({ clock });
  const calls = [];
  const call = (phase, path, body, key = null) => {
    calls.push({ phase, path });
    const headers = key ? { "Idempotency-Key": key } : {};
    return brief(endpoint.handle({ path, headers, body }));
  };

  const fresh = periodNWebhookBody().period;
  const stale = { ...periodNWebhookBody().period, capture: loadJson("synthetic-permitted-failure-stale.json") };
  const missingFile = periodNWebhookBody().period;
  missingFile.caller = { ...missingFile.caller, continuationFileMissing: true };
  const later = schemaChangeWebhookBody().period;
  const laterAdapted = schemaChangeWebhookBody({ schemaAdapter: DIRECT_SCHEMA_ADAPTER }).period;

  const steps = {};
  steps.staleCapture = call("retryable", "/periods", request(stale, { clock }));
  steps.uncommitted = call("retryable", "/periods", request(fresh, { committed: false, clock }));
  steps.accepted = call("accepted", "/periods", request(fresh, { clock }));
  const key = steps.accepted.idempotencyKey;
  steps.handOff = call("accepted", "/periods/accepted", {}, key);
  steps.replay = call("retry", "/periods", request(fresh, { clock }), key);
  steps.handOffAgain = call("duplicate-check", "/periods/accepted", {}, key);
  steps.nonRetryable = call("non-retryable", "/periods", request(missingFile, { clock }));
  steps.schemaChanged = call("later-period", "/periods", request(later, { clock }));
  steps.adapted = call("later-period", "/periods", request(laterAdapted, { clock }));
  const key2 = steps.adapted.idempotencyKey;
  steps.adaptedHandOff = call("later-period", "/periods/accepted", {}, key2);
  steps.adaptedReplay = call("later-period-retry", "/periods", request(laterAdapted, { clock }), key2);

  const keys = [key, key2].filter(Boolean);
  const acceptanceEffects = endpoint.effects.appliedCount();
  const deliveries = endpoint.deliveriesTotal();
  const pathOf = (phase) => calls.filter((c) => c.phase === phase).map((c) => `POST ${c.path}`);
  return {
    platform: "direct",
    steps,
    acceptedPath: pathOf("accepted"),
    acceptedPathSteps: pathOf("accepted").length,
    retryPath: [`POST /periods with Idempotency-Key = period.retry.sameIdempotencyKey`],
    retrySteps: pathOf("retry").length,
    totalCalls: calls.length,
    acceptedKeys: keys.length,
    acceptanceEffects,
    deliveries,
    duplicateEffects: (acceptanceEffects - keys.length) + (deliveries - keys.length),
  };
}
