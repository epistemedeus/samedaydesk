import { isDomainAnalysis } from "./fields.mjs";

export function classifyUse({
  kind,
  reply = "not-applicable",
  transport,
  analysis,
  delivery,
  payment,
  sample = false,
  jobIndex = 1,
  priorId = null,
} = {}) {
  if (kind === "sibling-receipt") {
    return {
      useClass: null,
      siblingStatus: "pending",
      note: "absent sibling receipt is not customer no-reply",
    };
  }

  if (kind === "offer-presented") {
    if (reply === "none") {
      return { useClass: "no-reply", reply: "none" };
    }
    return { useClass: null, reply: "observed", note: "presentation followed by a later observation" };
  }

  const repeat = jobIndex >= 2 || Boolean(priorId);
  if (payment?.settled === true && repeat && sample !== true && payment.state === "settled") {
    return { useClass: "paid-return", repeat: true, payment: payment.state };
  }

  if (["engine-crash", "timeout", "acquisition-failed", "internal-error"].includes(transport)) {
    return { useClass: "failed-use", failureKind: "transport", transport };
  }

  if (transport === "rejected" && (!analysis || analysis.outcome === "not-run")) {
    return { useClass: "failed-use", failureKind: "first-use-friction" };
  }

  if (delivery?.status === "incomplete" && analysis?.outcome === "completed") {
    return { useClass: "failed-use", failureKind: "missing-output" };
  }

  if (transport === "ok" && isDomainAnalysis(analysis?.outcome)) {
    return {
      useClass: "useful-use",
      analysisOutcome: analysis.outcome,
      deliveryComplete: delivery?.complete === true,
      repeat,
      payment: payment?.state || "none",
    };
  }

  if (delivery?.complete === true && transport === "ok") {
    return { useClass: "useful-use", analysisOutcome: analysis?.outcome || "completed", repeat, payment: payment?.state || "none" };
  }

  return { useClass: "failed-use", failureKind: "unclassified-failure", transport, analysisOutcome: analysis?.outcome };
}
