import { createHash } from "node:crypto";

export const RECEIPT_SCHEMA = "neomorphic.r2.exchange.journey_receipt.v1";
export const RECEIPT_VERSION = 2;

export function fingerprintInput(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Portable, versioned, re-checkable journey receipt.
 * Replay-bound verification requires the exact replayed input plus bound identities —
 * not outcome-only, and not a fingerprint string with identity wildcards.
 */
export function buildJourneyReceipt(input, journeyResult, { clock = () => Date.now() } = {}) {
  const selectedProposalId = journeyResult.selectedProposalId ?? null;
  const proposalId = journeyResult.proposalId ?? null;
  const outcomeReason = journeyResult.outcomeReason ?? journeyResult.gate?.reason ?? null;
  const acceptanceKind = journeyResult.acceptanceKind ?? null;
  return {
    schema: RECEIPT_SCHEMA,
    version: RECEIPT_VERSION,
    createdAt: new Date(clock()).toISOString(),
    inputFingerprintSha256: fingerprintInput(input),
    taskId: journeyResult.taskId ?? null,
    selectedProposalId,
    proposalId,
    agreementStatus: journeyResult.agreement?.status ?? null,
    outcome: journeyResult.outcome ?? null,
    outcomeReason,
    acceptanceKind,
    ok: journeyResult.ok === true,
    gated: journeyResult.gated === true,
    boundArtifactSha256: journeyResult.boundArtifactSha256 ?? null,
    boundRevisionSha256: journeyResult.boundRevisionSha256 ?? null,
    agreementObjectiveComplete: journeyResult.agreement?.objectiveComplete ?? null,
    lifecycleStatus: journeyResult.lifecycle?.status ?? null,
    paymentActions: journeyResult.lifecycle?.paymentActions ?? [],
    correctionStatus: journeyResult.correction?.status ?? null,
    declaredSourceIdentity: input?.declaredSourceIdentity ?? null,
    steps: (journeyResult.steps || []).map((s) => ({
      step: s.step,
      status: s.status ?? s.decision ?? s.outcome ?? null,
      reason: s.reason ?? null,
    })),
    recheck: {
      method: "runRequesterDeliveryJourney(input) + receiptMatchesJourney(receipt, result, input)",
      compareFields: [
        "version",
        "inputFingerprintSha256",
        "taskId",
        "selectedProposalId",
        "proposalId",
        "agreementStatus",
        "outcome",
        "outcomeReason",
        "acceptanceKind",
        "ok",
        "gated",
        "boundArtifactSha256",
        "boundRevisionSha256",
        "lifecycleStatus",
        "agreementObjectiveComplete",
        "declaredSourceIdentity",
      ],
    },
    note: "Local experiment receipt only. No payment, acceptance authority, or publication claim.",
  };
}

/**
 * Structural validity only — schema/version/fingerprint string present.
 * Does NOT prove the receipt matches any particular journey replay.
 */
export function isReceiptStructurallyValid(receipt) {
  if (!receipt || typeof receipt !== "object") return false;
  if (receipt.schema !== RECEIPT_SCHEMA) return false;
  if (receipt.version !== RECEIPT_VERSION) return false;
  if (typeof receipt.inputFingerprintSha256 !== "string" || receipt.inputFingerprintSha256.length < 16) {
    return false;
  }
  return true;
}

/**
 * Replay-bound match. `replayInput` is required — omitting it is never a match.
 * Identities compare exactly (null === null only); no null wildcards on proposalId/agreementStatus.
 */
export function receiptMatchesJourney(receipt, journeyResult, replayInput) {
  if (replayInput == null) return false;
  if (!isReceiptStructurallyValid(receipt)) return false;
  if (receipt.inputFingerprintSha256 !== fingerprintInput(replayInput)) return false;

  const selectedProposalId = journeyResult.selectedProposalId ?? null;
  const proposalId = journeyResult.proposalId ?? null;
  const agreementStatus = journeyResult.agreement?.status ?? null;
  const outcomeReason = journeyResult.outcomeReason ?? journeyResult.gate?.reason ?? null;
  const acceptanceKind = journeyResult.acceptanceKind ?? null;
  const gated = journeyResult.gated === true;
  const declaredSourceIdentity = replayInput.declaredSourceIdentity ?? null;

  return (
    receipt.taskId === (journeyResult.taskId ?? null) &&
    receipt.selectedProposalId === selectedProposalId &&
    receipt.proposalId === proposalId &&
    receipt.agreementStatus === agreementStatus &&
    receipt.outcome === journeyResult.outcome &&
    receipt.outcomeReason === outcomeReason &&
    receipt.acceptanceKind === acceptanceKind &&
    receipt.ok === (journeyResult.ok === true) &&
    receipt.gated === gated &&
    receipt.boundArtifactSha256 === (journeyResult.boundArtifactSha256 ?? null) &&
    receipt.boundRevisionSha256 === (journeyResult.boundRevisionSha256 ?? null) &&
    receipt.lifecycleStatus === (journeyResult.lifecycle?.status ?? null) &&
    receipt.agreementObjectiveComplete === (journeyResult.agreement?.objectiveComplete ?? null) &&
    identitiesEqual(receipt.declaredSourceIdentity ?? null, declaredSourceIdentity)
  );
}

function identitiesEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    (a.kind ?? null) === (b.kind ?? null) &&
    (a.taskId ?? null) === (b.taskId ?? null) &&
    (a.operatorLabel ?? null) === (b.operatorLabel ?? null) &&
    Boolean(a.authenticated) === Boolean(b.authenticated)
  );
}
