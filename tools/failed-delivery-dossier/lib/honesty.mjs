import {
  F08_DIR,
  F08_SHA,
  I01_GOLDEN_TERMS_VERSION,
  I01_PR,
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  MUTATION_BOUNDARY,
  SDS52_PR,
  SDS52_REF,
  SDS52_SHA,
  SDS_MAIN_SHA,
} from "./pins.mjs";

export function honestyEnvelope(extra = {}) {
  return {
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    refundAttempted: false,
    paymentRetried: false,
    paymentSignatureSent: false,
    stripeCalled: false,
    readyForRelease: false,
    termsVersionKind: "sha256-content-hash",
    i01TermsOwner: I01_PR,
    i01GoldenTermsVersion: I01_GOLDEN_TERMS_VERSION,
    f08: {
      directory: F08_DIR,
      pin: F08_SHA,
      rewritten: false,
      role: "fixture-capture",
      equalsSds52: false,
    },
    sds52: {
      pin: SDS52_SHA,
      ref: SDS52_REF,
      pr: SDS52_PR,
      rewritten: false,
      role: "current-wrapper",
    },
    sdsMain: SDS_MAIN_SHA,
    sourceStatus: {
      sdsMain: { sha: SDS_MAIN_SHA, status: "claimed", evidence: null },
      f08Capture: { sha: F08_SHA, status: "fixture", evidence: null },
      sds52: { sha: SDS52_SHA, status: "claimed", evidence: null },
    },
    liveExtractUnpaid: {
      amount: LIVE_EXTRACT_PRICE_USDC,
      amountAtomic: LIVE_EXTRACT_ATOMIC,
      observationStatus: "unrun",
      observedHttpStatus: null,
      note: "Catalog amount is expected. Live extract HTTP was not observed.",
    },
    checks: [],
    mutationBoundary: MUTATION_BOUNDARY,
    ...extra,
  };
}
