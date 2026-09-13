import { isPlainObject } from "./json.mjs";
import { assertHonestDiagnostics } from "./diagnose.mjs";
import { refuseRewritePayloadToFixDiscovery } from "./plan-fill.mjs";
import {
  refuseH4Edit,
  refuseInstallLiveHooks,
  refusePaymentFnReassignment,
  refusePriceChange,
} from "./guardrails.mjs";
import { ATTEMPT_TO_FAILURE, UNSIGNED_HINT_NOT_AUTHORITY } from "./failures.mjs";

export function rejectSeededAttempt(fixture) {
  const json = isPlainObject(fixture?.json) ? fixture.json : fixture;
  const attempt = fixture?.attempt || json?.attempt;
  if (!attempt || !ATTEMPT_TO_FAILURE[attempt]) {
    return {
      ok: false,
      rejected: true,
      error: `unknown seeded attempt: ${attempt}`,
    };
  }

  if (attempt === "unsigned-hint-as-authority") {
    const diagnostics = Array.isArray(json.diagnostics)
      ? json.diagnostics
      : [
          {
            field: "extensions.bazaar",
            present: false,
            signed: true,
            drift: "missing_hint",
          },
        ];
    const check = assertHonestDiagnostics(diagnostics);
    return {
      ok: false,
      rejected: true,
      failure: check.ok ? UNSIGNED_HINT_NOT_AUTHORITY : check.failure,
      offender: check.ok ? diagnostics[0] : check.offender,
    };
  }

  if (attempt === "rewrite-payload-to-fix-discovery") {
    return refuseRewritePayloadToFixDiscovery(json.paymentPayload, json.rewrittenPayload || json);
  }

  if (attempt === "install-live-resource-server-hooks") {
    return refuseInstallLiveHooks(json);
  }

  if (attempt === "change-live-prices") {
    if (json.verifyPayment || json.settlePayment) {
      return refusePaymentFnReassignment(json);
    }
    return refusePriceChange(json);
  }

  if (attempt === "edit-h4-directory") {
    return refuseH4Edit(json);
  }

  return { ok: false, rejected: true, failure: ATTEMPT_TO_FAILURE[attempt] };
}
