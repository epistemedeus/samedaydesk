import {
  F08_DIR,
  F08_SHA,
  I01_GOLDEN_TERMS_VERSION,
  I01_PR,
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  MUTATION_BOUNDARY,
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
    f08: { directory: F08_DIR, pin: F08_SHA, rewritten: false },
    sdsMain: SDS_MAIN_SHA,
    liveExtractUnpaid: {
      amount: LIVE_EXTRACT_PRICE_USDC,
      amountAtomic: LIVE_EXTRACT_ATOMIC,
      note: "Recorded, not changed. HTTP 402 is not success.",
    },
    mutationBoundary: MUTATION_BOUNDARY,
    ...extra,
  };
}
