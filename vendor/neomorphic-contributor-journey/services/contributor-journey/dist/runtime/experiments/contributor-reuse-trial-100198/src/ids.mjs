import { createHash } from "node:crypto";
import { OFFER_ID } from "./constants.mjs";

export const CONTRIBUTOR_ID_GRAMMAR = "^[a-z0-9_]{1,64}$";
export const CONTRIBUTOR_ID_PATTERN = new RegExp(CONTRIBUTOR_ID_GRAMMAR);

export function contributorIdAccepted(value) {
  return typeof value === "string" && CONTRIBUTOR_ID_PATTERN.test(value);
}

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function reservationIdFor(termsVersion, idempotencyKey) {
  return `rsv_${sha256Text(`${OFFER_ID}\n${termsVersion}\n${idempotencyKey}`).slice(0, 24)}`;
}
