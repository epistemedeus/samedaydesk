import {
  ACK_SCHEMA,
  CALLBACK_SCHEMA,
  DELIVERY_STATES,
  F08_RECEIPT_SCHEMA,
  SDS52_PIN_SHA,
  TERMS_MAPPING_ID,
  TERMS_MAPPING_VERSION,
  TERMS_SCHEMA,
} from "./pins.mjs";

/**
 * Small published interface for consumers. D01 may later amend the wrapper;
 * this outbox is tested against SDS52 receipt.v1, not a future sibling.
 */
export const OUTBOX_CONTRACT = Object.freeze({
  schema: "samedaydesk.job-delivery-outbox.contract.v1",
  commands: Object.freeze(["enqueue", "deliver-once", "status", "reconcile"]),
  deliveryStates: DELIVERY_STATES,
  receiptSchema: F08_RECEIPT_SCHEMA,
  termsSchema: TERMS_SCHEMA,
  callbackSchema: CALLBACK_SCHEMA,
  ackSchema: ACK_SCHEMA,
  termsMapping: Object.freeze({
    id: TERMS_MAPPING_ID,
    version: TERMS_MAPPING_VERSION,
    source: F08_RECEIPT_SCHEMA,
    dest: TERMS_SCHEMA,
    unlikeHashesNotForcedEqual: true,
  }),
  destination: Object.freeze({
    identity: "loopback origin + pathname + search",
    originIsNotDestination: true,
  }),
  ackBinds: Object.freeze(["eventId", "callbackPath", "outputsDigest"]),
  sold: false,
  sale: false,
  buyerAccepted: false,
  testedWrapperPin: SDS52_PIN_SHA,
  d01Binding: "not imported; consume SDS52 receipt.v1 until W5-D01 publishes",
});
