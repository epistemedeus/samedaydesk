import { classifyUse } from "./classify.mjs";
import { parseObservation } from "./parse.mjs";
import { classifyPayment } from "./payment.mjs";
import { recommendNextOffer } from "./next-offer.mjs";
import { READOUT_CONTRACT, SDS52_SHA, REMAINING_BINDING } from "./pins.mjs";

function laterThan(a, b) {
  if (!a || !b) return true;
  return String(a) >= String(b);
}

function replyForPresentation(presented, rows) {
  const later = rows.filter((row) => {
    if (row.id === presented.id) return false;
    if (row.kind === "offer-presented" || row.kind === "sibling-receipt" || row.kind === "terms-compare") {
      return false;
    }
    const sameCaller = presented.callerKey && row.callerKey === presented.callerKey;
    const sameOffer = presented.offerId && (row.offerId === presented.offerId || row.jobId === presented.offerId);
    if (!sameCaller && !sameOffer) return false;
    return laterThan(row.at, presented.at);
  });
  return later.length ? "observed" : "none";
}

function rowFromParsed(parsed, { reply } = {}) {
  if (!parsed.ok) {
    return {
      id: parsed.id || null,
      kind: parsed.kind || null,
      ok: false,
      refused: true,
      code: parsed.code,
      error: parsed.error,
      useClass: null,
    };
  }

  if (parsed.kind === "terms-compare") {
    return { ...parsed, useClass: null };
  }

  if (parsed.kind === "sibling-receipt") {
    return {
      ...parsed,
      useClass: null,
      siblingStatus: parsed.present === true ? "present" : "pending",
    };
  }

  if (parsed.kind === "offer-presented") {
    const classified = classifyUse({ kind: "offer-presented", reply });
    return { ...parsed, ...classified, reply };
  }

  if (parsed.kind === "settlement-join") {
    const payment = classifyPayment(
      { sample: false, fundingState: "unfunded", sold: false },
      parsed.settlement,
      {
        operationId: parsed.operationId,
        claimPaidReturn: parsed.claimPaidReturn === true,
        citedBankedUsdc: parsed.citedBankedUsdc === true,
      },
    );
    if (!payment.ok) {
      return {
        ...parsed,
        ok: false,
        refused: true,
        code: parsed.citedBankedUsdc ? payment.code : payment.code,
        error: payment.error,
        useClass: null,
        payment,
      };
    }
    const classified = classifyUse({
      kind: "wrapper-result",
      transport: "ok",
      analysis: { outcome: "completed" },
      delivery: { complete: true, status: "complete" },
      payment,
      jobIndex: parsed.jobIndex,
      priorId: parsed.priorId,
    });
    return { ...parsed, ...classified, payment };
  }

  const payment = classifyPayment(parsed.fields, parsed.settlement, {
    operationId: parsed.operationId,
    claimPaidReturn: parsed.claimPaidReturn === true,
    citedBankedUsdc: parsed.citedBankedUsdc === true,
    amountUsdc: parsed.settlement?.amountUsdc,
  });
  if (!payment.ok) {
    return {
      ...parsed,
      ok: false,
      refused: true,
      code: payment.code,
      error: payment.error,
      useClass: null,
      payment,
      transport: parsed.fields.transport,
      analysis: parsed.fields.analysis,
      delivery: parsed.fields.delivery,
    };
  }
  const classified = classifyUse({
    kind: "wrapper-result",
    transport: parsed.fields.transport,
    analysis: parsed.fields.analysis,
    delivery: parsed.fields.delivery,
    payment,
    sample: parsed.fields.sample,
    jobIndex: parsed.jobIndex,
    priorId: parsed.priorId,
  });
  return {
    ...parsed,
    ...classified,
    payment,
    transport: parsed.fields.transport,
    analysis: parsed.fields.analysis,
    delivery: parsed.fields.delivery,
    code: parsed.fields.code,
    wrapperOk: parsed.fields.wrapperOk,
    contract: parsed.fields.contract,
    fieldSource: parsed.fields.source,
  };
}

export function classifyCohort(rawObservations = [], options = {}) {
  const parsed = rawObservations.map((raw, index) => parseObservation(raw, index));
  const honest = parsed.filter((row) => row.ok);
  const rows = parsed.map((item) => {
    if (!item.ok) return rowFromParsed(item);
    if (item.kind === "offer-presented") {
      const reply = replyForPresentation(item, honest);
      return rowFromParsed(item, { reply });
    }
    return rowFromParsed(item);
  });
  const nextAdjustment = recommendNextOffer(rows, options);
  const refused = rows.filter((row) => row.refused === true);
  return {
    ok: refused.length === 0,
    contract: READOUT_CONTRACT,
    testedWrapperPin: SDS52_SHA,
    remainingBinding: REMAINING_BINDING,
    independentDemand: false,
    organicDemand: false,
    purchaseAuthority: false,
    rows,
    nextAdjustment,
    counts: nextAdjustment.counts,
    refusedCount: refused.length,
  };
}
