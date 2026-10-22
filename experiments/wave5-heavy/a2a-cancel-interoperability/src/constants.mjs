export const PACK_ID = "w5-a2a-cancel-interoperability";
export const SCHEMA = "samedaydesk.w5_a2a_cancel.result.v1";
export const OWNER_TOKEN = "owner-label-alpha";
export const FOREIGN_TOKEN = "foreign-label-beta";
export const LONG_MS = 20000;
export const SHORT_MS = 400;
export const POLL_MS = 40;

export const HONESTY = Object.freeze({
  fixture: true,
  labelled: true,
  productionCardTouched: false,
  paymentAuthority: "none",
  wallet: false,
  webhook: false,
  filing: false,
  effectfulJob: false,
  quantitativeSavingsInvented: false,
  a2aCancelWiredToPayout: false,
  a2aCancelWiredToOwnerReject: false,
});
