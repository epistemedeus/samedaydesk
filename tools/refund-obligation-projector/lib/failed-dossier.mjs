import { createHash } from "node:crypto";
import { packDossier } from "../../failed-delivery-dossier/lib/pack.mjs";
import { DOSSIER_SCHEMA } from "../../failed-delivery-dossier/lib/pins.mjs";
import { parsePolicy, applyExplicitPolicy } from "./policy.mjs";
import { refuse } from "./refuse.mjs";

// A separate projection contract: settlement rows are not required or fabricated.
export const FAILED_DOSSIER_PROJECTION = "samedaydesk.failed-job-policy-projection.v1";
export function projectFailedDossier(dossier, { policy = null } = {}) {
  if (dossier?.schema !== DOSSIER_SCHEMA || dossier.ok !== true || dossier.sold !== false || !Array.isArray(dossier.evidence)) {
    refuse("invalid_failed_dossier", "expected a successful failed-delivery dossier");
  }
  const wrappers = dossier.evidence.filter((row) => row.sourceKind === "wrapper-receipt");
  if (wrappers.length !== 1) refuse("one_execution_required", "policy projection requires exactly one wrapper execution");
  const original = wrappers[0];
  // Recompute derived claims from retained source; caller-supplied classifications
  // cannot turn a catalog or a stale summary into an executed, settled job.
  const checked = packDossier({ items: dossier.evidence.map((item) => ({
    sourceKind: item.sourceKind, body: item.execution || item.body,
    originClass: item.origin?.class, cli: item.cli, http: item.http,
  })) });
  if (!checked.ok) refuse(checked.code, checked.message);
  const facts = checked.evidence.find((item) => item.sourceKind === "wrapper-receipt");
  const explicit = parsePolicy(policy);
  const policyFacts = {
    ...facts, delivery: facts.delivery?.status || "unknown",
    buyerClass: facts.paymentClassification.buyerClass,
    fundingState: facts.paymentClassification.fundingState,
    settlementStatus: facts.paymentClassification.settlementStatus,
  };
  const claim = explicit?.termsVersion != null
    ? { refundClaim: "unknown", refundClaimSource: "terms_unverified", policyId: explicit.policyId }
    : applyExplicitPolicy(explicit, policyFacts);
  const sourceDigest = createHash("sha256").update(JSON.stringify(original.execution || original.body)).digest("hex");
  const row = {
    evidenceId: `sha256:${sourceDigest}`,
    executionId: facts.executionId, operationId: facts.operationId, jobId: facts.jobId,
    outcomeKind: facts.outcomeKind, executionStatus: facts.executionStatus,
    transport: facts.transport, analysisOutcome: facts.analysisOutcome,
    delivery: facts.delivery?.status || "unknown",
    paymentClassification: facts.paymentClassification,
    amountUsdc: null, buyerClass: facts.paymentClassification.buyerClass,
    ...claim, paidOut: false,
    sourceObservation: { status: facts.observationStatus, class: facts.origin.class },
  };
  return { ok: true, projection: {
    schema: FAILED_DOSSIER_PROJECTION, mode: "read_only", nonsettling: true,
    paidOut: false, payableAsserted: false, stripeRefundsCalled: false,
    obligationsPostedAsPaid: false, citedBankedUsdcAttached: false,
    revenueAcrossBuyerClass: null, records: [row],
    contextEvidence: checked.evidence.filter((item) => item.sourceKind !== "wrapper-receipt").map((item) => ({
      sourceKind: item.sourceKind, observationStatus: item.observationStatus,
      outcomeKind: item.outcomeKind, observedHttpStatus: item.observedHttpStatus,
      expectedStatus: item.expectedStatus ?? null,
      executionStatus: "not-executed", settlementStatus: "unknown",
    })),
  } };
}
