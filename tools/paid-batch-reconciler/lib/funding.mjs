/**
 * Ledger-owned funding classification matching the published F08 contract
 * (unfunded | reserved-fixture | rejected; sold never true). This is not a
 * copy of F08's wrapper kernel; F08 remains an optional injected adapter.
 */
import {
  FIXTURE_PAY_TO,
  FIXTURE_PRICE_ATOMIC,
  LIVE_ASSET,
  LIVE_NETWORK,
} from "./pins.mjs";
import { livePriceMutation } from "./prices.mjs";
import { wantsLiveSale } from "./sample.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
        nonce: "0xc08fixture000000000000000000000000000000000000000000000000000001",
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
 * Structural Exact-EVM v2 settle shape from the published F08 funding contract.
 * Used only as a seeded negative; this ledger never live-settles.
 */
export function wouldSettleIfGuardOmitted(paymentPayload, requirements) {
  if (!isPlainObject(paymentPayload) || !isPlainObject(requirements)) return false;
  if (paymentPayload.x402Version !== 2) return false;
  if (requirements.scheme !== "exact") return false;
  const network = requirements.network;
  if (typeof network !== "string" || !network.startsWith("eip155:")) return false;
  const payload = paymentPayload.payload;
  if (!isPlainObject(payload) || !isPlainObject(payload.authorization)) return false;
  if (typeof payload.signature !== "string" || !payload.signature.startsWith("0x")) return false;
  if (payload.signature.length < 10) return false;
  return true;
}

function isSaleLikeFunding(item, { payment, intent, settleRequested }) {
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    intent === "reserved-fixture" ||
    settleRequested ||
    item?.sold === true ||
    Boolean(payment)
  );
}

export function classifyFunding(item, { sample = false } = {}) {
  const payment = item?.payment && typeof item.payment === "object" ? item.payment : null;
  const intent = item?.fundingIntent || item?.funding || (payment ? "reserved-fixture" : "unfunded");
  const settleRequested = item?.settle === true || item?.liveSettle === true;

  const priceHit = livePriceMutation(item, item);
  if (priceHit) {
    return {
      fundingState: "rejected",
      sold: false,
      code: priceHit.code,
      message: priceHit.message,
    };
  }

  if (sample && isSaleLikeFunding(item, { payment, intent, settleRequested })) {
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
    return {
      fundingState: "rejected",
      sold: false,
      code: "fixture-cannot-live-settle",
      message: "Payment payload looks settleable; fixture guard refuses live settle (purchaseAuthority false)",
      purchaseAuthority: false,
      liveSettleAllowed: false,
    };
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

export { wantsLiveSale };
