import {
  FIXTURE_PAY_TO,
  FIXTURE_PRICE_ATOMIC,
  FIXTURE_PRICE_USDC,
  LIVE_EXTRACT_PRICE_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_PAY_TO,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
} from "./pins.mjs";

export function fixturePrice(engineId, itemId) {
  return {
    labelled: true,
    live: false,
    publishedToLiveCatalog: false,
    kind: "fixture",
    engineId,
    itemId: itemId || null,
    amountUsdc: FIXTURE_PRICE_USDC,
    amountAtomic: FIXTURE_PRICE_ATOMIC,
    payTo: FIXTURE_PAY_TO,
    note: "Non-live labelled fixture. Not extract $0.005 or seller-integrity-audit $0.01.",
  };
}

function asPriceString(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    if (value === 0.005) return LIVE_EXTRACT_PRICE_USDC;
    if (value === 0.01) return LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC;
    if (value === 0.02) return FIXTURE_PRICE_USDC;
    return String(value);
  }
  return String(value).replace(/^\$/, "").trim();
}

function isLiveExtract(value) {
  const s = asPriceString(value);
  return s === LIVE_EXTRACT_PRICE_USDC || s === LIVE_EXTRACT_PRICE_ATOMIC || s === "5000";
}

function isLiveSellerIntegrity(value) {
  const s = asPriceString(value);
  return s === LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC || s === "0.010" || s === "10000";
}

export function livePriceMutation(item = {}, request = {}) {
  const candidates = [
    item.price,
    item.amountUsdc,
    item.amount,
    item?.payment?.accepted?.amount,
    item?.payment?.price,
    request.publishPriceUsdc,
    request.catalogPrice,
  ];
  for (const value of candidates) {
    if (isLiveExtract(value)) {
      return {
        code: "live-price-mutation-refused",
        message: "Refusing to change live extract 0.005 USDC or treat it as this fixture price",
        livePrice: LIVE_EXTRACT_PRICE_USDC,
      };
    }
    if (isLiveSellerIntegrity(value)) {
      return {
        code: "live-price-mutation-refused",
        message: "Refusing to change live seller-integrity-audit 0.01 USDC or treat it as this fixture price",
        livePrice: LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
      };
    }
  }
  if (item.publishToLiveCatalog === true || request.publishToLiveCatalog === true) {
    return {
      code: "live-price-mutation-refused",
      message: "Fixture prices are not published to the live catalog",
    };
  }
  const payTo = item?.payment?.accepted?.payTo || item?.payment?.payTo;
  if (
    typeof payTo === "string" &&
    payTo.toLowerCase() === LIVE_PAY_TO.toLowerCase() &&
    (item.sold === true || item.fundingIntent === "sale" || item.fundingIntent === "live-sale")
  ) {
    return {
      code: "live-price-mutation-refused",
      message: "Live payTo plus sale intent is not a fixture batch item",
    };
  }
  return null;
}

export function assertNotLiveCatalogWrite() {
  return {
    liveExtractUsdc: LIVE_EXTRACT_PRICE_USDC,
    liveSellerIntegrityAuditUsdc: LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
    fixtureUsdc: FIXTURE_PRICE_USDC,
    publishedToLiveCatalog: false,
  };
}
