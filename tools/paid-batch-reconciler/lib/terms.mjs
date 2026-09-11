import {
  hashTermsVersion,
  hashTermsIgnoringIntegerKey,
  isTermsVersionHash,
  TERMS_VERSION_RE,
} from "../vendor/funded-task-terms/src/hash.mjs";
import { FIXTURE_PRICE_ATOMIC, FIXTURE_PRICE_USDC, TERMS_SCHEMA, TERMS_SHAPE_VERSION } from "./pins.mjs";

export { hashTermsVersion, hashTermsIgnoringIntegerKey, isTermsVersionHash, TERMS_VERSION_RE };

export function integerTermsVersionRejected(value) {
  return typeof value === "number" && Number.isInteger(value);
}

export function buildBatchTerms({ items, termsRevision = 0 }) {
  const charges = (items || []).map((item) => ({
    itemId: item.id,
    engineId: item.engineId,
    amountUsdc: FIXTURE_PRICE_USDC,
    amountAtomic: FIXTURE_PRICE_ATOMIC,
    kind: "fixture",
  }));
  return {
    schema: TERMS_SCHEMA,
    schemaVersion: TERMS_SHAPE_VERSION,
    termsRevision,
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    fixturePriceUsdc: FIXTURE_PRICE_USDC,
    fixturePriceAtomic: FIXTURE_PRICE_ATOMIC,
    itemCount: charges.length,
    charges,
  };
}

export function termsVersionForBatch(input) {
  return hashTermsVersion(input);
}
