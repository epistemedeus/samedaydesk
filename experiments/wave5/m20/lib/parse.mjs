import { ERROR_CODES } from "./pins.mjs";
import { inspectActorClass, inspectRunBuyerClass } from "./buyer-class.mjs";
import { splitWrapperResult } from "./fields.mjs";
import { classifyPayment } from "./payment.mjs";
import { refuse } from "./refuse.mjs";
import { compareTerms } from "./terms.mjs";

const KINDS = new Set([
  "offer-presented",
  "wrapper-result",
  "sibling-receipt",
  "settlement-join",
  "terms-compare",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseObservation(raw, index = 0) {
  if (!isPlainObject(raw)) {
    return refuse(ERROR_CODES.INVALID_JSON, "observation must be a JSON object");
  }
  const kind = raw.kind;
  if (!KINDS.has(kind)) {
    return refuse(ERROR_CODES.UNKNOWN_KIND, `unknown observation kind ${String(kind)}`);
  }
  const id = raw.id || null;
  if (!id) {
    return refuse(ERROR_CODES.MISSING_ID, "observation.id is required", { index });
  }

  if (kind === "terms-compare") {
    const compared = compareTerms(raw.left || {}, raw.right || {}, { forceEqual: raw.forceEqual === true });
    if (!compared.ok) return { ...compared, id, kind };
    return {
      ok: true,
      id,
      kind,
      terms: compared,
    };
  }

  if (kind === "sibling-receipt") {
    return {
      ok: true,
      id,
      kind,
      slot: raw.slot || null,
      present: raw.present === true,
      path: raw.path || null,
    };
  }

  if (kind === "offer-presented") {
    const actor = inspectActorClass({ actorClass: raw.actorClass || raw.buyerClass || "unknown" });
    if (!actor.ok) return { ...actor, id, kind };
    return {
      ok: true,
      id,
      kind,
      at: raw.at || null,
      windowEndsAt: raw.windowEndsAt || null,
      callerKey: raw.callerKey || null,
      offerId: raw.offerId || raw.jobId || null,
      jobId: raw.jobId || raw.offerId || null,
      actorClass: actor.actorClass,
    };
  }

  if (kind === "settlement-join") {
    return {
      ok: true,
      id,
      kind,
      callerKey: raw.callerKey || null,
      jobId: raw.jobId || null,
      offerId: raw.offerId || raw.jobId || null,
      jobIndex: raw.jobIndex || 2,
      priorId: raw.priorId || null,
      operationId: raw.operationId || null,
      settlement: raw.settlement || null,
      claimPaidReturn: raw.claimPaidReturn === true,
      citedBankedUsdc: raw.citedBankedUsdc === true,
    };
  }

  const labelled = inspectRunBuyerClass(raw);
  if (!labelled.ok) return { ...labelled, id, kind };
  const result = raw.result && isPlainObject(raw.result) ? raw.result : raw.wrapperResult || null;
  if (!result) {
    return refuse(ERROR_CODES.MISSING_INPUT, "wrapper-result requires result", { id });
  }
  const fields = splitWrapperResult(result);
  return {
    ok: true,
    id,
    kind,
    at: raw.at || null,
    callerKey: raw.callerKey || null,
    offerId: raw.offerId || raw.jobId || result.jobId || null,
    jobId: raw.jobId || result.jobId || null,
    jobIndex: Number(raw.jobIndex || 1),
    priorId: raw.priorId || null,
    buyerClass: labelled.buyerClass,
    operationId: raw.operationId || null,
    settlement: raw.settlement || null,
    claimPaidReturn: raw.claimPaidReturn === true,
    citedBankedUsdc: raw.citedBankedUsdc === true,
    fields,
    result,
  };
}
