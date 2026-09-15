import { honestyEnvelope } from "./honesty.mjs";
import { DOSSIER_SCHEMA, ERROR_CODES } from "./pins.mjs";

export function refuse(code, message, extra = {}) {
  return {
    ok: false,
    status: "reject",
    schema: DOSSIER_SCHEMA,
    code,
    message,
    sold: false,
    deliveryInHand: false,
    refundAttempted: extra.refundAttempted === true,
    paymentRetried: false,
    paymentSignatureSent: false,
    stripeCalled: false,
    honesty: honestyEnvelope(),
    ...extra,
  };
}

export const CODES = ERROR_CODES;
