import { REFUND_CLAIMS } from "./contract.mjs";
import { applyExplicitPolicy } from "./policy.mjs";
import { factsFromSettlement } from "./facts.mjs";

export { REFUND_CLAIMS };

export function classifyRefundClaim(record, policy = null) {
  const applied = applyExplicitPolicy(policy, factsFromSettlement(record));
  return assertRefundClaim(applied.refundClaim);
}

export function projectClaim(facts, policy = null) {
  const applied = applyExplicitPolicy(policy, facts);
  return {
    ...applied,
    refundClaim: assertRefundClaim(applied.refundClaim),
  };
}

export function assertRefundClaim(value) {
  if (!REFUND_CLAIMS.includes(value)) {
    throw new Error(`refundClaim is not in the closed set: ${value}`);
  }
  return value;
}
