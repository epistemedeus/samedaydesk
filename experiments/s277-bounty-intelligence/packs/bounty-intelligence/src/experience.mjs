import { emptyExperience } from "./record.mjs";
import { atomicDecimalString } from "./money.mjs";

/**
 * Self-reported experience is never promoted to verified completion or payout.
 * Contributor effort and paid reviews must be declared on the overlay or they stay unknown.
 */
export function normalizeExperience(raw = {}) {
  const base = emptyExperience();
  const self = raw.selfReported || {};
  const vc = raw.verifiedCompletion || {};
  const vp = raw.verifiedPayout || {};
  const effort = raw.contributorEffort || {};
  const review = raw.paidReview || {};

  base.selfReported = {
    present: Boolean(self.present || self.summary),
    summary: self.summary || null,
  };
  base.verifiedCompletion = {
    present: Boolean(vc.present && vc.evidence),
    evidence: vc.present && vc.evidence ? String(vc.evidence) : null,
  };
  base.verifiedPayout = {
    present: Boolean(vp.present && vp.evidence),
    evidence: vp.present && vp.evidence ? String(vp.evidence) : null,
  };
  const hours = effort.declared ? atomicDecimalString(effort.hours) : null;
  base.contributorEffort = {
    declared: Boolean(effort.declared),
    hours: hours,
    unknown: !effort.declared,
  };
  const amount = review.declared ? atomicDecimalString(review.amount) : null;
  base.paidReview = {
    declared: Boolean(review.declared),
    amount,
    unknown: !review.declared,
  };
  return base;
}

export function attachExperience(record, overlay) {
  if (!overlay) return record;
  const matches =
    overlay.taskId === record.taskId ||
    (overlay.adapter &&
      overlay.nativeId &&
      overlay.adapter === record.source.adapter &&
      String(overlay.nativeId) === String(record.source.nativeId));
  if (!matches) return record;
  return { ...record, experience: normalizeExperience(overlay.experience || overlay) };
}

export function separateSelfReportedFromVerified(experience) {
  const exp = normalizeExperience(experience);
  return {
    selfReportedOnly: exp.selfReported.present && !exp.verifiedCompletion.present && !exp.verifiedPayout.present,
    verifiedCompletion: exp.verifiedCompletion.present,
    verifiedPayout: exp.verifiedPayout.present,
    mixed: exp.selfReported.present && (exp.verifiedCompletion.present || exp.verifiedPayout.present),
    note: "Self-reported experience is not verified completion and not verified payout.",
    experience: exp,
  };
}
