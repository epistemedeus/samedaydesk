import { CLAIM_STATE, FUNDING } from "./constants.mjs";
import { ageSeconds } from "./clock.mjs";
import { mergePolicy } from "./policy.mjs";
import {
  atomicDecimalString,
  applyFactor,
  bpsFactor,
  cmpDecimal,
  isPositiveAmount,
  mulDecimal,
  subDecimal,
} from "./money.mjs";

const FORUM_KINDS = new Set(["referral_campaign", "forum_marketing", "forum_linked"]);

export function exclusionReasons(record, policy, now) {
  const reasons = [];
  if (record.source?.inaccessible) reasons.push("inaccessible_source");
  if (record.source?.labSchedule) reasons.push("lab_schedule_not_paid_job");
  if (record.status?.cancelled) reasons.push("cancelled");
  if (record.status?.closed) reasons.push("closed");
  const life = String(record.status?.lifecycle || "").toLowerCase();
  if (!["open", "bidding"].includes(life)) reasons.push(`lifecycle_${life || "unknown"}`);
  if (record.deadline?.expired) reasons.push("deadline_expired");

  const staleAfter = policy.staleAfterSeconds;
  const age = ageSeconds(record.freshness?.observedAt || record.observedAt, now);
  if (age == null) reasons.push("freshness_unknown");
  else if (age > staleAfter) reasons.push("stale_observation");

  const funding = record.funding?.status;
  if (funding === FUNDING.UNFUNDED) reasons.push("unfunded");
  if (funding === FUNDING.UNKNOWN) reasons.push("funding_unknown");
  if (funding === FUNDING.RELEASED) reasons.push("funding_released");

  if (record.reward?.unknown || !isPositiveAmount(record.reward?.amount)) {
    reasons.push("reward_unknown_or_zero");
  }

  const kind = record.source?.classificationKind;
  if (FORUM_KINDS.has(kind) && !policy.includeForumRewards) {
    reasons.push("forum_marketing_or_referral");
  }

  if (record.claimability?.slotsAvailable === 0) reasons.push("no_claim_slots");

  return [...new Set(reasons)];
}

export function isAvailablePaidJob(record, policy, now) {
  const reasons = exclusionReasons(record, policy, now);
  const hard = reasons.filter((r) => {
    if (r === "forum_marketing_or_referral") return !policy.includeForumRewards;
    if (r === "lab_schedule_not_paid_job") return !policy.includeLabSchedule;
    return true;
  });
  // Policy cannot override closed/stale/unfunded/inaccessible/zero reward.
  const immutable = reasons.filter((r) =>
    [
      "inaccessible_source",
      "cancelled",
      "closed",
      "deadline_expired",
      "stale_observation",
      "unfunded",
      "funding_unknown",
      "funding_released",
      "reward_unknown_or_zero",
      "no_claim_slots",
      "freshness_unknown",
    ].includes(r) || r.startsWith("lifecycle_"),
  );
  return immutable.length === 0 && hard.length === 0;
}

function fundingConfidence(record, policy) {
  if (record.funding?.status === FUNDING.RESERVED) {
    return atomicDecimalString(policy.fundingConfidenceReserved) || "0.7";
  }
  return "0";
}

function claimConfidence(record, policy) {
  if (record.claimability?.state === CLAIM_STATE.NOT_CLAIMABLE) return "0";
  if (record.claimability?.state === CLAIM_STATE.CLAIMABLE_WITH_PREREQS) {
    const extra = (record.claimability.prerequisites || []).some((p) =>
      String(p).includes("eligible_operator_or_successful_paid_bounty"),
    );
    return extra
      ? atomicDecimalString(policy.claimConfidenceEligibility) || "0.4"
      : atomicDecimalString(policy.claimConfidenceIdentity) || "0.5";
  }
  return "0.2";
}

function uncertaintyScore(record, policy) {
  // 0 = certain, 1 = maximally uncertain. Additive penalties, capped at 1.
  let u = 0;
  if (record.funding?.verified !== true) u += 0.25;
  if (record.funding?.status !== FUNDING.RESERVED) u += 0.2;
  if (record.claimability?.state !== CLAIM_STATE.CLAIMABLE_WITH_PREREQS) u += 0.2;
  if (record.claimability?.identityRequired === true) u += 0.1;
  if (record.reward?.provenance === "sponsor_stated") u += 0.05;
  if (record.deadline?.unknown) u += 0.05;
  if (record.source?.classificationKind && FORUM_KINDS.has(record.source.classificationKind)) u += 0.15;
  if ((record.unknowns || []).length > 6) u += 0.05;
  if (u > 1) u = 1;
  const s = u.toFixed(2);
  const max = atomicDecimalString(policy.maxUncertainty) || "1";
  if (cmpDecimal(s, max) > 0) return max;
  return s;
}

export function expectedUsefulNetReturn(record, policy) {
  const gross = record.reward?.amount;
  if (!isPositiveAmount(gross)) return null;
  const feeKeep = bpsFactor(policy.assumedFeeBps) || "1";
  const afterFee = applyFactor(gross, feeKeep);
  const funded = applyFactor(afterFee, fundingConfidence(record, policy));
  const expected = applyFactor(funded, claimConfidence(record, policy));
  const effortCost = mulDecimal(policy.effortHours, policy.hourlyCostAmount);
  if (expected == null || effortCost == null) return null;
  return subDecimal(expected, effortCost);
}

function why(record, policy, net, unc) {
  const lines = [];
  lines.push(
    `lifecycle=${record.status?.lifecycle} funding=${record.funding?.status} (${record.funding?.evidenceKind}, verified=${record.funding?.verified}) reward=${record.reward?.amount || "unknown"} ${record.reward?.asset || ""}`.trim(),
  );
  lines.push(
    `expectedUsefulNetReturn=${net} (gross * fundingConf * claimConf - effortHours*hourlyCost; effortHours=${policy.effortHours} hourlyCost=${policy.hourlyCostAmount} ${policy.hourlyCostAsset})`,
  );
  lines.push(`uncertainty=${unc} (unverified funding, claim path, identity, missing fields — not popularity)`);
  lines.push("rank does not use shareCount, board marketing totals, GitHub reactions, or scraped demand");
  if (record.claimability?.prerequisites?.length) {
    lines.push(`prerequisites: ${record.claimability.prerequisites.join("; ")}`);
  }
  return lines;
}

export function annotateAvailability(records, policyInput, now) {
  const policy = mergePolicy(policyInput);
  return records.map((r) => {
    const reasons = exclusionReasons(r, policy, now);
    const available = isAvailablePaidJob(r, policy, now);
    return {
      ...r,
      freshness: {
        ...r.freshness,
        stale: reasons.includes("stale_observation"),
        staleAfterSeconds: policy.staleAfterSeconds,
        unknown: reasons.includes("freshness_unknown"),
      },
      status: {
        ...r.status,
        availablePaidJob: available,
        exclusionReasons: reasons,
      },
    };
  });
}

export function rank(records, policyInput, { now } = {}) {
  const policy = mergePolicy(policyInput);
  const annotated = annotateAvailability(records, policy, now);
  const scored = annotated.map((r) => {
    const available = r.status.availablePaidJob;
    const net = available ? expectedUsefulNetReturn(r, policy) : null;
    const unc = available ? uncertaintyScore(r, policy) : "1";
    const overUnc = cmpDecimal(unc, policy.maxUncertainty) > 0;
    const eligible = available && net != null && !overUnc;
    return {
      record: r,
      eligible,
      expectedUsefulNetReturn: net,
      uncertainty: unc,
      why: available ? why(r, policy, net, unc) : r.status.exclusionReasons,
    };
  });

  const eligible = scored.filter((s) => s.eligible);
  eligible.sort((a, b) => {
    const netCmp = cmpDecimal(b.expectedUsefulNetReturn, a.expectedUsefulNetReturn) || 0;
    if (netCmp !== 0) {
      const w = Number(policy.netReturnWeight);
      if (w === 0) {
        /* fall through to uncertainty */
      } else {
        return netCmp;
      }
    }
    const u = cmpDecimal(a.uncertainty, b.uncertainty) || 0;
    if (u !== 0) return u;
    return String(a.record.taskId).localeCompare(String(b.record.taskId));
  });

  return {
    policy,
    ranked: eligible,
    excluded: scored.filter((s) => !s.eligible),
    annotated,
  };
}
