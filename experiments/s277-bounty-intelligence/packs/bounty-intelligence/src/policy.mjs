import { DEFAULT_POLICY } from "./constants.mjs";

export function mergePolicy(overrides = {}) {
  const out = { ...DEFAULT_POLICY, ...overrides, schema: DEFAULT_POLICY.schema };
  for (const k of [
    "effortHours",
    "hourlyCostAmount",
    "assumedFeeBps",
    "fundingConfidenceReserved",
    "claimConfidenceIdentity",
    "claimConfidenceEligibility",
    "maxUncertainty",
    "netReturnWeight",
    "uncertaintyWeight",
  ]) {
    if (out[k] != null) out[k] = String(out[k]);
  }
  if (out.staleAfterSeconds != null) out.staleAfterSeconds = Number(out.staleAfterSeconds);
  out.includeForumRewards = Boolean(out.includeForumRewards);
  out.includeLabSchedule = Boolean(out.includeLabSchedule);
  out.includeUnfunded = Boolean(out.includeUnfunded);
  out.treatUsdcAsUsd = out.treatUsdcAsUsd !== false;
  return out;
}
