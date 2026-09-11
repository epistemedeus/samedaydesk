import {
  FIXTURE_PAY_TO,
  FIXTURE_PRICE_ATOMIC,
  FIXTURE_PRICE_USDC,
  LIVE_ASSET,
  LIVE_NETWORK,
} from "./pins.mjs";
import { isExactEvmV2IndexingContinuitySupported } from "./continuity.mjs";
import { refuse } from "./input-guard.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const FUNDING_STATES = Object.freeze(["unfunded", "reserved-fixture", "rejected"]);

export function fixturePaymentTemplate() {
  return {
    fixture: true,
    purchaseAuthority: false,
    label: "fixture",
    live: false,
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: LIVE_NETWORK,
      amount: FIXTURE_PRICE_ATOMIC,
      asset: LIVE_ASSET,
      payTo: FIXTURE_PAY_TO,
      maxTimeoutSeconds: 300,
    },
    payload: {
      authorization: {
        from: "0x00000000000000000000000000000000000000F1",
        to: FIXTURE_PAY_TO,
        value: FIXTURE_PRICE_ATOMIC,
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0xf08fixture000000000000000000000000000000000000000000000000000001",
      },
      signature: `0x${"ab".repeat(65)}`,
    },
  };
}

export function isFixturePayment(payment) {
  if (!isPlainObject(payment)) return false;
  if (payment.fixture === true) return true;
  if (payment.purchaseAuthority === false && payment.label === "fixture") return true;
  if (payment.live === false && payment.label === "fixture") return true;
  if (typeof payment.payTo === "string" && payment.payTo.toLowerCase() === FIXTURE_PAY_TO.toLowerCase()) {
    return true;
  }
  if (
    isPlainObject(payment.accepted) &&
    typeof payment.accepted.payTo === "string" &&
    payment.accepted.payTo.toLowerCase() === FIXTURE_PAY_TO.toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * True when a real Exact-EVM v2 ResourceServer could attempt settle if the
 * fixture / non-settling guards were omitted. Used only as a seeded negative.
 */
export function wouldSettleIfGuardOmitted(paymentPayload, requirements) {
  if (!isExactEvmV2IndexingContinuitySupported(paymentPayload, requirements)) return false;
  const payload = paymentPayload.payload;
  if (!isPlainObject(payload)) return false;
  if (!isPlainObject(payload.authorization)) return false;
  if (typeof payload.signature !== "string" || !payload.signature.startsWith("0x")) return false;
  if (payload.signature.length < 10) return false;
  return true;
}

export function classifyFunding(request, { sample = false } = {}) {
  const payment = request?.payment && typeof request.payment === "object" ? request.payment : null;
  const intent = request?.fundingIntent || request?.funding || (payment ? "reserved-fixture" : "unfunded");
  const settleRequested = request?.settle === true || request?.liveSettle === true;

  if (sample && (intent === "live-sale" || intent === "sale" || settleRequested || request?.sold === true)) {
    return {
      fundingState: "rejected",
      sold: false,
      code: "sample-not-a-sale",
      message: "SAMPLE/--example inputs produce labeled sample output and cannot be treated as a paid sale",
    };
  }

  if (settleRequested) {
    return {
      fundingState: "rejected",
      sold: false,
      code: "live-settle-out-of-scope",
      message: "Live settlement is out of scope; fixture/test payments cannot call live settle",
      wouldSettleIfGuardOmitted: payment
        ? wouldSettleIfGuardOmitted(payment, payment.accepted || payment.requirements || null)
        : false,
    };
  }

  if (intent === "live-sale" || intent === "sale") {
    return {
      fundingState: "rejected",
      sold: false,
      code: "live-sale-not-available",
      message: "This envelope is local and non-settling. Fixture payments are not live sales.",
    };
  }

  if (payment && isFixturePayment(payment)) {
    return {
      fundingState: "reserved-fixture",
      sold: false,
      purchaseAuthority: false,
      fixture: true,
    };
  }

  if (payment && wouldSettleIfGuardOmitted(payment, payment.accepted || payment.requirements || null)) {
    // Looks settleable but this envelope never live-settles. Fail closed.
    throw refuse(
      "fixture-cannot-live-settle",
      "Payment payload looks settleable; fixture guard refuses live settle (purchaseAuthority false)",
      { purchaseAuthority: false, liveSettleAllowed: false },
    );
  }

  if (intent === "reserved-fixture") {
    return {
      fundingState: "reserved-fixture",
      sold: false,
      purchaseAuthority: false,
      fixture: true,
    };
  }

  return {
    fundingState: "unfunded",
    sold: false,
    purchaseAuthority: false,
  };
}

export function fixturePriceNote(jobId) {
  return {
    labelled: true,
    live: false,
    publishedToLiveCatalog: false,
    jobId,
    amountUsdc: FIXTURE_PRICE_USDC,
    amountAtomic: FIXTURE_PRICE_ATOMIC,
    payTo: FIXTURE_PAY_TO,
    note: "Non-live labelled fixture. Not extract $0.005 or seller-integrity-audit $0.01.",
  };
}
