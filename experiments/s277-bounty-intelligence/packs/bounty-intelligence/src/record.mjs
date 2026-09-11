import { SCHEMA_RECORD, AUTH_BOUNDARIES, VENDOR_ADAPTERS } from "./constants.mjs";
import { nowIso, deadlineExpired, ageSeconds } from "./clock.mjs";
import { opaqueTaskId, sha256Canonical } from "./hash.mjs";
import { atomicDecimalString } from "./money.mjs";
import { UNKNOWN } from "./unknown.mjs";

const EMPTY_EXPERIENCE = () => ({
  selfReported: { present: false, summary: null },
  verifiedCompletion: { present: false, evidence: null },
  verifiedPayout: { present: false, evidence: null },
  contributorEffort: { declared: false, hours: null, unknown: true },
  paidReview: { declared: false, amount: null, unknown: true },
});

export function termsPayload({
  title,
  description,
  reward,
  deadlineAt,
  verificationPaymentTerms,
  statusRaw,
  fundingStatus,
  claimPrereqs,
}) {
  return {
    title: title || "",
    description: description || "",
    reward: reward || null,
    deadlineAt: deadlineAt || null,
    verificationPaymentTerms: verificationPaymentTerms || null,
    statusRaw: statusRaw || null,
    fundingStatus: fundingStatus || null,
    claimPrereqs: claimPrereqs || [],
  };
}

export function buildRecord(input) {
  const now = nowIso(input.now);
  const adapter = input.adapter;
  const nativeId = input.nativeId == null ? null : String(input.nativeId);
  const unknowns = [...(input.unknowns || [])];
  const dataLabel = input.dataLabel || "derived";

  const rewardAmount = atomicDecimalString(input.rewardAmount);
  if (input.rewardAmount != null && input.rewardAmount !== "" && rewardAmount == null) {
    unknowns.push("reward.amount");
  }
  const rewardUnknown = rewardAmount == null;
  if (rewardUnknown && !unknowns.includes("reward.amount")) unknowns.push("reward.amount");

  const asset = input.rewardAsset || null;
  const network = input.rewardNetwork || null;
  if (!asset) unknowns.push("reward.asset");
  if (!network) unknowns.push("reward.network");

  const deadlineAt = input.deadlineAt || null;
  const deadlineUnknown = !deadlineAt;
  if (deadlineUnknown) unknowns.push("deadline.at");

  const sourceCreatedAt = input.sourceCreatedAt || null;
  const sourceUpdatedAt = input.sourceUpdatedAt || null;
  const observedAt = input.observedAt || now;
  if (!sourceCreatedAt) unknowns.push("freshness.sourceCreatedAt");
  if (!sourceUpdatedAt) unknowns.push("freshness.sourceUpdatedAt");

  const firstDollar = input.firstDollar === true || input.firstDollar === false ? input.firstDollar : UNKNOWN;
  const walletless =
    input.walletlessEligibility === true || input.walletlessEligibility === false
      ? input.walletlessEligibility
      : UNKNOWN;
  if (firstDollar === UNKNOWN) unknowns.push("claimability.firstDollar");
  if (walletless === UNKNOWN) unknowns.push("claimability.walletlessEligibility");

  const fundingStatus = input.fundingStatus || "unknown";
  if (fundingStatus === "unknown") unknowns.push("funding.status");

  const terms = termsPayload({
    title: input.title,
    description: input.description,
    reward: { amount: rewardAmount, asset, network },
    deadlineAt,
    verificationPaymentTerms: input.verificationPaymentTerms || null,
    statusRaw: input.statusRaw || null,
    fundingStatus,
    claimPrereqs: input.prerequisites || [],
  });
  const termsVersion = sha256Canonical(terms).slice(0, 32);

  const taskId = input.taskId || opaqueTaskId(adapter, nativeId);

  const verificationUnknown = !input.verificationPaymentTerms;
  if (verificationUnknown) unknowns.push("verificationPaymentTerms");

  const identityRequired =
    input.identityRequired === true || input.identityRequired === false ? input.identityRequired : UNKNOWN;
  if (identityRequired === UNKNOWN) unknowns.push("claimability.identityRequired");

  const record = {
    schema: SCHEMA_RECORD,
    dataLabel,
    fixtureKind: input.fixtureKind || null,
    taskId,
    termsVersion,
    observedAt,
    title: input.title || "",
    description: input.description == null ? null : String(input.description),
    source: {
      adapter,
      kind: input.kind || adapter,
      url: input.url || null,
      nativeId,
      vendorAdapter: input.vendorAdapter ?? VENDOR_ADAPTERS[adapter] ?? null,
      inaccessible: Boolean(input.inaccessible),
      inaccessibleReason: input.inaccessibleReason || null,
      labSchedule: Boolean(input.labSchedule),
      authBoundary: input.authBoundary || AUTH_BOUNDARIES[adapter] || null,
      captureMode: input.captureMode || "captured_fixture",
      httpStatus: input.httpStatus ?? null,
      bodySha256: input.bodySha256 || null,
      classificationKind: input.classificationKind || "external_task",
    },
    status: {
      lifecycle: input.lifecycle || "unknown",
      raw: input.statusRaw || null,
      cancelled: Boolean(input.cancelled),
      closed: Boolean(input.closed),
      availablePaidJob: false,
      exclusionReasons: [],
    },
    freshness: {
      sourceCreatedAt,
      sourceUpdatedAt,
      observedAt,
      stale: false,
      staleAfterSeconds: null,
      unknown: !observedAt,
    },
    reward: {
      amount: rewardAmount,
      asset,
      network,
      unknown: rewardUnknown,
      provenance: input.rewardProvenance || "unknown",
    },
    funding: {
      status: fundingStatus,
      evidenceKind: input.fundingEvidenceKind || "unknown",
      present: input.fundingPresent === true || input.fundingPresent === false ? input.fundingPresent : null,
      verified: false,
      escrowTxHash: input.escrowTxHash || null,
      disclaimer:
        input.fundingDisclaimer ||
        "Funding flags and escrow hashes are source assertions. This pack does not verify chain state or remaining claimable balance.",
    },
    claimability: {
      state: input.claimState || "unknown",
      prerequisites: [...(input.prerequisites || [])],
      identityRequired,
      firstDollar,
      walletlessEligibility: walletless,
      slotsAvailable: Number.isInteger(input.slotsAvailable) ? input.slotsAvailable : null,
      claimAuthority: "none",
      sourceClaimAvailable: input.sourceClaimAvailable === true || input.sourceClaimAvailable === false ? input.sourceClaimAvailable : null,
    },
    deadline: {
      at: deadlineAt,
      expired: deadlineExpired(deadlineAt, now),
      unknown: deadlineUnknown,
    },
    revision: {
      termsVersion,
      termsFingerprint: termsVersion,
    },
    verificationPaymentTerms: {
      verbatim: input.verificationPaymentTerms || null,
      unknown: verificationUnknown,
    },
    experience: input.experience || EMPTY_EXPERIENCE(),
    interopHints: {
      contributorPublicId: input.contributorPublicId || null,
      payoutDestination: input.payoutDestination || null,
    },
    unknowns: [...new Set(unknowns)],
    raw: input.raw || null,
  };

  record.freshness.ageSeconds = ageSeconds(observedAt, now);
  return record;
}

export function emptyExperience() {
  return EMPTY_EXPERIENCE();
}
