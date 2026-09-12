// Consumer of execution.v1. Funding, transport, analysis and settlement are
// independent facts. This module neither runs an engine nor authorizes payment.
export const EXECUTION_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";
const FAILED_TRANSPORT = new Set(["acquisition-failed", "engine-crash", "timeout", "internal-error"]);

export function executionFacts(body = {}) {
  const receipt = body.receipt || body;
  const current = (body.contract || receipt.contract) === EXECUTION_CONTRACT;
  const transport = body.transport ?? receipt.transport ?? null;
  const analysis = body.analysis ?? receipt.analysis ?? null;
  const delivery = body.delivery ?? receipt.delivery ?? null;
  const engine = receipt.engineResult;
  const counts = body.engine?.appId === "lockfile-pin-delta" ? body.engine.counts : null;
  const unchangedLockfile = counts && ["added", "removed", "changed"].every((key) => counts[key] === 0)
    && Number.isInteger(counts.unchanged) && counts.unchanged >= 0;
  let outcomeKind = "unknown";
  let executionStatus = "unknown";
  let analysisOutcome = analysis?.outcome ?? null;
  if (current) {
    if (FAILED_TRANSPORT.has(transport)) outcomeKind = "transport-failure";
    else if (transport === "rejected") {
      outcomeKind = "refusal";
      executionStatus = "refused-before-execution";
    } else if (transport === "ok") {
      executionStatus = "executed";
      if (analysisOutcome === "refused") outcomeKind = "refusal";
      else if (delivery?.complete !== true) outcomeKind = "missing-body";
      else if (["no-change", "no_change", "unchanged"].includes(analysisOutcome) ||
        ["no-change", "no_change", "unchanged"].includes(analysis?.status) ||
        ["no-change", "no_change", "unchanged"].includes(engine?.status) || unchangedLockfile) outcomeKind = "no-change";
      else if (analysisOutcome && analysisOutcome !== "not-run") outcomeKind = "valid-analysis";
    }
  } else if (engine?.refused === true) {
    outcomeKind = "valid-analysis";
    analysisOutcome = "refused";
  } else if (engine?.ok === true) outcomeKind = "valid-analysis";
  else if (engine?.ok === false) outcomeKind = "engine-failure";
  else if (receipt.fundingState === "rejected" && receipt.code) {
    outcomeKind = "valid-analysis";
    analysisOutcome = "refused";
    executionStatus = "refused-before-execution";
  }
  const payment = receipt.payment;
  return {
    contract: current ? EXECUTION_CONTRACT : null,
    executionId: body.executionId ?? receipt.executionId ?? null,
    operationId: body.operationId ?? receipt.operationId ?? null,
    jobId: receipt.jobId ?? body.jobId ?? null,
    outcomeKind, executionStatus, transport, analysisOutcome, delivery,
    paymentClassification: {
      fundingState: receipt.fundingState ?? body.fundingState ?? "unknown",
      fixture: payment?.fixture === true || receipt.fundingState === "reserved-fixture",
      settlementStatus: payment?.liveSettleAttempted === false || body.liveSettleAttempted === false
        ? "not-attempted" : "unknown",
      buyerClass: "unknown",
      amountUsdc: null,
    },
  };
}
