import { HONESTY_PACK_NOTES, LANE } from "./constants.mjs";

/**
 * Map verifier facts onto honesty flags without collapsing
 * evidence / suggestion / publish into one boolean.
 */
export function buildHonesty({ sourceBound, suggestion, publishAttempted, ok }) {
  return {
    schema: "sds.listing_repair_verifier.honesty.v1",
    notes: [...HONESTY_PACK_NOTES],
    lanes: {
      [LANE.EVIDENCE]: sourceBound === true,
      [LANE.SUGGESTION]: suggestion === true,
      [LANE.PUBLISH]: false,
      [LANE.ACCEPTED_CORRECTION]: ok === true,
    },
    publishAttempted: publishAttempted === true,
    executionVerified: false,
    purchaseAuthority: false,
    republishKit: false,
  };
}
