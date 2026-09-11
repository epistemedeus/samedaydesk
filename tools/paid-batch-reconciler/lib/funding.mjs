/**
 * Classification contract lives on SDS PR52 `server/paid-useful-jobs/lib/funding.mjs`.
 * This package does not reimplement reserved-fixture / settle rules.
 * Import classifyFunding / wouldSettleIfGuardOmitted from the pin via loadF08Module.
 */
import { FIXTURE_PAY_TO, FIXTURE_PRICE_ATOMIC, LIVE_ASSET, LIVE_NETWORK } from "./pins.mjs";

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

export function isSaleLikeItem(item) {
  const intent = item?.fundingIntent || item?.funding;
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    intent === "reserved-fixture" ||
    item?.settle === true ||
    item?.liveSettle === true ||
    item?.sold === true ||
    Boolean(item?.payment)
  );
}

export { isPlainObject };
