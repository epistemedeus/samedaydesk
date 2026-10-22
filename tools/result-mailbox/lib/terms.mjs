import {
  hashTermsVersion as i01HashTermsVersion,
  isTermsVersionHash,
} from "../vendor/i01-funded-task-terms/hash.mjs";
import { MAILBOX_TERMS_SCHEMA, SCHEMA_VERSION } from "./pins.mjs";
import { refuse } from "./errors.mjs";

/**
 * Mailbox pickup/expiry/sample-delivery contract. Content-hashed with I01's
 * hasher. schemaVersion is the integer shape. termsRevision is a correction
 * counter, never a public claim key. Integer termsVersion is rejected.
 */
export const MAILBOX_TERMS = Object.freeze({
  schema: MAILBOX_TERMS_SCHEMA,
  schemaVersion: SCHEMA_VERSION,
  termsRevision: 0,
  pickup: "copy-verified-bytes-write-pickup-json",
  ack: "request-bound-delivered-acknowledgment",
  pickupIsNotDelivery: true,
  requestBound: true,
  expiry: "labelled-timestamp-comparison",
  sampleDeliveredToBuyer: false,
  purchaseAuthority: false,
  liveSettlement: "out-of-scope",
  sold: false,
  daemon: false,
});

export function hashMailboxTerms(hasher = i01HashTermsVersion) {
  return hasher({ ...MAILBOX_TERMS });
}

export const MAILBOX_TERMS_VERSION = hashMailboxTerms();

export function assertTermsVersion(value) {
  if (typeof value === "number" || Number.isInteger(value)) {
    throw refuse(
      "invalid-terms-version",
      "termsVersion must be sha256:<64 hex> (I01 content hash); integer termsVersion is rejected",
      { detail: { receivedType: typeof value } },
    );
  }
  if (!isTermsVersionHash(value)) {
    throw refuse(
      "invalid-terms-version",
      "termsVersion must be sha256:<64 hex> (I01 content hash)",
      { detail: { receivedType: typeof value } },
    );
  }
  if (value !== MAILBOX_TERMS_VERSION) {
    throw refuse(
      "terms-changed",
      "envelope termsVersion does not match the mailbox pickup contract",
      { detail: { expected: MAILBOX_TERMS_VERSION } },
    );
  }
  return value;
}

export { i01HashTermsVersion, isTermsVersionHash };
