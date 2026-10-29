import {
  hashTermsVersion,
  hashTermsIgnoringIntegerKey,
  isTermsVersionHash,
  TERMS_VERSION_RE,
} from "../vendor/funded-task-terms/src/hash.mjs";
import { TERMS_SCHEMA, TERMS_SHAPE_VERSION } from "./pins.mjs";

export { hashTermsVersion, hashTermsIgnoringIntegerKey, isTermsVersionHash, TERMS_VERSION_RE };

export function integerTermsVersionRejected(value) {
  return typeof value === "number" && Number.isInteger(value);
}

export function buildBatchTerms({ itemCount, engineIds, termsRevision = 0 }) {
  return {
    schema: TERMS_SCHEMA,
    schemaVersion: TERMS_SHAPE_VERSION,
    termsRevision,
    sold: false,
    purchaseAuthority: false,
    liveSettlement: "out-of-scope",
    fixturePriceUsdc: "0.02",
    fixturePriceAtomic: "20000",
    itemCount,
    engineIds: [...engineIds].sort(),
  };
}

export function termsVersionForBatch(input) {
  return hashTermsVersion(input);
}
