export const JOURNEY_SCHEMA = "samedaydesk.two-sided-work.journey.v1";
export const LOCK_SCHEMA = "samedaydesk.two-sided-work.retained-lock.v1";
export const POST_SCHEMA = "samedaydesk.two-sided-work.post.v1";
export const CLAIM_SCHEMA = "samedaydesk.two-sided-work.claim.v1";
export const SELECTION_SCHEMA = "samedaydesk.two-sided-work.selection.v1";
export const DELIVERY_SCHEMA = "samedaydesk.two-sided-work.delivery.v1";
export const ACCEPTANCE_SCHEMA = "samedaydesk.two-sided-work.acceptance.v1";
export const PUBLIC_PROOF_SCHEMA = "samedaydesk.two-sided-work.public-proof.v1";
export const PUBLIC_VIEW_SCHEMA = "samedaydesk.two-sided-work.public-view.v1";
export const FEE_PROJECTION_SCHEMA = "samedaydesk.two-sided-work.fee-projection.v1";
export const WHOLE_EFFORT_SCHEMA = "samedaydesk.two-sided-work.whole-effort.v1";
export const API_SCHEMA = "samedaydesk.two-sided-work.api.v1";

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/;
export const CLOCK_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const FORBIDDEN_COMMANDS = Object.freeze([
  "pay",
  "sign",
  "settle",
  "transfer",
  "unlock",
  "capture",
  "send",
]);

export const REWARD_KEY_NAMES = Object.freeze([
  "reward",
  "rewardatomic",
  "gross",
  "grossatomic",
  "platformfee",
  "platformfeeatomic",
  "contributornet",
  "contributornetatomic",
  "railcost",
  "railcostatomic",
  "payout",
  "payoutdestination",
  "price",
  "feeatomic",
  "equalnetnote",
  "breakenevengrossatomic",
]);

const PRIVATE_REWARD_PATHS = new Set([
  "grossAtomic",
  "railCostAtomic",
  "terms.feeBps",
  "terms.feeBasis",
  "terms.fee.bps",
  "terms.fee.basis",
  "effort.directCostAtomic",
  "effort.bundledShareAtomic",
  "effort.costAtomic",
  "costLines.atomic",
]);

export function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[_-]/g, "");
}

export function isRewardKey(key) {
  return REWARD_KEY_NAMES.includes(normalizeKey(key));
}

export function privateRewardPathAllowed(path) {
  if (PRIVATE_REWARD_PATHS.has(path)) return true;
  return /^costLines\.\d+\.atomic$/.test(path);
}

export function capabilityStamp() {
  return {
    ledger: false,
    signer: false,
    paymentCommand: false,
    automaticUnlock: false,
    fundedCommission: false,
    marketLiquidity: false,
    outsideUse: "not_observed",
    paymentEvidence: "none",
    installed: false,
    prepared: true,
  };
}
