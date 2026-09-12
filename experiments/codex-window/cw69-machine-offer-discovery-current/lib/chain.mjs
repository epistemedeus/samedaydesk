import { JOB_ID, MERCHANT_OPERATION_ID, MERCHANT_URL } from "./constants.mjs";

export function nameLinkedChain(identity, merchant) {
  if (!identity?.jobId) {
    return {
      status: "unknown",
      reason: "no job identity",
      observedOffer: { status: "unknown" },
      workableTask: { status: "unknown" },
      qualifiedActivation: { status: "unknown" },
      usefulMerchantJob: { status: "unknown" },
    };
  }

  const offerMatches =
    identity.jobId === JOB_ID &&
    merchant?.operationId === MERCHANT_OPERATION_ID &&
    merchant?.captureStatus === 402 &&
    merchant?.paymentSent === false;

  if (!offerMatches) {
    return {
      status: "unknown",
      reason: "no linked evidence binding observed offer to a workable local task",
      observedOffer: { status: "unknown" },
      workableTask: identity.jobId
        ? { status: "local-identity-only", jobId: identity.jobId }
        : { status: "unknown" },
      qualifiedActivation: { status: "unknown", reason: "no payment, claim, checkout, or customer contact" },
      usefulMerchantJob: { status: "unknown" },
    };
  }

  return {
    status: "linked",
    reason:
      "Local job id lockfile-pin-delta matches hosted POST /lockfile-pin-delta capture. Route is published and unpaid. Local execution is non-settling.",
    observedOffer: {
      kind: "hosted-evidence",
      jobId: JOB_ID,
      url: MERCHANT_URL,
      method: "POST",
      captureStatus: merchant.captureStatus,
      paid: false,
      protocols: merchant.protocols,
    },
    workableTask: {
      kind: "source-capture",
      jobId: JOB_ID,
      cli: identity.runtime.cliPath,
      requiredInputs: identity.runtime.requiredInputs,
      outputs: identity.runtime.outputs,
      purchaseAuthority: false,
    },
    qualifiedActivation: {
      status: "unknown",
      reason: "no payment, claim, checkout, deployment, or customer contact",
    },
    usefulMerchantJob: {
      status: "published-unpaid",
      operationId: MERCHANT_OPERATION_ID,
      executed: false,
      illustrativeChargedOutputIsExecution: false,
    },
  };
}
